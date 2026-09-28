'use client';
import { useEffect, useState, type ComponentType } from 'react';
import { MessageCircle } from 'lucide-react';
/**
 * The chat launcher, eager, and the panel behind it, not.
 *
 * ── Why the split ──────────────────────────────────────────────────────────
 * Chat.tsx sat in the Portfolio chunk, so every visit to `/` paid for the
 * Sheet and its @base-ui dialog machinery, the input, the stream reader and
 * the whole FAQ corpus the offline answer runs on, before a single question
 * was asked, and most visitors never ask one. What the page needs up front is
 * this button. The panel is fetched when the browser is idle, or sooner if
 * the button is hovered, focused or pressed, and mounted (closed) as soon as
 * it arrives, so the first open is normally as instant as it always was.
 *
 * ── Why the button stays here once the panel has loaded ───────────────────
 * It used to be the panel's SheetTrigger. Swapping a placeholder for that
 * trigger when the chunk landed would recreate the DOM node under a visitor's
 * keyboard focus, so this button is permanent and owns `open`, and the panel
 * is a controlled Sheet (Chat.tsx). The markup matches what SheetTrigger
 * rendered: the same classes, the same `data-track-tag`/`data-track-cta`
 * that clicks.ts and cta.ts read, `aria-haspopup`/`aria-expanded`, and it
 * toggles, as the trigger did. The server renders exactly what the first
 * client render does, so there is nothing to mismatch and `/` stays static.
 *
 * ── Why not React.lazy ─────────────────────────────────────────────────────
 * A lazy component whose chunk fails to load throws to the nearest error
 * boundary, and there is none around this: a flaky connection or a deploy
 * mid-visit would take the homepage down with it. Holding the loaded
 * component in state instead means a failed fetch leaves the button as it
 * was, and the next hover or press simply tries again.
 */
type Panel=ComponentType<{open:boolean;onOpenChange:(open:boolean)=>void}>;
let pending:Promise<Panel>|null=null;
function load():Promise<Panel>{return pending??=import('./Chat').then(module=>module.default,error=>{pending=null;throw error})}
export default function ChatLauncher() {
 const [open,setOpen]=useState(false);const [Chat,setChat]=useState<Panel|null>(null);
 // Idle, with a ceiling: older Safari has no requestIdleCallback, and a page
 // that never idles (the turntable scrolling) should still get the panel.
 useEffect(()=>{let live=true;const warm=()=>{load().then(panel=>{if(live)setChat(()=>panel)},()=>{/* retried on hover, focus or press */})};
  const idle='requestIdleCallback' in window;const id=idle?window.requestIdleCallback(warm,{timeout:4000}):window.setTimeout(warm,2500);
  return()=>{live=false;if(idle)window.cancelIdleCallback(id);else window.clearTimeout(id)}},[]);
 const warm=()=>{load().then(panel=>setChat(()=>panel),()=>{/* the button still works: pressing it tries again */})};
 return <><button type="button" data-slot="sheet-trigger" aria-haspopup="dialog" aria-expanded={open} data-track-tag="chat-open" data-track-cta="chat-open" className="chat-launcher" onPointerEnter={warm} onFocus={warm} onClick={()=>{warm();setOpen(value=>!value)}}><MessageCircle size={19}/><span>Ask about Alex</span><span className="chat-dot"/></button>{Chat&&<Chat open={open} onOpenChange={setOpen}/>}</>;
}
