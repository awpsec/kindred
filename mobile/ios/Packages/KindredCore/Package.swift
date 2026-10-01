// swift-tools-version:5.9
import PackageDescription

// Platform-neutral rules for the iOS companion: server addresses, origin and
// navigation policy, session/bridge parsing, API requests, push payloads and
// account metadata. Everything here builds with Foundation alone so it can be
// tested with `swift test` without a simulator.
let package = Package(
    name: "KindredCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KindredCore", targets: ["KindredCore"]),
    ],
    targets: [
        .target(name: "KindredCore"),
        .testTarget(name: "KindredCoreTests", dependencies: ["KindredCore"]),
    ]
)
