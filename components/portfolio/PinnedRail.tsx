'use client';
/**
 * A horizontal card rail, pinned and scrubbed sideways by the page scroll.
 * Recommendations and dashboards use it.
 *
 * Phones never pin. Scroll-driven sideways travel under a thumb read as the
 * page fighting the visitor, so there the rail is a finger swipe with a
 * `n / total` counter (the dashboards' CSS turns theirs into a list).
 * Above that, two pinned layouts, picked by viewport:
 *
 * - **full** (wide and tall): the stage is one viewport, heading and rail
 *   centred in it, held while vertical scroll moves the cards along.
 * - **compact** (tablets and short laptops): the stage keeps its natural
 *   height and is held centred in the viewport, or, when taller than it,
 *   sticks at `100svh - its height` (the chapter trick), so the heading
 *   scrolls away and the rail holds at the bottom of the screen.
 *   Only taken when the rail itself fits in the viewport; a card taller than
 *   the screen would be cut off while held.
 *
 * Otherwise, and under reduced motion or the heatmap preview, it is the plain
 * swipeable, snap-scrolling rail, which is also what renders on the server.
 *
 * ── Why not ScrollTrigger ─────────────────────────────────────────────────
 * The rails live inside stacked `.chapter`s, which are `position:sticky`.
 * ScrollTrigger resolves start/end once per refresh from where the trigger is
 * painted, and a refresh while that chapter is stuck bakes in the stuck
 * offset. Progress here is read from the runway's live rect on every frame
 * instead, which is right whatever its ancestors are doing, and it costs one
 * `getBoundingClientRect` and one transform write per scrolled frame.
 *
 * The runway's extra height is written as `--rail-distance` (the overflow
 * times RUNWAY_RATIO) and the stage's as `--stage-h`, DOM writes through refs
 * rather than state, so resizing re-renders nothing.
 */
import { Children, useEffect, useRef, type ReactNode } from 'react';

// Matched by the `.rail-pinned` rules in app/globals.css, which only apply once
// this component sets the class, so the two cannot disagree.
const FULL_QUERY='(min-width:1051px) and (min-height:760px)';
const PHONE_QUERY='(max-width:700px)';
// Pixels of page scroll per pixel of rail travel. At 1:1 nineteen cards took
// over eight viewports of scrolling. Compact is faster: its cards are narrower,
// and at the wide ratio the recommendations alone were four screens.
const RUNWAY_RATIO={full:0.55,compact:0.3};
// Share of the viewport the rail may fill and still be pinned in compact mode.
const FIT=0.9;

type Props={still:boolean;label:string;trackClass:string;counter?:boolean;heading?:ReactNode;children:ReactNode};

