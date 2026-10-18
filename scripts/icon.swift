import AppKit
import Foundation
let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
NSColor(calibratedRed: 0.035, green: 0.065, blue: 0.115, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 36, y: 36, width: 952, height: 952), xRadius: 206, yRadius: 206).fill()
let panel = NSBezierPath(roundedRect: NSRect(x: 87, y: 87, width: 850, height: 850), xRadius: 159, yRadius: 159)
NSColor(calibratedRed: 0.11, green: 0.28, blue: 0.59, alpha: 1).setFill()
panel.fill()
NSColor(calibratedRed: 0.20, green: 0.39, blue: 0.70, alpha: 1).setStroke()
for x in stride(from: CGFloat(220), through: CGFloat(820), by: 120) {
  let p = NSBezierPath(); p.lineWidth = 2; p.move(to: NSPoint(x: x, y: 190)); p.line(to: NSPoint(x: x, y: 834)); p.stroke()
}
for y in stride(from: CGFloat(220), through: CGFloat(820), by: 120) {
  let p = NSBezierPath(); p.lineWidth = 2; p.move(to: NSPoint(x: 190, y: y)); p.line(to: NSPoint(x: 834, y: y)); p.stroke()
}
NSColor(calibratedRed: 0.45, green: 0.94, blue: 0.80, alpha: 1).setFill()
for (x, y, h) in [(260.0,270.0,140.0),(410.0,430.0,160.0),(560.0,380.0,100.0),(710.0,580.0,170.0)] {
  NSBezierPath(roundedRect: NSRect(x: x, y: y, width: 56, height: h), xRadius: 9, yRadius: 9).fill()
  NSColor(calibratedRed: 0.45, green: 0.94, blue: 0.80, alpha: 1).setStroke()
  let wick = NSBezierPath();wick.lineWidth = 7;wick.move(to: NSPoint(x: x+28,y:y-40));wick.line(to:NSPoint(x:x+28,y:y+h+40));wick.stroke()
}
let line = NSBezierPath();line.lineWidth = 28;line.lineCapStyle = .round;line.lineJoinStyle = .round
line.move(to:NSPoint(x:230,y:400));line.line(to:NSPoint(x:430,y:657));line.line(to:NSPoint(x:595,y:544));line.line(to:NSPoint(x:796,y:804))
NSColor.white.setStroke();line.stroke()
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
