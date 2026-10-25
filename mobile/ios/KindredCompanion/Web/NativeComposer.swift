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
                items.append(Item(id:id,kind:kind,text:text,symbol:symbol,frame:r,font:size,enabled:row["enabled"] as? Bool != false,primary:row["primary"] as? Bool == true,image:(row["image"] as? String).flatMap { $0.count<=180000 ? Data(base64Encoded:$0) : nil }))
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
            } else { popupFrame=nil;popupHeight=0;popupOffset=0 }
            self.context=context;self.text=text;self.placeholder=placeholder;self.frame=frame;self.editor=editor;self.scroller=scroller
            self.radius=radius;self.font=font;self.line=line;inset=UIEdgeInsets(top:insets[0],left:insets[3],bottom:insets[2],right:insets[1])
            self.dark=dark;self.ack=ack;self.items=items;editing=value["editing"] as? Bool != false
        }
    }
    private final class Button: UIButton {
        override func point(inside point:CGPoint,with event:UIEvent?)->Bool {
            bounds.insetBy(dx:-max(0,44-bounds.width)/2,dy:-max(0,44-bounds.height)/2).contains(point)
        }
    }
    final class Editor: UITextView {
        var insertingNewline=false,hasSuggestions=false
        var key:((String)->Void)?
        var pastePayload: (([String:Any])->Void)?
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
                let button=Button(type:.system);let id=item.id
                button.addAction(UIAction { [weak self] _ in self?.emit("action",extra:["id":id]) },for:.primaryActionTriggered)
                nodes[id]=button;node=button
            } else if item.kind=="image" { let image=UIImageView();image.contentMode = .scaleAspectFill;image.clipsToBounds=true;nodes[item.id]=image;node=image
            } else { let label=UILabel();label.numberOfLines=0;label.textColor = .secondaryLabel;nodes[item.id]=label;node=label }
            let parent=item.inPopup ? suggestionScroll : material.contentView
            if node.superview !== parent { node.removeFromSuperview();parent.addSubview(node) }
            if let button=node as? UIButton {
                let key=[item.symbol,item.text,String(item.primary),String(Double(item.font)),String(next.dark)]
                if contentKeys[item.id] != key {
                var config=item.primary ? UIButton.Configuration.filled() : .plain()
                config.baseBackgroundColor = item.primary ? .label : .clear
                config.baseForegroundColor = item.primary ? .systemBackground : .label
                config.cornerStyle = .capsule;config.contentInsets = .zero
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