export default function PinnedRail({still,label,trackClass,counter=false,heading,children}:Props) {
 const runway=useRef<HTMLDivElement>(null);
 const stageRef=useRef<HTMLDivElement>(null);
 const rail=useRef<HTMLElement>(null);
 const count=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{
  const outer=runway.current,stage=stageRef.current,track=rail.current;
  if(still||!outer||!stage||!track)return;
  const full=matchMedia(FULL_QUERY),phone=matchMedia(PHONE_QUERY);
  let frame=0,distance=0,stageH=0,stick=0,lead=0,ratio=RUNWAY_RATIO.full,teardown:(()=>void)|null=null;
  const measure=()=>{
   distance=Math.max(0,track.scrollWidth-track.clientWidth);
   outer.style.setProperty('--rail-distance',`${Math.round(distance*ratio)}px`);
   stageH=stage.offsetHeight;outer.style.setProperty('--stage-h',`${Math.ceil(stageH)}px`);
   stick=parseFloat(getComputedStyle(stage).top)||0;
   // A centred compact stage leaves a gap below it, and the enclosing chapter
   // stops scrolling once its own bottom reaches the screen's, up to that gap
   // early. The last rail in a chapter (recommendations) froze short of its
   // final card, so the travel completes that much sooner.
   lead=Math.max(0,window.innerHeight-stick-stageH);
  };
  const update=()=>{frame=0;const rect=outer.getBoundingClientRect();const span=rect.height-stageH-lead;const progress=span>0?Math.min(1,Math.max(0,(stick-rect.top)/span)):0;track.style.transform=`translate3d(${-progress*distance}px,0,0)`;};
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const onResize=()=>{measure();update();};
  // Deferred a frame: measure() grows the runway, and with it the enclosing
  // `.chapter` that useChapterStack observes, which inside this callback is a
  // ResizeObserver loop error.
  let deferred=0;const onObserved=()=>{cancelAnimationFrame(deferred);deferred=requestAnimationFrame(onResize);};
  // A card tabbed to off to the side is invisible: the stage clips, it does
  // not scroll. Scroll the page to the point where that card is in view.
  const onFocus=(event:FocusEvent)=>{
   const card=(event.target as Element).closest('.rail-track>*') as HTMLElement|null;
   if(!card||!distance)return;
   const progress=Math.min(1,card.offsetLeft/distance);
   const top=outer.getBoundingClientRect().top+window.scrollY;
   window.scrollTo({top:top-stick+progress*(outer.offsetHeight-stageH-lead),behavior:'instant'});
  };
  const setup=()=>{
   teardown?.();teardown=null;
   if(phone.matches)return;
   const wide=full.matches;
   // Measured unpinned: the rail is as tall here as it will be once held.
   if(!wide&&track.offsetHeight>window.innerHeight*FIT)return;
   ratio=wide?RUNWAY_RATIO.full:RUNWAY_RATIO.compact;
   outer.classList.add('rail-pinned');outer.classList.toggle('rail-compact',!wide);measure();update();
   const resize=new ResizeObserver(onObserved);resize.observe(track);resize.observe(stage);
   addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onResize);
   track.addEventListener('focusin',onFocus);
   teardown=()=>{resize.disconnect();removeEventListener('scroll',onScroll);removeEventListener('resize',onResize);track.removeEventListener('focusin',onFocus);cancelAnimationFrame(frame);cancelAnimationFrame(deferred);frame=0;outer.classList.remove('rail-pinned','rail-compact');outer.style.removeProperty('--rail-distance');outer.style.removeProperty('--stage-h');track.style.removeProperty('transform');};
  };
  setup();
  full.addEventListener('change',setup);phone.addEventListener('change',setup);
  return()=>{full.removeEventListener('change',setup);phone.removeEventListener('change',setup);teardown?.();};
 },[still]);
 // Where a swipe has got to, as a DOM write: it fires on every scrolled frame.
 // Hidden by the CSS while pinned, where the rail does not scroll.
 useEffect(()=>{
  const track=rail.current,out=count.current;
  if(!counter||!track||!out)return;
  let frame=0;
  const update=()=>{
   frame=0;const first=track.firstElementChild as HTMLElement|null;if(!first)return;
   const n=track.children.length,step=first.offsetWidth+(parseFloat(getComputedStyle(track).columnGap)||0);
   const end=track.scrollLeft>=track.scrollWidth-track.clientWidth-2;
   out.textContent=`${end?n:Math.min(n,Math.round(track.scrollLeft/step)+1)} / ${n}`;
  };
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  update();track.addEventListener('scroll',onScroll,{passive:true});
  return()=>{track.removeEventListener('scroll',onScroll);cancelAnimationFrame(frame);};
 },[counter]);
 return <div ref={runway} className="rail-runway"><div ref={stageRef} className="rail-stage">{heading}{/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally scrolling region must be focusable or keyboard users cannot scroll it (axe scrollable-region-focusable) */}
<section ref={rail} className={`rail-track ${trackClass}`} aria-label={label} tabIndex={0}>{children}</section>{counter&&<p ref={count} className="rail-count" aria-hidden="true">1 / {Children.count(children)}</p>}</div></div>;
}
