// Rasterizes the first page of a PDF to a PNG of an exact pixel width, on a white background (macOS CoreGraphics).
// Used by drawio.py for tall diagrams: draw.io's own PNG export cuts images off at about 8,600 pixels in height,
// so these are exported as vector PDF and rasterized here instead.
//
// Usage: swift pdf_to_png.swift <in.pdf> <out.png> <width-px>
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4, let width = Double(args[3]),
      let doc = CGPDFDocument(URL(fileURLWithPath: args[1]) as CFURL), let page = doc.page(at: 1) else {
  print("usage: swift pdf_to_png.swift <in.pdf> <out.png> <width-px>")
  exit(1)
}
let box = page.getBoxRect(.cropBox)
let scale = width / Double(box.width)
let w = Int(width.rounded()), h = Int((Double(box.height) * scale).rounded())
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.interpolationQuality = .high
ctx.scaleBy(x: scale, y: scale)
ctx.translateBy(x: -box.origin.x, y: -box.origin.y)
ctx.drawPDFPage(page)
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, [kCGImagePropertyDPIWidth: 300, kCGImagePropertyDPIHeight: 300] as CFDictionary)
guard CGImageDestinationFinalize(dest) else { print("could not write \(args[2])"); exit(1) }
print("\(w) x \(h)")
