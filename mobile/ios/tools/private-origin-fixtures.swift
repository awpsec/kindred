// Emit the real native bootstrap and routes for an offline JavaScript boundary check.
import Foundation

@main
enum PrivateOriginFixtures {
    static func main() throws {
        let origins = ["http://192.168.1.20:9444", "http://[fd7a::5]:9444", "https://192.168.1.20:9444"]
        let fixtures = try origins.map { value -> [String: String] in
            let origin = try ServerAddress.normalize(value)
            return ["origin": origin.serialized,
                    "bootstrap": WebBootstrap.documentStartScript(origin: origin,
                        token: String(repeating: "ab12", count: 16), profileID: "p-1"),
                    "chatURL": KindredRoutes.chatURL(origin: origin, chatID: "dm-abc", eventID: "42")!.absoluteString]
        }
        let data = try JSONSerialization.data(withJSONObject: fixtures, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    }
}
