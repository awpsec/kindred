import UIKit
import WebKit

/// The editor and its foreground controls live in the glass contentView.
/// The effect itself is above the retained conversation WKWebView.
@MainActor
final class NativeComposer: UIView, UITextViewDelegate {
    struct Model {
        struct Item {
            let id: String, kind: String, text: String, symbol: String
            let frame: CGRect, font: CGFloat
            let enabled: Bool, primary: Bool
            let image: Data?
            let title: String?, detail: String, badge: String
            let selected: Bool
            var inPopup: Bool { kind == "suggestion" || kind == "suggestion-label" }
        }
        let context: String, text: String, placeholder: String
        let frame: CGRect, editor: CGRect, scroller: CGRect
        let radius: CGFloat, font: CGFloat, line: CGFloat
        let inset: UIEdgeInsets
        let dark: Bool, editing: Bool
        let ack: Int
        let items: [Item]
        let selection: NSRange?
        let popupFrame:CGRect?, popupHeight:CGFloat, popupOffset:CGFloat
        let commandPopup: Bool, popupExclusions: [CGRect]
        init?(_ value: [String: Any]) {
            func rect(_ raw: Any?) -> CGRect? {
                guard let a=raw as? [Double],a.count==4,a.allSatisfy(\.isFinite),abs(a[0])<20000,abs(a[1])<20000,
                      (0...3000).contains(a[2]),(0...3000).contains(a[3]) else { return nil }
                return CGRect(x:a[0],y:a[1],width:a[2],height:a[3])
            }
            guard let context=value["context"] as? String,!context.isEmpty,context.count<512,
                  let text=value["text"] as? String,text.utf8.count<=256000,
                  let placeholder=value["placeholder"] as? String,placeholder.count<512,
                  let frame=rect(value["rect"]),frame.width>0,frame.height>0,frame.height<=1000,
                  let editor=rect(value["editor"]),let scroller=rect(value["scroller"]),
                  let radius=value["radius"] as? Double,radius.isFinite,(0...64).contains(radius),
                  let font=value["font"] as? Double,font.isFinite,(10...64).contains(font),
                  let line=value["line"] as? Double,line.isFinite,(10...100).contains(line),
                  let insets=value["inset"] as? [Double],insets.count==4,insets.allSatisfy({$0.isFinite && (0...64).contains($0)}),
                  let dark=value["dark"] as? Bool,let ack=value["ack"] as? Int,ack>=0,
                  let rows=value["items"] as? [[String:Any]],rows.count<=80 else { return nil }
            var items:[Item]=[]
            for row in rows {
                guard let id=row["id"] as? String,id.count<=80,let kind=row["kind"] as? String,["button","suggestion","suggestion-label","label","image"].contains(kind),
                      let text=row["text"] as? String,text.count<=4000,let symbol=row["symbol"] as? String,symbol.count<=64,
                      let r=rect(row["rect"]),let size=row["font"] as? Double,size.isFinite,(8...64).contains(size) else { return nil }
                let title=row["title"] as? String,detail=row["detail"] as? String ?? "",badge=row["badge"] as? String ?? ""
                guard (title?.count ?? 0)<=128,detail.count<=2000,badge.count<=128 else { return nil }
                items.append(Item(id:id,kind:kind,text:text,symbol:symbol,frame:r,font:size,enabled:row["enabled"] as? Bool != false,primary:row["primary"] as? Bool == true,image:(row["image"] as? String).flatMap { $0.count<=180000 ? Data(base64Encoded:$0) : nil },title:title,detail:detail,badge:badge,selected:row["selected"] as? Bool == true))
            }
            guard Set(items.map(\.id)).count==items.count else { return nil }
            if let range=value["selection"] as? [Int] {
                guard range.count==2,range.allSatisfy({$0>=0}),range[0]<=(text as NSString).length,range[1]<=(text as NSString).length-range[0] else { return nil }
                selection=NSRange(location:range[0],length:range[1])
            } else { selection=nil }
            if let popup=value["popup"] as? [String:Any] {
                guard let box=rect(popup["rect"]),let height=popup["height"] as? Double,height.isFinite,(0...20000).contains(height),
                      let offset=popup["offset"] as? Double,offset.isFinite,(0...20000).contains(offset) else { return nil }
                popupFrame=box;popupHeight=height;popupOffset=offset
                commandPopup=popup["commands"] as? Bool == true
                let regions=popup["exclusions"] as? [[Double]] ?? []
                guard regions.count<=16 else { return nil }
                let decoded=regions.compactMap { rect($0) }
                guard decoded.count==regions.count else { return nil }
                popupExclusions=decoded
            } else { popupFrame=nil;popupHeight=0;popupOffset=0;commandPopup=false;popupExclusions=[] }
            self.context=context;self.text=text;self.placeholder=placeholder;self.frame=frame;self.editor=editor;self.scroller=scroller
            self.radius=radius;self.font=font;self.line=line;inset=UIEdgeInsets(top:insets[0],left:insets[3],bottom:insets[2],right:insets[1])
            self.dark=dark;self.ack=ack;self.items=items;editing=value["editing"] as? Bool != false
        }
    }
    private class Button: UIButton {
        override func point(inside point:CGPoint,with event:UIEvent?)->Bool {
            bounds.insetBy(dx:-max(0,44-bounds.width)/2,dy:-max(0,44-bounds.height)/2).contains(point)
        }
    }
    private final class CommandButton: Button {
        let nameLabel=UILabel(),detailLabel=UILabel(),badgeLabel=UILabel()
        private let badgeBackground=UIView()
        var rowHeight:CGFloat { max(52,nameLabel.font.lineHeight+(detailLabel.isHidden ? 0:detailLabel.font.lineHeight+3)+20) }
        override init(frame:CGRect) {
            super.init(frame:frame);layer.cornerRadius=10
            badgeBackground.isUserInteractionEnabled=false;badgeBackground.layer.cornerRadius=5;badgeBackground.backgroundColor = .quaternarySystemFill;addSubview(badgeBackground)
            for label in [nameLabel,detailLabel,badgeLabel] { label.isUserInteractionEnabled=false;label.isAccessibilityElement=false;label.lineBreakMode = .byTruncatingTail;addSubview(label) }
            nameLabel.textColor = .label;detailLabel.textColor = .secondaryLabel;badgeLabel.textColor = .label
            badgeLabel.textAlignment = .center;badgeLabel.backgroundColor = .clear
            nameLabel.accessibilityIdentifier="kindred-command-title";detailLabel.accessibilityIdentifier="kindred-command-description";badgeLabel.accessibilityIdentifier="kindred-command-source"
        }
        required init?(coder:NSCoder) { fatalError("init(coder:) is unavailable") }
        func apply(_ item:Model.Item) {
            nameLabel.text=item.title;detailLabel.text=item.detail;badgeLabel.text=item.badge
            let size=max(14,item.font);nameLabel.font = .systemFont(ofSize:size,weight:.semibold);detailLabel.font = .systemFont(ofSize:max(12,size*0.9));badgeLabel.font = .systemFont(ofSize:min(18,max(10,size*0.75)))
            detailLabel.isHidden=item.detail.isEmpty;isSelected=item.selected;isEnabled=item.enabled
            accessibilityLabel=[item.title ?? item.text,item.detail,item.badge].filter {!$0.isEmpty}.joined(separator:", ")
            accessibilityIdentifier="kindred-native-composer-"+item.id;setNeedsLayout()
        }
        override var isSelected:Bool { didSet { updateFill() } }
        override var isHighlighted:Bool { didSet { updateFill() } }
        private func updateFill() { backgroundColor = isSelected || isHighlighted ? .secondarySystemFill : .clear }
        override func layoutSubviews() {
            super.layoutSubviews()
            let inset:CGFloat=12,badgeWidth=min(92,badgeLabel.sizeThatFits(bounds.size).width+12)
            badgeLabel.isHidden=bounds.width<290 || (badgeLabel.text ?? "").isEmpty
            let badgeSpace:CGFloat=badgeLabel.isHidden ? 0:badgeWidth+12
            let width=max(0,bounds.width-inset*2-badgeSpace),titleHeight=nameLabel.font.lineHeight,detailHeight=detailLabel.isHidden ? 0:detailLabel.font.lineHeight
            let top=max(8,(bounds.height-titleHeight-detailHeight-(detailLabel.isHidden ? 0:3))/2)
            nameLabel.frame=CGRect(x:inset,y:top,width:width,height:titleHeight)
            detailLabel.frame=CGRect(x:inset,y:top+titleHeight+3,width:width,height:detailHeight)
            badgeLabel.frame=CGRect(x:bounds.width-inset-badgeWidth,y:(bounds.height-24)/2,width:badgeWidth,height:24)
            badgeBackground.frame=badgeLabel.frame;badgeBackground.isHidden=badgeLabel.isHidden
        }
    }
    final class Editor: UITextView {
        var insertingNewline=false,hasSuggestions=false
        var key:((String)->Void)?
        var pastePayload: (([String:Any])->Void)?
        override func insertText(_ text:String) {
            if text=="\n",!insertingNewline,markedTextRange==nil { key?("Enter");return }
            super.insertText(text)
        }
        override func paste(_ sender: Any?) {
            if let image=UIPasteboard.general.image,let data=image.pngData(),data.count<=12_000_000 {
                pastePayload?(["image":data.base64EncodedString()]);return
            }
            if let text=UIPasteboard.general.string,text.count>=4000 || text.split(separator:"\n",omittingEmptySubsequences:false).count>=40 {
                pastePayload?(["paste":text]);return
            }
            super.paste(sender)
        }
        override var keyCommands: [UIKeyCommand]? {
            (super.keyCommands ?? [])+[UIKeyCommand(input:"\r",modifierFlags:.shift,action:#selector(newline))]+(hasSuggestions ? [UIKeyCommand.inputUpArrow,UIKeyCommand.inputDownArrow,UIKeyCommand.inputEscape,"\t"].map { UIKeyCommand(input:$0,modifierFlags:[],action:#selector(navigate(_:))) } : [])
        }
        @objc private func navigate(_ command:UIKeyCommand) {
            let keys=[UIKeyCommand.inputUpArrow:"ArrowUp",UIKeyCommand.inputDownArrow:"ArrowDown",UIKeyCommand.inputEscape:"Escape","\t":"Tab"]
            if let input=command.input,let value=keys[input] { key?(value) }
        }
        @objc private func newline() { insertingNewline=true;insertText("\n");insertingNewline=false }
    }
    let material=UIVisualEffectView(),popup=UIVisualEffectView()
    let editor=Editor(),placeholder=UILabel(),suggestionScroll=UIScrollView()
    private var lastPopupOffset:CGFloat?,lastPopupKey:String?
    private var commandListKey:String?,commandSelectionID:String?
    private var nodes:[String:UIView]=[:]
    private var contentKeys:[String:[String]]=[:]
    private var textStyleKey:[CGFloat]=[]
    private weak var web:WKWebView?
    private(set) var model:Model?
    private(set) var document:String?
    private(set) var revision=0
    private var applying=false,confirmed=false,desiredVisible=false,focusRequested=false
    private(set) var indicatorSurfaces=0
    private(set) var focusRequests=0
    private(set) var focusAccepted=false
    var command: (([String:Any])->Void)?

    override init(frame:CGRect) {
        super.init(frame:frame)
        isHidden=true
        if #available(iOS 26.0,*) {
            let glass=UIGlassEffect(style:.regular);glass.isInteractive=true;material.effect=glass
            popup.effect=UIGlassEffect(style:.regular)
        }
        addSubview(material);addSubview(popup);popup.isHidden=true
        popup.contentView.addSubview(suggestionScroll);suggestionScroll.alwaysBounceVertical=false
        editor.key={ [weak self] key in self?.emit("key",extra:["key":key]) }
        editor.backgroundColor = .clear;editor.textColor = .label;editor.delegate=self
        editor.textContainer.lineFragmentPadding=0;editor.autocorrectionType = .no;editor.spellCheckingType = .yes
        editor.smartQuotesType = .no;editor.smartDashesType = .no;editor.returnKeyType = .send
        editor.accessibilityIdentifier="kindred-native-composer-editor"
        placeholder.textColor = .placeholderText;placeholder.isUserInteractionEnabled=false;placeholder.isAccessibilityElement=false
        material.contentView.addSubview(editor);material.contentView.addSubview(placeholder)
        let tap=UITapGestureRecognizer(target:self,action:#selector(focusFromBackground));tap.cancelsTouchesInView=false
        material.addGestureRecognizer(tap)
        editor.pastePayload={ [weak self] payload in self?.emit("paste",extra:payload) }
    }
    required init?(coder:NSCoder) { fatalError("init(coder:) is unavailable") }
    override func hitTest(_ point:CGPoint,with event:UIEvent?)->UIView? {
        let hit=super.hitTest(point,with:event);return hit === self ? nil : hit
    }
    @objc private func focusFromBackground(_ tap:UITapGestureRecognizer) {
        guard let hit=tap.view?.hitTest(tap.location(in:tap.view),with:nil),!(hit is UIControl),!editor.isFirstResponder else { return }
        editor.becomeFirstResponder()
    }
    func prepare(_ next:Model?,document:String,in web:WKWebView) {
        guard let next else { applying=true;blur();applying=false;desiredVisible=false;confirmed=false;isHidden=true;return }
        // An older web acknowledgement must not remove/recreate suggestions
        // while a newer UIKit edit is still making its round trip.
        if self.document==document,model?.context==next.context,next.ack<revision { return }
        desiredVisible=true
        if self.document != document || model?.context != next.context {
            blur();revision=0;editor.undoManager?.removeAllActions()
        }
        self.document=document;self.web=web;model=next
        applying=true
        let textChanged=next.ack>=revision && editor.markedTextRange==nil && editor.text != next.text
        if textChanged {
            let selection=editor.selectedRange
            editor.text=next.text
            editor.selectedRange=next.selection ?? NSRange(location:min(selection.location,(next.text as NSString).length),length:0)
        }
        if editor.isEditable != next.editing { editor.isEditable=next.editing }
        let styleKey=[next.font,next.line,next.inset.top,next.inset.left,next.inset.bottom,next.inset.right]
        if textChanged || textStyleKey != styleKey {
            editor.font = .systemFont(ofSize:next.font);editor.textContainerInset=next.inset
            let paragraph=NSMutableParagraphStyle();paragraph.minimumLineHeight=next.line;paragraph.maximumLineHeight=next.line
            let attributes:[NSAttributedString.Key:Any]=[.font:editor.font!,.foregroundColor:UIColor.label,.paragraphStyle:paragraph]
            if editor.markedTextRange==nil { editor.textStorage.addAttributes(attributes,range:NSRange(location:0,length:editor.textStorage.length)) }
            editor.typingAttributes=attributes;textStyleKey=styleKey
        }
        editor.accessibilityLabel=next.placeholder;placeholder.text=next.placeholder;placeholder.font=editor.font
        placeholder.isHidden = !editor.text.isEmpty
        let appearance:UIUserInterfaceStyle=next.dark ? .dark : .light
        if overrideUserInterfaceStyle != appearance { overrideUserInterfaceStyle=appearance }
        applying=false
        let ids=Set(next.items.map(\.id))
        for id in Set(nodes.keys).subtracting(ids) { nodes.removeValue(forKey:id)?.removeFromSuperview();contentKeys[id]=nil }
        for item in next.items {
            let node:UIView
            if let old=nodes[item.id] { node=old }
            else if item.kind=="button" || item.kind=="suggestion" {
                let button:Button=item.title==nil ? Button(type:.system) : CommandButton(frame:.zero);let id=item.id
                button.addAction(UIAction { [weak self] _ in self?.emit("action",extra:["id":id]) },for:.primaryActionTriggered)
                nodes[id]=button;node=button
            } else if item.kind=="image" { let image=UIImageView();image.contentMode = .scaleAspectFill;image.clipsToBounds=true;nodes[item.id]=image;node=image
            } else { let label=UILabel();label.numberOfLines=0;label.textColor = .secondaryLabel;nodes[item.id]=label;node=label }
            let parent=item.inPopup ? suggestionScroll : material.contentView
            if node.superview !== parent { node.removeFromSuperview();parent.addSubview(node) }
            if let button=node as? CommandButton { button.apply(item) }
            else if let button=node as? UIButton {
                let key=[item.symbol,item.text,String(item.primary),String(Double(item.font)),String(next.dark)]
                if contentKeys[item.id] != key {
                var config=item.primary ? UIButton.Configuration.filled() : .plain()
                config.baseBackgroundColor = item.primary ? .label : .clear
                config.baseForegroundColor = item.primary ? .systemBackground : .label
                config.cornerStyle = .capsule;config.contentInsets = .zero
                if item.kind=="suggestion" { config.titleAlignment = .leading }
                if item.primary { config.background.backgroundInsets = NSDirectionalEdgeInsets(top:4,leading:4,bottom:4,trailing:4) }
                if item.symbol.isEmpty {
                    config.title=item.text;config.titleLineBreakMode = item.kind=="suggestion" ? .byWordWrapping : .byTruncatingTail
                    config.titleTextAttributesTransformer=UIConfigurationTextAttributesTransformer { attributes in
                        var attributes=attributes;attributes.font = .systemFont(ofSize:item.font);return attributes
                    }
                }
                else {
                    let symbol=UIImage(systemName:item.symbol,withConfiguration:UIImage.SymbolConfiguration(pointSize:20,weight:.regular))
                    // The filled primary circle needs opaque contrasting ink.
                    // Glass vibrancy must not turn its template glyph into
                    // the same color as that circle.
                    config.image=item.primary ? symbol?.withTintColor(next.dark ? .black : .white,renderingMode:.alwaysOriginal) : symbol
                }
                button.configuration=config;button.titleLabel?.numberOfLines=item.kind=="suggestion" ? 3 : 1;contentKeys[item.id]=key
                }
                button.contentHorizontalAlignment=item.kind=="suggestion" ? .leading : .center
                button.isEnabled=item.enabled;button.accessibilityLabel=item.text
                button.accessibilityIdentifier="kindred-native-composer-"+item.id
            } else if let image=node as? UIImageView { image.image=item.image.flatMap(UIImage.init(data:))
            } else if let label=node as? UILabel { label.text=item.text;label.font = .systemFont(ofSize:item.font) }
        }
        updateGeometry()
    }
    func updateGeometry() {
        guard let model,let web else { return }
        frame=superview?.bounds ?? web.bounds
        let shell=convert(model.frame,from:web)
        material.frame=shell
        if #available(iOS 26.0,*) { material.cornerConfiguration = .corners(radius:.fixed(model.radius));popup.cornerConfiguration = .corners(radius:.fixed(16)) }
        editor.frame=convert(model.editor,from:web).offsetBy(dx:-shell.minX,dy:-shell.minY)
        placeholder.frame=editor.frame.inset(by:model.inset)
        let suggestions=model.items.filter {$0.kind=="suggestion"}
        editor.hasSuggestions = !suggestions.isEmpty
        popup.isHidden = !model.items.contains(where: { $0.inPopup }) || model.popupFrame==nil
        popup.frame=model.popupFrame.map { convert($0,from:web) } ?? .zero
        if model.commandPopup {
            layoutCommands(model,shell:shell,web:web)
            updateScrollIndicator();return
        }
        commandListKey=nil;commandSelectionID=nil
        suggestionScroll.frame=popup.bounds;suggestionScroll.contentSize=CGSize(width:popup.bounds.width,height:model.popupHeight)
        let popupKey=model.context+"|"+(suggestions.first?.id ?? "")
        if lastPopupKey != popupKey || lastPopupOffset != model.popupOffset {
            suggestionScroll.contentOffset=CGPoint(x:0,y:model.popupOffset);lastPopupKey=popupKey;lastPopupOffset=model.popupOffset
        }
        for item in model.items {
            let target=convert(item.frame,from:web),parent=item.inPopup ? popup.frame : shell
            nodes[item.id]?.frame=target.offsetBy(dx:-parent.minX,dy:-parent.minY+(item.inPopup ? model.popupOffset : 0))
        }
        updateScrollIndicator()
    }
    private func layoutCommands(_ model:Model,shell:CGRect,web:WKWebView) {
        // Native rows keep name, description and source in separate slots.
        // The menu is anchored to the composer, not stretched across the chat.
        let viewport=convert(web.bounds,from:web),top=max(viewport.minY+8,window?.safeAreaInsets.top ?? 0)+4
        var width=max(0,min(440,shell.width-16)),x=max(viewport.minX+8,shell.minX+8),bottom=shell.minY-6
        x=min(x,max(viewport.minX+8,viewport.maxX-width-8))
        let rows=model.items.filter {$0.inPopup}
        var heights:[String:CGFloat]=[:],contentHeight:CGFloat=8
        for item in rows {
            let height=(nodes[item.id] as? CommandButton)?.rowHeight ?? (item.id=="commands-heading" ? 26:max(44,item.font*2+16))
            heights[item.id]=height;contentHeight+=height
        }
        contentHeight+=8
        var height=max(0,min(contentHeight,320,bottom-top))
        for exclusion in model.popupExclusions {
            let r=convert(exclusion,from:web),box=CGRect(x:x,y:bottom-height,width:width,height:height)
            guard box.intersects(r) else { continue }
            if r.height<=80,r.minY<=top+64 {
                height=max(0,min(height,bottom-r.maxY-8))
            } else if r.width>viewport.width*0.65 {
                let below=bottom-r.maxY-8
                if below>=96 { height=min(height,below) }
                else { bottom=min(bottom,r.minY-8);height=max(0,min(height,bottom-top)) }
            } else {
                let left=max(0,r.minX-8-x),right=max(0,x+width-r.maxX-8)
                if left>=right { width=left } else { x=r.maxX+8;width=right }
            }
        }
        popup.frame=CGRect(x:x,y:bottom-height,width:width,height:height)
        suggestionScroll.frame=popup.bounds;suggestionScroll.contentInsetAdjustmentBehavior = .never
        suggestionScroll.contentSize=CGSize(width:width,height:contentHeight)
        var y:CGFloat=8
        for item in model.items {
            if item.inPopup {
                let inset:CGFloat=item.title==nil ? 16:6
                nodes[item.id]?.frame=CGRect(x:inset,y:y,width:max(0,width-inset*2),height:heights[item.id] ?? 0)
                if let label=nodes[item.id] as? UILabel { label.font = .systemFont(ofSize:max(12,item.font),weight:item.id=="commands-heading" ? .medium:.regular) }
                y+=heights[item.id] ?? 0
            } else {
                nodes[item.id]?.frame=convert(item.frame,from:web).offsetBy(dx:-shell.minX,dy:-shell.minY)
            }
        }
        let key=model.context+"|"+rows.map(\.id).joined(separator:"|")
        if commandListKey != key { suggestionScroll.contentOffset = .zero;commandListKey=key }
        if let selected=model.items.first(where:{$0.selected}),selected.id != commandSelectionID,let node=nodes[selected.id] {
            suggestionScroll.scrollRectToVisible(node.frame.insetBy(dx:0,dy:-4),animated:false);commandSelectionID=selected.id
        }
    }
    /// Public UIScrollView API, matched to the actual reading viewport rather
    /// than a fabricated DOM scrollbar in the middle of the conversation.
    private func updateScrollIndicator() {
        guard let model,let web else { return }
        indicatorSurfaces=0
        var pending=web.scrollView.subviews
        while let view=pending.popLast() {
            pending.append(contentsOf:view.subviews)
            guard let scroll=view as? UIScrollView else { continue }
            let rect=web.convert(scroll.bounds,from:scroll)
            guard abs(rect.width-model.scroller.width)<3,abs(rect.height-model.scroller.height)<3,abs(rect.minX-model.scroller.minX)<3,abs(rect.minY-model.scroller.minY)<3 else { continue }
            indicatorSurfaces+=1
            scroll.verticalScrollIndicatorInsets.bottom=max(0,rect.maxY-model.frame.minY+6)
        }
    }
    func reveal(document:String) { guard desiredVisible,self.document==document,model != nil else { return };confirmed=true;isHidden=false;if focusRequested { activateEditor() } }
    func focus(document:String,context:String) {
        guard self.document==document,model?.context==context else { return }
        focusRequested=true;focusRequests+=1
        if confirmed { activateEditor() }
    }
    private func activateEditor() {
        // Leave WebKit's script-message/focus transaction before asking UIKit
        // to present its own keyboard. Revalidate after any pane/document move.
        let expectedDocument=document,expectedContext=model?.context
        DispatchQueue.main.async { [weak self] in
            guard let self,self.focusRequested,self.confirmed,self.desiredVisible,
                  self.document==expectedDocument,self.model?.context==expectedContext else { return }
            self.focusAccepted=self.editor.isFirstResponder || self.editor.becomeFirstResponder()
            if self.focusAccepted { self.focusRequested=false }
        }
    }
    func blur() { focusRequested=false;editor.resignFirstResponder() }
    func reset() {
        applying=true;blur();applying=false
        isHidden=true;confirmed=false;desiredVisible=false;model=nil;document=nil;revision=0;indicatorSurfaces=0
        nodes.values.forEach {$0.removeFromSuperview()};nodes.removeAll();contentKeys.removeAll();textStyleKey=[];lastPopupOffset=nil;lastPopupKey=nil
        commandListKey=nil;commandSelectionID=nil
    }
    func textViewDidChange(_ textView:UITextView) {
        guard !applying else { return };revision+=1;placeholder.isHidden = !textView.text.isEmpty
        emit("edit")
    }
    func textViewDidChangeSelection(_ textView:UITextView) { if !applying,confirmed { emit("selection") } }
    func textViewDidBeginEditing(_ textView:UITextView) { if !applying { emit("focus",extra:["focused":true]) } }
    func textViewDidEndEditing(_ textView:UITextView) { if !applying { emit("focus",extra:["focused":false]) } }
    func textView(_ textView:UITextView,shouldChangeTextIn range:NSRange,replacementText text:String)->Bool {
        if text=="\n",!editor.insertingNewline,textView.markedTextRange==nil { emit("key",extra:["key":"Enter"]);return false };return true
    }
    func emit(_ action:String,extra:[String:Any]=[:]) {
        guard let model,let document,confirmed else { return }
        var value:[String:Any]=["action":action,"document":document,"context":model.context,"revision":revision,"text":editor.text ?? "",
            "selection":[editor.selectedRange.location,editor.selectedRange.length],"composing":editor.markedTextRange != nil]
        value.merge(extra,uniquingKeysWith:{$1});command?(value)
    }
}
