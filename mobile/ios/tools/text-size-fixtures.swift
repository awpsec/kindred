// Compile with KindredCore source files; emits their actual JavaScript for the
// Node regression harness, without requiring WebKit or duplicating that script.
import Foundation

@main
enum TextSizeFixtures {
    static func main() throws {
        let origin = try ServerAddress.normalize("https://kindred.example.com")
        let scripts = [
            "bootstrap": WebBootstrap.documentStartScript(origin: origin,
                token: String(repeating: "ab12", count: 16), profileID: "p-1"),
            "small": WebTextSize.script(origin: origin, scale: 14.0 / 17),
            "large": WebTextSize.script(origin: origin, scale: 1),
            "accessibility": WebTextSize.script(origin: origin, scale: 53.0 / 17),
            "invalid": WebTextSize.script(origin: origin, scale: .nan),
            "infinite": WebTextSize.script(origin: origin, scale: .infinity),
            "negative": WebTextSize.script(origin: origin, scale: -2),
        ]
        let data = try JSONSerialization.data(withJSONObject: scripts, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    }
}
