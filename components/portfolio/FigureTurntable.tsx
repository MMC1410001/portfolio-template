'use client';
/**
 * The scroll-driven turntable, what Experience mode reveals.
 *
 * This replaced a three.js scene (`SystemScene.tsx`, deleted) that rotated an
 * abstract stack of planes on a timer. It looked like a screensaver: the same
 * loop whether you were reading or had left, and nothing you did changed it.
 * The rotation here is *only* driven by scroll position, the figure turns
 * because the visitor scrolls, and holds still when they stop, which is the
 * whole difference between an animation and an interaction.
 *
 * ── One canvas, not twenty images ──────────────────────────────────────────
 * The first version stacked every frame as an absolutely positioned `<img>`,
 * cross-faded them with `opacity`, and gave each a `filter: drop-shadow`. It
 * flashed and hitched on every scroll tick, and the reason is worth keeping:
 * that is twenty composited layers, and a filter forces a repaint of each one
 * it applies to, so the browser was re-rasterising the whole stack while the
 * wheel was still moving.
 *
 * The frames are now decoded once into plain `Image` objects and composited by
 * hand into a single `<canvas>`: two `drawImage` calls per update, no layers,
 * no filters, no DOM writes in the hot path. The work per tick is constant,
 * which is what "smooth" actually means here.
 *
 * ── A closed circle ───────────────────────────────────────────────────────
 * `public/turntable/f-00..59.avif` are a full turn: front, round one side,
 * rear, round the other, back to front. So the sequence simply wraps, the
 * frame after the last is the first, and its only seam is front-to-front.
 *
 * It did not start that way. The frames were once 20 panels cut from a single
 * AI-rendered contact sheet, and two workarounds lived here because of it: a
 * `ctx.scale(-1, 1)` mirror to fake the return half of a sheet that only
 * covered 180 degrees (it also flipped the laptop to the wrong side of the
 * desk), and a blend curve tuned to disguise 18-degree steps. The source is
 * now 300 stills of a filmed orbit, sampled down to 60: sharp, consistent,
 * and 6 degrees a step, and neither workaround survives it.
 *
 * ── Cross-fade across the whole dwell ──────────────────────────────────────
 * Holding each frame crisp and dissolving late is a hard cut with a smear on
 * the end, and reads as a flash. Here the blend runs almost the entire
 * distance between two frames, so no frame is meaningfully held and none is
 * ever cut: at any scroll position you see a weighted mix of the two nearest
 * angles. That mix reads as motion blur rather than a double exposure only
 * *because* the pipeline registers the frames to each other. See
 * `scripts/turntable-frames.swift`.
 *
 * ── Why `clamp()` on the ScrollTrigger ─────────────────────────────────────
 * The stage is already mid-viewport when Experience mode engages, so a plain
 * `start:'top bottom'` would begin life at ~40% progress: the figure would
 * appear mid-turn and only three fifths of the rotation would be reachable.
 * `clamp(...)` pins progress 0 to the current scroll position.
 *
 * Narrow viewports and `prefers-reduced-data` load every second frame: 60
 * decoded 700x560 frames is ~94MB of image memory, which on a phone is the
 * difference between a scrub and a reload. Halving the count costs a phone
 * 12 degrees a step, which the cross-fade covers; not halving it costs the
 * page. The device tier is read through
 * `useSyncExternalStore` rather than an effect plus setState, per the pattern
 * in `hooks/use-stored.ts`: react-compiler rejects the latter.
 */
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { trackTag } from '@/lib/analytics/tag';

gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 60;
/** Intrinsic frame size, set by scripts/turntable-frames.swift. */
const FRAME_W = 700, FRAME_H = 560;
const ALL_FRAMES = Array.from({length:FRAME_COUNT},(_,i)=>`/turntable/f-${String(i).padStart(2,'0')}.avif`);
const LIGHT_QUERY = '(max-width: 1050px), (prefers-reduced-data: reduce)';
/** Degrees of billboard tilt across the whole turn, depth, not rotation. */
const SWEEP = 7;
/** Smallest rotation worth a repaint, as a fraction of the turn (~0.065deg). */
const REPAINT_TURN = 1.8e-4;
/**
 * Blend curve between two frames: hold the outgoing frame briefly, dissolve
 * across the rest, hold the incoming frame briefly, on smootherstep, so there
 * is no slope discontinuity at either end. The two failure modes this sits
 * between are both real and both were seen: a fast cut flashes, and a
 * full-dwell linear blend parks two poses at 50/50 and shows four legs.
 *
 * The holds used to be a quarter of the dwell each. At 18 degrees a step that
 * was the only thing keeping the 50/50 mix from reading as a double exposure;
 * it also meant half of every scroll showed a motionless frame, which is what
 * "not smooth" actually looked like. At 6 degrees a step the mix is a genuine
 * motion blur, so the holds shrink to a tenth, 0.6 degrees of stillness, well
 * under what an eye tracking a scroll can resolve.
 */
const blend=(t:number)=>{
 const x=Math.min(1,Math.max(0,(t-0.1)/0.8));
 return x*x*x*(x*(6*x-15)+10);
};

function subscribeLight(listener:()=>void):()=>void {
 const query=matchMedia(LIGHT_QUERY);
 query.addEventListener('change',listener);
 return ()=>query.removeEventListener('change',listener);
}

