'use client';
/**
 * The immersive stage: the scroll-driven figure, plus the three stack cards.
 *
 * What used to be here was a WebGL scene and its controls, a quality select
 * (auto/full/lite/2D), a pause button, a WebGL2 capability probe and a 2D
 * fallback. All of that existed to manage a running animation on a GPU. A
 * scroll-driven image sequence has no running animation to pause, no GPU to
 * fall back from and no quality tiers worth a control: it is already still
 * when the visitor is still, `FigureTurntable` halves the frame count on
 * narrow or data-saving devices by itself, and reduced motion resolves to a
 * single frame. So the controls went with the scene.
 *
 * `SceneBoundary` stays. The failure it was written for was never WebGL, it
 * was `import()` of this chunk rejecting (offline mid-session, or a stale
 * hashed chunk after a redeploy) and taking the whole page down with it. That
 * failure mode is unchanged.
 */
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import SceneBoundary from './SceneBoundary';
import FigureTurntable from './FigureTurntable';
import { queueEvent } from '@/lib/analytics/queue';
const layers=[{name:'Interface',tools:'React · TypeScript',detail:'Thoughtful interfaces for useful tools.',anchor:'work'},{name:'Intelligence',tools:'MCP · RAG · Agents',detail:'Context, conversations, and evaluated outputs.',anchor:'work'},{name:'Infrastructure',tools:'Python · FastAPI',detail:'The services that connect everything.',anchor:'about'}];
export default function ImmersiveSystem({reduced,preview}:{reduced:boolean;preview:boolean}){
 const [selected,setSelected]=useState(1);const [failed,setFailed]=useState(false);
 useEffect(()=>{queueEvent('mode_change',{props:{to:'immersive',trigger:'scene-mount',reduced}})},[reduced]);
 const fallback=<div className="system-fallback" aria-hidden="true"><span>INTERFACE</span><span>INTELLIGENCE</span><span>INFRASTRUCTURE</span></div>;
 return <div className={`immersive-system ${failed?'system-flat':''}`}>
  {failed?fallback:<SceneBoundary onError={scope=>{setFailed(true);queueEvent('error',{props:{scope}})}} fallback={fallback}>
   <FigureTurntable reduced={reduced} preview={preview}>
    <div className="system-nodes" aria-label="Explore the connected stack">{layers.map((l,i)=><button key={l.name} data-track-tag={`scene-node-${i}`} data-parallax={i===0?'1':i===1?'-0.7':'0.5'} className={`node node-${i} ${selected===i?'selected':''}`} onClick={()=>setSelected(i)} aria-pressed={selected===i}><span className="node-signal"/>{l.name}<ArrowUpRight size={13}/></button>)}</div>
    <div className="node-detail" data-parallax="-0.35" aria-live="polite"><strong>{layers[selected].tools}</strong><p>{layers[selected].detail}</p><a data-track-tag={`scene-explore-${layers[selected].anchor}`} href={`#${layers[selected].anchor}`}>Explore the work <ArrowUpRight size={13}/></a></div>
   </FigureTurntable>
  </SceneBoundary>}
 </div>
}
