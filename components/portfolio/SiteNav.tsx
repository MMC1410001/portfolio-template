'use client';
/**
 * The header nav and its scroll-spy, split out of Portfolio.tsx so that a
 * section change re-renders these few links rather than the whole page. The
 * React Compiler is a lint rule here, not a build step, so nothing memoises
 * Portfolio's tree for it: `setActive` in the parent re-rendered every section
 * each time the highlight moved.
 *
 * The parent still needs to move the highlight on a click ("Explore my work",
 * "Scroll to explore"), so it holds a handle rather than the state.
 */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
export type NavItems=readonly (readonly [string,string])[];
export type SiteNavHandle={select:(id:string)=>void};
export default function SiteNav({items,still,ref}:{items:NavItems;still:boolean;ref?:Ref<SiteNavHandle>}) {
 const [active,setActive]=useState('work');
 const navRef=useRef<HTMLElement>(null);
 useImperativeHandle(ref,()=>({select:setActive}),[]);
 // Scroll-spy for the header nav. `active` used to move only on click, so the
 // highlight stayed on whatever was last clicked however far the visitor
 // scrolled. setActive runs in the observer callback, not in the effect body,
 // which is what keeps react-compiler's EffectSetState rule satisfied.
 useEffect(()=>{
  const ids=items.map(([id])=>id);
  const seen=new Set<string>();
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){if(entry.isIntersecting)seen.add(entry.target.id);else seen.delete(entry.target.id);}
   // Lowest in document order wins, the same rule as section dwell
   // (lib/analytics/sections.ts): a chapter that has been slid over stays
   // under the band, and the section painted on top is the later one.
   const next=ids.findLast(id=>seen.has(id));
   if(next)setActive(next);
  },{rootMargin:'-40% 0px -40% 0px',threshold:0});
  for(const id of ids){const el=document.getElementById(id);if(el)observer.observe(el);}
  return()=>observer.disconnect();
 },[items]);
 // On phones the nav is a swipeable strip (globals.css); keep the section the
 // scroll-spy highlights in view in it. A no-op wherever the links all fit.
 useEffect(()=>{
  const nav=navRef.current,link=nav?.querySelector<HTMLElement>('a.active');
  if(!nav||!link||nav.scrollWidth<=nav.clientWidth)return;
  nav.scrollTo({left:link.offsetLeft-(nav.clientWidth-link.offsetWidth)/2,behavior:still?'instant':'smooth'});
 },[active,still]);
 return <nav ref={navRef} aria-label="Main navigation">{items.map(([id,label])=><a key={id} data-track-tag={`nav-${id}`} href={`#${id}`} className={active===id?'active':''} aria-current={active===id?'location':undefined} onClick={()=>setActive(id)}>{label}</a>)}</nav>;
}
