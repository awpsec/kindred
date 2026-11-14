import UIKit

/// Bounded presentation only. The opaque key is checked again by the retained
/// page before it invokes its existing, correctly owned cancellation handler.
struct NativeCollaborationStatus: Equatable {
    let key: String
    let label: String
    let kind: String
    let canInterrupt: Bool

    init?(_ body: [String: Any]) {
        guard let key = body["key"] as? String, !key.isEmpty, key.count <= 8192,
              let label = body["label"] as? String, !label.isEmpty, label.count <= 200,
              let kind = body["kind"] as? String, ["waiting", "queued", "working"].contains(kind),
              let canInterrupt = body["canInterrupt"] as? Bool else { return nil }
        self.key = key; self.label = label; self.kind = kind; self.canInterrupt = canInterrupt
    }

    @MainActor
    func menu(interrupt: @escaping (String) -> Void) -> UIMenu {
        UIMenu(title: label, children: [UIAction(title: "Interrupt", image: UIImage(systemName: "xmark"),
            attributes: canInterrupt ? .destructive : [.destructive, .disabled]) { _ in interrupt(key) }])
    }
}
