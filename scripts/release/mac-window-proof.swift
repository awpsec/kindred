import Foundation
import AppKit
import CoreGraphics
import Vision

// Capture only windows belonging to the test process. No Accessibility changes.
let pid = Int32(CommandLine.arguments[1])!
let folder = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let requestedTitle = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : nil
var proof: [[String: Any]] = []
for window in windows {
    if let requestedTitle, (window[kCGWindowName as String] as? String) != requestedTitle { continue }
    guard (window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid,
          let id = window[kCGWindowNumber as String] as? UInt32,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          (bounds["Width"] as? Double ?? 0) > 160,
          (bounds["Height"] as? Double ?? 0) > 25 else { continue }
    let screenshot = folder.appendingPathComponent("window-\(id).png")
    let task = Process(); task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    task.arguments = ["-x", "-l", String(id), screenshot.path]
    try task.run(); task.waitUntilExit()
    guard task.terminationStatus == 0 else { throw NSError(domain: "Window capture failed", code: 1) }
    let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate
    try VNImageRequestHandler(url: screenshot).perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    proof.append(["window_id": id, "title": window[kCGWindowName as String] as? String ?? "", "bounds": bounds, "image": screenshot.lastPathComponent, "text": text])
}
guard !proof.isEmpty else { throw NSError(domain: "No visible test-app window", code: 2) }
let data = try JSONSerialization.data(withJSONObject: proof, options: [.prettyPrinted, .sortedKeys])
try data.write(to: folder.appendingPathComponent("windows.json"))
print(String(data: data, encoding: .utf8)!)