export default function FigureTurntable({reduced,preview,children}:{reduced:boolean;preview:boolean;children?:ReactNode}) {
 // A boolean snapshot: referentially stable, so this cannot re-render forever.
 const light=useSyncExternalStore(subscribeLight,()=>matchMedia(LIGHT_QUERY).matches,()=>false);
 const stage=useRef<HTMLDivElement|null>(null);
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const readout=useRef<HTMLSpanElement|null>(null);
 const rail=useRef<HTMLSpanElement|null>(null);
 const seen=useRef(false);
 useEffect(()=>{
  const el=stage.current,surface=canvas.current;
  if(!el||!surface)return;
  const context=surface.getContext('2d');
  if(!context)return;
  let live=true;
  const sources=light?ALL_FRAMES.filter((_,i)=>i%2===0):ALL_FRAMES;
  const images=sources.map(src=>{const img=new Image();img.decoding='async';img.src=src;return img});
  let ready=false,progress=0,drawn=-1;

  const fit=()=>{
   const dpr=Math.min(devicePixelRatio||1,2);
   const box=surface.getBoundingClientRect();
   const w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
   if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;drawn=-1}
  };
  const paint=(index:number,alpha:number)=>{
   const img=images[index];
   if(!img?.complete||!img.naturalWidth)return;
   // Contain, bottom-anchored: the pipeline places the subject inside a fixed
   // canvas, so every frame maps to exactly the same rectangle.
   const scale=Math.min(surface.width/FRAME_W,surface.height/FRAME_H);
   const w=FRAME_W*scale,h=FRAME_H*scale;
   context.globalAlpha=alpha;
   context.drawImage(img,(surface.width-w)/2,surface.height-h,w,h);
  };
  const draw=(p:number)=>{
   if(!ready)return;
   fit();
   const exact=p*images.length;
   // Nothing has moved far enough to be worth a repaint. Scaled by the frame
   // count so it stays a constant *angle*, a fixed threshold in frame units
   // silently tightens every time the sequence grows, and would have tripled
   // the repaint rate going from 22 frames to 60 for no visible gain.
   if(Math.abs(exact-drawn)<REPAINT_TURN*images.length)return;
   drawn=exact;
   const step=Math.floor(exact)%images.length;
   context.clearRect(0,0,surface.width,surface.height);
   paint(step,1);
   // Wraps: the frame after the last is the first, and both are front views.
   paint((step+1)%images.length,blend(exact-Math.floor(exact)));
   context.globalAlpha=1;
   surface.style.transform=`perspective(1600px) rotateY(${((p-0.5)*SWEEP).toFixed(2)}deg)`;
  };
  const drifters=Array.from(el.querySelectorAll<HTMLElement>('[data-parallax]'));
  const update=(p:number)=>{
   progress=p;
   draw(p);
   if(readout.current)readout.current.textContent=`${Math.round(p*360)}°`;
   if(rail.current)rail.current.style.transform=`scaleX(${p.toFixed(3)})`;
   for(const node of drifters){
    const depth=Number(node.dataset.parallax)||0;
    node.style.transform=`translate3d(${((p-0.5)*depth*52).toFixed(1)}px,${((p-0.5)*depth*-36).toFixed(1)}px,0)`;
   }
   // One tag, once: "did anyone actually scroll far enough to see the turn?"
   // is the only question this feature needs answered.
   if(p>0.9&&!seen.current){seen.current=true;trackTag('scene-rotation',{frames:images.length})}
  };
  // Decode before the first paint, or the canvas shows one frame arriving at a
  // time as the network delivers them.
  void Promise.all(images.map(img=>img.decode().catch(()=>undefined))).then(()=>{if(live){ready=true;draw(progress)}});
  const onResize=()=>{drawn=-1;draw(progress)};
  window.addEventListener('resize',onResize);
  update(0);
  const teardown=()=>{live=false;window.removeEventListener('resize',onResize)};
  // Reduced motion holds the first frame; a heatmap preview must not move at
  // all while it is being screenshotted.
  if(reduced||preview)return teardown;
  const proxy={p:0};
  const runway=el.closest('.stage-column')?.querySelector<HTMLElement>('.stage-runway');
  // Two scroll geometries, told apart by measuring the runway. Wide viewports:
  // the stage is sticky inside `.stage-column`, so the column's travel is the
  // distance over which the figure is *held* in view and the turn should fill
  // it. Narrow viewports have no sticky rule and a zero-height runway, so the
  // turn fills the figure's pass through the viewport instead. Using the
  // pinned range on a pass-through layout collapses it to zero length and
  // freezes the rotation at 0 degrees, which is what happened on the first
  // mobile run.
  const pinned=!!runway&&runway.offsetHeight>100;
  const track=pinned&&runway.parentElement?runway.parentElement:el;
  const tween=gsap.to(proxy,{p:1,ease:'none',onUpdate:()=>update(proxy.p),scrollTrigger:{
   trigger:track,
   start:pinned?'clamp(top top+=108)':'clamp(top bottom)',
   end:pinned?'clamp(bottom bottom-=8%)':'clamp(bottom top)',
   // Enough inertia to keep resolving for a beat after the wheel stops, which
   // is what turns a stepped sequence into momentum, and little enough that
   // the figure never lags the scrollbar.
   scrub:0.45,
   invalidateOnRefresh:true,
  }});
  return ()=>{teardown();tween.scrollTrigger?.kill();tween.kill()};
 },[reduced,preview,light]);
 return <div className="turntable" ref={stage}>
  <div className="tt-glow" aria-hidden="true"/>
  <p className="sr-only">Alex Rivera at his desk, working on a laptop. The photograph turns as the page scrolls.</p>
  <canvas className="tt-surface" ref={canvas} aria-hidden="true"/>
  <div className="tt-floor" aria-hidden="true"/>
  <div className="tt-readout" aria-hidden="true"><span ref={readout}>0°</span><span className="tt-rail"><i ref={rail}/></span><span>SCROLL TO ROTATE</span></div>
  {children}
 </div>;
}
