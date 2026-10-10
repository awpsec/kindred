// Ephemeral-runner writer only. Never reads or logs an existing pasteboard.
import AppKit
import Foundation
let args=CommandLine.arguments
if args.count != 2 || !["text","empty","nontext"].contains(args[1]) {fputs("Select text, empty or nontext\n",stderr);exit(2)}
let board=NSPasteboard.general
board.clearContents()
switch args[1] {
case "text":
 let data=FileHandle.standardInput.readDataToEndOfFile()
 guard data.count<=64000,let text=String(data:data,encoding:.utf8),text.utf16.count<=16000 else {fputs("Invalid synthetic text input\n",stderr);exit(2)}
 guard board.setString(text,forType:.string) else {fputs("Synthetic pasteboard write failed\n",stderr);exit(1)}
case "nontext":
 guard board.setData(Data([1,2,3]),forType:NSPasteboard.PasteboardType("org.kindred.smoke.synthetic-nontext")) else {exit(1)}
default: break
}
print("Synthetic pasteboard written")
