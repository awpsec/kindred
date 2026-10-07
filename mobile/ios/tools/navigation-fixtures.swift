import Foundation

let origin = try ServerAddress.normalize("https://kindred.example")
let id = UUID(uuidString: "12345678-1234-1234-1234-123456789abc")!
var scripts: [String: String] = [:]
for phase in [WebEdgeBack.Phase.begin, .update, .finish, .cancel] {
    scripts[phase.rawValue] = WebEdgeBack.script(origin: origin, phase: phase, id: id,
        revision: 42, progress: phase == .update ? .nan : 0.35, commit: phase == .finish, startXFraction: 0.025, startYFraction: 0.5)
}
let data = try JSONSerialization.data(withJSONObject: scripts, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
