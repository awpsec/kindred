import Foundation

/// Bounded descriptions of retained web controls, never executable commands.
/// Root and document identities invalidate native menus after navigation.
struct DuoArtifactControls: Equatable {
    struct Action: Identifiable, Equatable {
        let id: String
        let label: String
        let enabled: Bool
        init?(_ row:[String:Any]) {
            guard let id=row["id"] as? String,["edit","download","refresh"].contains(id),
                  let label=row["label"] as? String,!label.isEmpty,label.count<=100,
                  let enabled=row["enabled"] as? Bool else{return nil}
            self.id=id;self.label=label;self.enabled=enabled
        }
    }
    struct Choice: Identifiable, Equatable {
        var id:String{value}
        let value:String
        let label:String
        let enabled:Bool
        init?(_ row:[String:Any]) {
            guard let value=row["value"] as? String,value.count<=96,
                  let label=row["label"] as? String,!label.isEmpty,label.count<=100,
                  let enabled=row["enabled"] as? Bool else{return nil}
            self.value=value;self.label=label;self.enabled=enabled
        }
    }
    struct Filter: Identifiable, Equatable {
        let id:String
        let label:String
        let value:String
        let options:[Choice]
        init?(_ row:[String:Any]) {
            guard let id=row["id"] as? String,["type","sort"].contains(id),
                  let label=row["label"] as? String,!label.isEmpty,label.count<=100,
                  let value=row["value"] as? String,value.count<=96,
                  let rows=row["options"] as? [[String:Any]],!rows.isEmpty,rows.count<=20 else{return nil}
            let options=rows.compactMap(Choice.init)
            guard options.count==rows.count,Set(options.map(\.value)).count==options.count,
                  options.contains(where:{$0.value==value}) else{return nil}
            self.id=id;self.label=label;self.value=value;self.options=options
        }
    }
    let root:String
    let owner:String?
    let zoom:String?
    let actions:[Action]
    let filters:[Filter]
    init?(_ row:[String:Any]) {
        guard let root=row["root"] as? String,UUID(uuidString:root) != nil,
              let actionRows=row["actions"] as? [[String:Any]],actionRows.count<=3,
              let filterRows=row["filters"] as? [[String:Any]],filterRows.count<=2 else{return nil}
        let owner=row["owner"] as? String
        guard owner.map({UUID(uuidString:$0) != nil}) ?? (row["owner"] is NSNull),
              row["zoom"] is NSNull || row["zoom"] is String else{return nil}
        let zoom=row["zoom"] as? String
        if let zoom {
            guard zoom.range(of:"^[0-9]{1,3}%$",options:.regularExpression) != nil,
                  let amount=Int(zoom.dropLast()),(1...300).contains(amount),owner != nil else{return nil}
        }
        let actions=actionRows.compactMap(Action.init),filters=filterRows.compactMap(Filter.init)
        guard actions.count==actionRows.count,filters.count==filterRows.count,
              Set(actions.map(\.id)).count==actions.count,Set(filters.map(\.id)).count==filters.count,
              actions.isEmpty || owner != nil else{return nil}
        self.root=root;self.owner=owner;self.zoom=zoom;self.actions=actions;self.filters=filters
    }
}
