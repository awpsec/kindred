import Foundation
import AppKit
import CoreGraphics
// Only the owned application PID. Never requests event-posting permission.
let a=CommandLine.arguments
precondition(a.count==9)
let pid=Int32(a[1])!,kind=a[2],x=Double(a[3])!,y=Double(a[4])!,tx=Double(a[5])!,ty=Double(a[6])!,vw=Double(a[7])!,vh=Double(a[8])!
precondition(["click","drag"].contains(kind) && vw>0 && vh>0)
guard CGPreflightPostEventAccess() else {fatalError("NATIVE_INPUT_GAP: existing macOS event-posting permission is absent")}
guard let app=NSRunningApplication(processIdentifier:pid) else {fatalError("Owned native process is absent")}
app.activate(options:[.activateIgnoringOtherApps])
for _ in 0..<20 {if app.isActive {break};RunLoop.current.run(until:Date(timeIntervalSinceNow:0.05))}
precondition(app.isActive,"Owned app could not become foreground")
let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
let candidates=windows.filter{($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==pid && ($0[kCGWindowLayer as String] as? NSNumber)?.intValue==0}
precondition(candidates.count==1,"Expected exactly one owned visible native window")
let b=candidates[0][kCGWindowBounds as String] as! [String:Double]
let w=b["Width"]!,h=b["Height"]!,ox=b["X"]!,oy=b["Y"]!
precondition(abs(w-vw)<5 && h>=vh-2 && h-vh<120,"Unexpected native content geometry")
func point(_ px:Double,_ py:Double)->CGPoint {precondition(px>=0 && py>=0 && px<vw && py<vh);return CGPoint(x:ox+px,y:oy+h-vh+py)}
func post(_ type:CGEventType,_ p:CGPoint){CGEvent(mouseEventSource:nil,mouseType:type,mouseCursorPosition:p,mouseButton:.left)!.post(tap:.cghidEventTap)}
let startPoint=point(x,y),endPoint=point(tx,ty)
post(.mouseMoved,startPoint);Thread.sleep(forTimeInterval:0.05);post(.leftMouseDown,point(x,y))
if kind=="drag" {for i in 1...16 {post(.leftMouseDragged,point(x+(tx-x)*Double(i)/16,y+(ty-y)*Double(i)/16));Thread.sleep(forTimeInterval:0.015)}}
post(.leftMouseUp,endPoint);print("{\"passed\":true,\"nativeInput\":true}")
