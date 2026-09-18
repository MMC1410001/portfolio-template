/**
 * The transformation, drawn, the 850ms `.transforming` window made visible.
 *
 * Mode change used to be a fade: `reveal-in` on the hero copy, `system-in` on
 * the 3D stage. Nothing marked the *moment* of the switch, so the site's one
 * surprise read as a slow restyle rather than an event.
 *
 * This is the ascent: a white core flash, a shockwave ring, an upward aura
 * column, and six lightning arcs that strike, flicker and die. Blue-white
 * rather than gold, because `--signal` is #285ce5 / #82a2ff and a gold aura
 * would be the only warm thing on the site.
 *
 * Three constraints it is built around:
 *
 * - **No layout, no hit testing.** `position:fixed` + `pointer-events:none`,
 *   and everything animates `opacity`, `transform` or `stroke-dashoffset`, so
 *   the burst cannot reflow the page it is drawn over or eat a click at the
 *   moment the visitor decides to press something.
 * - **It is mounted, not toggled.** Portfolio.tsx renders it only while
 *   `mode==='transitioning'`, which is what restarts every animation on a
 *   second reveal, a CSS class flip would leave a finished animation
 *   finished. It also means the DOM cost exists for 850ms and no longer.
 * - **Reduced motion never sees it.** `still` skips 'transitioning' outright
 *   so this never mounts, and the global `prefers-reduced-motion` rule in
 *   globals.css would `animation:none!important` it even if it did.
 *
 * The bolt geometry sits in a 400x700 viewBox with
 * `preserveAspectRatio="none"`, so the arcs stretch to whatever the viewport
 * is rather than needing per-breakpoint paths. Stretching is *why* they are
 * jagged polylines with no curves: a distorted straight segment is still a
 * plausible lightning arc, a distorted bezier looks like a mistake. It also
 * sets the amplitude, the first pass used +/-35 units of wobble, which a
 * 1440px viewport stretches into 125px chevrons that read as a graphic, not a
 * discharge. These stay inside x 139..261 (the aura column) with +/-13, and
 * short vertical steps, so the stretch lands near a 40 degree kink.
 *
 * `vectorEffect="non-scaling-stroke"` is not optional here. Without it the
 * same horizontal stretch multiplies the stroke, and a 2.4-unit line lands on
 * screen as an 8px white ribbon, the first pass looked like ribbons, not
 * lightning. With it the stroke width is screen pixels and the geometry alone
 * stretches.
 */
export default function TransformBurst() {
 return <div className="transform-burst" aria-hidden="true">
  <div className="burst-flash"/>
  <div className="burst-ring"/>
  <div className="burst-ring burst-ring-late"/>
  <div className="burst-aura"/>
  <svg className="burst-bolts" viewBox="0 0 400 700" preserveAspectRatio="none" focusable="false">
   <path vectorEffect="non-scaling-stroke" d="M200 700 L195 654 L191 608 L204 562 L189 516 L201 470 L197 424 L189 378 L200 332 L188 286 L198 240 L189 194 L189 148 L198 102 L208 56 L196 20"/>
   <path vectorEffect="non-scaling-stroke" d="M168 700 L171 648 L178 596 L170 544 L166 492 L178 440 L158 388 L176 336 L163 284 L160 232 L160 180 L164 128 L164 90"/>
   <path vectorEffect="non-scaling-stroke" d="M232 700 L234 650 L235 600 L229 550 L233 500 L222 450 L222 400 L226 350 L236 300 L230 250 L228 200 L234 150 L231 100 L235 80"/>
   <path vectorEffect="non-scaling-stroke" d="M146 700 L150 656 L141 612 L147 568 L146 524 L153 480 L150 436 L142 392 L155 348 L139 304 L145 260 L151 216 L146 190"/>
   <path vectorEffect="non-scaling-stroke" d="M254 700 L246 656 L257 612 L259 568 L255 524 L261 480 L251 436 L258 392 L256 348 L255 304 L253 260 L260 216 L254 180"/>
   <path vectorEffect="non-scaling-stroke" d="M200 700 L202 662 L194 624 L203 586 L202 548 L207 510 L205 472 L197 434 L198 396 L202 358 L193 320 L198 300"/>
  </svg>
 </div>;
}
