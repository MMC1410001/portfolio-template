// Square-crops a source headshot for the circular hero avatar (`profile.avatar`).
//
// The avatar is a *circle*, so a crop tuned by eye on a square preview loses its corners and
// reads as a clipped head. Frame it with the hair well inside the top edge and the shoulders
// carrying the bottom, then let `object-fit:cover` do nothing.
//
// Regenerate public/avatar.jpg. Do not hand-edit it:
//
//   swift scripts/avatar-crop.swift assets/alex-professional-headshot.png \
//     public/avatar.jpg 343 0 1280 1280 720
//
// Args: <src> <dst> <x> <y> <width> <height> <output-size>. x/y/width/height are pixels in the
// source (2048x2048); the crop must be square, and the output is a square JPEG at <output-size>.
import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

let a = CommandLine.arguments
guard a.count == 8, let x = Int(a[3]), let y = Int(a[4]), let w = Int(a[5]), let h = Int(a[6]), let out = Int(a[7]) else {
 FileHandle.standardError.write("usage: avatar-crop.swift <src> <dst> <x> <y> <w> <h> <size>\n".data(using: .utf8)!)
 exit(2)
}
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let cropped = img.cropping(to: CGRect(x: x, y: y, width: w, height: h))!
let ctx = CGContext(data: nil, width: out, height: out, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.interpolationQuality = .high
ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: out, height: out))
let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dst, ctx.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.88] as CFDictionary)
CGImageDestinationFinalize(dst)
