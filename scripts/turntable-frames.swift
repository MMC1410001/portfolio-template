// Turntable frame builder, register a filmed orbit into a scrubable sequence.
//
// Source: `assets/turntable-orbit/ezgif-frame-001..300.jpg`, 300 stills of one
// seated pose filmed all the way round against a plain studio wall. Kept out of
// `public/` because the sheet itself is never served.
//
// This replaced a contact-sheet pipeline (see git history). That version cut 20
// panels out of one AI-rendered sheet, and every complaint about the result
// traces back to the source rather than the code: 20 panels is 18 degrees a
// step, which reads as stepping however you blend it, and panels rendered
// independently are soft and never quite agree about the man's face. A filmed
// orbit fixes both. It is sharp, it is the same person in every frame, and
// there are 300 of them to choose from.
//
//   1. sample `count` frames evenly around the 300 (the loop closes: frame 300
//      is the same front view as frame 001, so the last sample stops short of
//      it and the cycle wraps with no seam),
//   2. key the studio wall with Vision's foreground-instance matte,
//   3. **anchor on the person, not the silhouette** (see below),
//   4. fade the canvas edges so a desk that runs off the frame dissolves
//      instead of ending in a hard vertical cut,
//   5. encode AVIF.
//
// ── Anchoring, and why a filmed orbit still needs it ───────────────────────
// It is tempting to trust the camera: it filmed a real orbit, so surely a fixed
// crop preserves the registration the footage already has. It does not. The
// camera orbits the *desk*, not the man, and it dollies as it goes. Measured
// across the 300 frames, the neck travels from x=429 to x=799, a 370px swing
// in a 1280px frame, and the upper body ranges from 376 to 522 pixels tall, a
// 39% change in apparent size. Cropped fixed, the figure slides across the
// stage and pulses.
//
// So the person is measured directly, exactly as the old pipeline did and for
// the same reason. `VNDetectHumanRectanglesRequest` with `upperBodyOnly` gives
// a head-to-hips box whose height is a real measure of apparent subject size,
// and `VNDetectHumanBodyPoseRequest` gives the neck joint, the most stable
// landmark across a turn, it barely moves while shoulders, arms and legs swing
// through 360 degrees. Every frame is scaled so the upper body is the same
// height and translated so the neck lands on the same canvas point.
//
// The desk and chair still move around the locked figure. That is not a defect
// to fix: it is what an orbiting camera does.
//
// ── Why the measurements are smoothed ──────────────────────────────────────
// This is the one thing the contact-sheet pipeline never had to deal with, and
// it is the difference between a locked figure and a vibrating one. Vision's
// box height jitters by ±10px frame to frame on footage this close together, 
// noise, not motion. Applied raw, that noise becomes a per-frame scale wobble,
// and where 18-degree steps hid it, 6-degree steps put consecutive frames side
// by side where the eye reads the difference as a shimmer.
//
// Each measured series (upper-body height, neck x, neck y) is therefore
// low-passed with a circular Gaussian (`--sigma`, default 2 frames) before any
// of it is applied. Circular because the sequence is a loop: frame 0's
// neighbours include the last frame. The script prints raw and smoothed spreads
// so you can see how much was noise.
//
// A frame where Vision finds nothing is not dropped, dropping one would leave
// a double-width angular step. Its measurements are interpolated from the
// nearest neighbours that did resolve, which is safe precisely because the
// series is smooth by then anyway.
//
// Usage (the invocation that built the committed frames):
//   swift scripts/turntable-frames.swift assets/turntable-orbit public/turntable \
//     60 700 560 0.53 0.32
//
// Arguments after the two paths: how many frames to emit, canvas width, canvas
// height, the fraction of canvas height the upper body should occupy, and the
// fraction from the top at which the neck sits. `--sigma <n>` overrides the
// smoothing width.
//
// Frame count is a memory budget, not a free dial. Every frame is decoded and
// held for the whole scroll, so 60 frames at 700x560 is ~94MB of image memory
// on the client; `FigureTurntable` halves the count again on narrow viewports.
// Raising it buys smoothness the cross-fade is already supplying and costs
// memory nothing gives back.
//
// macOS only, and deliberately: the matte, the person box and the pose all
// come from Vision, and AVIF encoding from ImageIO. No dependency, no service,
// no API key. It runs on a developer's Mac when frames change, never in CI and
// never at build time; the committed output is what ships.
import Foundation
import CoreImage
import ImageIO
import Vision

var args = CommandLine.arguments
var sigma = 2.0
if let flag = args.firstIndex(of: "--sigma"), flag + 1 < args.count {
 sigma = Double(args[flag+1]) ?? sigma
 args.removeSubrange(flag...(flag+1))
}
guard args.count >= 8 else { fputs("see usage in the header\n", stderr); exit(2) }
func num(_ i: Int) -> Double { Double(args[i])! }
let srcDir = args[1], outDir = args[2]
let count = Int(args[3])!
let canvasW = num(4), canvasH = num(5)
let upperFraction = num(6), neckFraction = num(7)

