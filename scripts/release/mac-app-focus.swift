import Foundation
import AppKit
import CoreGraphics

let action = CommandLine.arguments[1]
let pid = Int32(CommandLine.arguments[2])!
guard let app = NSRunningApplication(processIdentifier: pid) else {
    fatalError("Test application is not running")
}
if action == "foreground" {
    app.activate(options: [.activateIgnoringOtherApps])
} else if action == "background" {
    guard let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first else {
        fatalError("Finder is unavailable in this GUI session")
    }
    finder.activate(options: [.activateIgnoringOtherApps])
} else if action == "move" {
    let point = CGPoint(x: Double(CommandLine.arguments[3])!, y: Double(CommandLine.arguments[4])!)
    guard CGPreflightPostEventAccess() else { fatalError("Native hover test requires existing event-posting permission") }
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
} else if action == "click" {
    let point = CGPoint(x: Double(CommandLine.arguments[3])!, y: Double(CommandLine.arguments[4])!)
    guard CGPreflightPostEventAccess() else { fatalError("Native click test requires existing event-posting permission") }
    for type in [CGEventType.leftMouseDown, .leftMouseUp] {
        CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    }
}
if action != "status" && action != "move" {
    for _ in 0..<30 {
        if app.isActive == (action != "background") { break }
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
    }
    precondition(app.isActive == (action != "background"), "Unexpected application focus")
}
print("{\"active\":\(app.isActive),\"canPostEvents\":\(CGPreflightPostEventAccess())}")