let ctx = CIContext()
func render(_ img: CIImage) -> CGImage? {
 ctx.createCGImage(img, from: img.extent, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
}

/// Every source still, in shooting order. The names are one-based and padded to
/// three digits by whatever produced them; globbing rather than assuming the
/// range keeps this working if the sequence is ever re-cut.
let sources = ((try? FileManager.default.contentsOfDirectory(atPath: srcDir)) ?? [])
 .filter { $0.hasSuffix(".jpg") }.sorted()
guard sources.count >= count else { fputs("\(srcDir): \(sources.count) frames, need \(count)\n", stderr); exit(1) }
// Evenly around the circle, stopping short of the wrap: the last still is the
// same front view as the first, so sampling it would emit the seam twice.
let picks = (0..<count).map { sources[Int(Double($0) * Double(sources.count) / Double(count))] }
print("sampling \(count) of \(sources.count): \(picks.first!) ... \(picks.last!)")

/// What Vision found in one still, in source pixels with a bottom-left origin.
struct Measure { var upper: Double; var neckX: Double; var neckY: Double; var found: Bool }

var measures: [Measure] = []
var loaded: [CIImage] = []
for name in picks {
 guard let src = CIImage(contentsOf: URL(fileURLWithPath: "\(srcDir)/\(name)")),
       let cg = ctx.createCGImage(src, from: src.extent) else {
  fputs("\(name): unreadable\n", stderr); exit(1)
 }
 loaded.append(src)
 let w = src.extent.width, h = src.extent.height
 let handler = VNImageRequestHandler(cgImage: cg, options: [:])
 let upperBody = VNDetectHumanRectanglesRequest(); upperBody.upperBodyOnly = true
 let pose = VNDetectHumanBodyPoseRequest()
 try? handler.perform([upperBody, pose])
 guard let box = (upperBody.results ?? []).max(by: { $0.confidence < $1.confidence }) else {
  fputs("\(name): no subject, will interpolate\n", stderr)
  measures.append(Measure(upper: 0, neckX: 0, neckY: 0, found: false)); continue
 }
 // The box's own top edge is a usable neck stand-in; the pose joint is better
 // when it resolves, which on this footage is almost always.
 var neck = CGPoint(x: box.boundingBox.midX * w, y: (box.boundingBox.minY + box.boundingBox.height*0.86) * h)
 if let observation = pose.results?.first, let joints = try? observation.recognizedPoints(.all),
    let found = joints[.neck], found.confidence > 0.2 {
  neck = CGPoint(x: found.location.x * w, y: found.location.y * h)
 }
 measures.append(Measure(upper: box.boundingBox.height * h, neckX: neck.x, neckY: neck.y, found: true))
}

// Fill the gaps before smoothing, or a zero would be averaged in as a value.
for i in measures.indices where !measures[i].found {
 var back = i, forward = i
 while !measures[(back + measures.count) % measures.count].found { back -= 1 }
 while !measures[forward % measures.count].found { forward += 1 }
 let a = measures[(back + measures.count) % measures.count], b = measures[forward % measures.count]
 let t = Double(i - back) / Double(forward - back)
 measures[i] = Measure(upper: a.upper + (b.upper-a.upper)*t, neckX: a.neckX + (b.neckX-a.neckX)*t,
                       neckY: a.neckY + (b.neckY-a.neckY)*t, found: true)
}

/// Circular Gaussian low-pass. The sequence is a loop, so the first frame's
/// neighbourhood runs off the end into the last.
func smooth(_ series: [Double], _ sigma: Double) -> [Double] {
 if sigma <= 0 { return series }
 let reach = max(1, Int((sigma * 3).rounded()))
 let weights = (-reach...reach).map { exp(-Double($0*$0) / (2*sigma*sigma)) }
 let total = weights.reduce(0, +)
 return series.indices.map { i in
  var sum = 0.0
  for (k, offset) in (-reach...reach).enumerated() {
   sum += weights[k] * series[((i + offset) % series.count + series.count) % series.count]
  }
  return sum / total
 }
}
func spread(_ s: [Double]) -> String {
 let steps = s.indices.map { abs(s[($0+1) % s.count] - s[$0]) }
 return String(format: "range %.0f..%.0f, worst step %.1f", s.min()!, s.max()!, steps.max()!)
}
let rawUpper = measures.map(\.upper), rawX = measures.map(\.neckX), rawY = measures.map(\.neckY)
let upper = smooth(rawUpper, sigma), neckX = smooth(rawX, sigma), neckY = smooth(rawY, sigma)
print("upper body  raw: \(spread(rawUpper))\n            smoothed: \(spread(upper))")
print("neck x      raw: \(spread(rawX))\n            smoothed: \(spread(neckX))")
print("neck y      raw: \(spread(rawY))\n            smoothed: \(spread(neckY))")

/// Cut one still out of its background and place it on the shared canvas.
func build(_ src: CIImage, _ label: String, upper: Double, neckX: Double, neckY: Double) -> CIImage? {
 guard let cg = ctx.createCGImage(src, from: src.extent) else { return nil }
 let handler = VNImageRequestHandler(cgImage: cg, options: [:])
 let matte = VNGenerateForegroundInstanceMaskRequest()
 guard (try? handler.perform([matte])) != nil, let instances = matte.results?.first,
       let masked = try? instances.generateMaskedImage(ofInstances: instances.allInstances, from: handler,
                                                       croppedToInstancesExtent: false)
 else { fputs("\(label): no matte\n", stderr); return nil }
 let cut = CIImage(cvPixelBuffer: masked)

 let scale = (upperFraction * canvasH) / upper
 let target = CGPoint(x: canvasW/2, y: canvasH * (1 - neckFraction))
 let placed = cut.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
                 .transformed(by: CGAffineTransform(translationX: target.x - neckX*scale, y: target.y - neckY*scale))
 let canvas = CIImage(color: .clear).cropped(to: CGRect(x: 0, y: 0, width: canvasW, height: canvasH))
 var out = placed.composited(over: canvas).cropped(to: CGRect(x: 0, y: 0, width: canvasW, height: canvasH))

 // Soft edges. The desk leaves the source frame at a different place in every
 // view, so without this one frame ends in a hard vertical line where the next
 // does not, which reads as the figure being "cut". A fade over the outer few
 // per cent turns every such cut into the same dissolve.
 let fadeX = canvasW * 0.11, fadeY = canvasH * 0.06
 var mask = CIImage(color: .white).cropped(to: out.extent)
 for (start, end) in [(CGPoint(x: 0, y: canvasH/2), CGPoint(x: fadeX, y: canvasH/2)),
                      (CGPoint(x: canvasW, y: canvasH/2), CGPoint(x: canvasW-fadeX, y: canvasH/2)),
                      (CGPoint(x: canvasW/2, y: 0), CGPoint(x: canvasW/2, y: fadeY)),
                      (CGPoint(x: canvasW/2, y: canvasH), CGPoint(x: canvasW/2, y: canvasH-fadeY))] {
  guard let ramp = CIFilter(name: "CILinearGradient", parameters: [
   "inputPoint0": CIVector(cgPoint: start), "inputColor0": CIColor.black,
   "inputPoint1": CIVector(cgPoint: end), "inputColor1": CIColor.white,
  ])?.outputImage?.cropped(to: out.extent) else { continue }
  mask = CIFilter(name: "CIMultiplyCompositing", parameters: [
   kCIInputImageKey: ramp, kCIInputBackgroundImageKey: mask,
  ])?.outputImage?.cropped(to: out.extent) ?? mask
 }
 out = CIFilter(name: "CIBlendWithMask", parameters: [
  kCIInputImageKey: out,
  kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: out.extent),
  kCIInputMaskImageKey: mask,
 ])?.outputImage?.cropped(to: out.extent) ?? out
 return out
}

func encode(_ img: CIImage, _ path: String, _ type: String, _ quality: Double?) {
 guard let cg = render(img), let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, type as CFString, 1, nil)
 else { fputs("encoder unavailable for \(path)\n", stderr); exit(1) }
 var options: [CFString: Any] = [:]
 if let quality { options[kCGImageDestinationLossyCompressionQuality] = quality }
 CGImageDestinationAddImage(dest, cg, options as CFDictionary)
 guard CGImageDestinationFinalize(dest) else { fputs("encode failed for \(path)\n", stderr); exit(1) }
}

// Anything left from a previous run with a different count would still be
// served, and `FigureTurntable` would never ask for it, but it would sit in
// the deploy looking current.
for stale in ((try? FileManager.default.contentsOfDirectory(atPath: outDir)) ?? []) where stale.hasPrefix("f-") {
 try? FileManager.default.removeItem(atPath: "\(outDir)/\(stale)")
}
var bytes = 0
for (i, src) in loaded.enumerated() {
 guard let frame = build(src, picks[i], upper: upper[i], neckX: neckX[i], neckY: neckY[i]) else { exit(1) }
 let path = String(format: "%@/f-%02d.avif", outDir, i)
 encode(frame, path, "public.avif", 0.62)
 bytes += ((try? FileManager.default.attributesOfItem(atPath: path))?[.size] as? Int) ?? 0
}
print(String(format: "wrote %d frames to %@ (%.0f KB total, %.0f KB each)",
             count, outDir, Double(bytes)/1024, Double(bytes)/1024/Double(count)))
