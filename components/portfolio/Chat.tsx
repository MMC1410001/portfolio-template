'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, ArrowUpRight, Send, Sparkles, Volume2, Square, User, X } from 'lucide-react';
import { Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { answerQuestion,type Answer } from '@/content/faq';
import { profile } from '@/content/portfolio';
import { trackChatOpen, trackChatAsk, trackChatAnswer, trackChatClose, classifyFailure, type ChatFailure } from '@/lib/analytics/chat';
import { pickVoice, speakable, speechFailureHint } from '@/lib/chat/speech-text';
import { nextKey, trimTranscript } from '@/lib/chat/session';
import { paceChars, readChatStream } from '@/lib/chat/stream-client';
import { linkLabel, linkSegments } from '@/lib/chat/linkify';
import { sessionLapsed, touchSession, useSessionExpired } from '@/hooks/use-idle';
import { speechSupported, stopSpeaking, useSpeakingId, useSpeechBroken, useVoiceToggle, useVoices } from '@/hooks/use-speech';
// No lazy chunk for the voice: hooks/use-speech.ts and lib/chat/speech-text.ts
// are a couple of KB between them and Chat.tsx already sits in the Portfolio
// chunk, so splitting them out would cost a round trip to save nothing.
//
// `key` is a monotonic id from lib/chat/session.ts, not an array index. The
// transcript can now lose its head (trimTranscript) and gain a divider in the
// middle, either of which makes an index point at a different message than it
// did a moment ago — and the Listen button identifies the reply it is
// speaking by exactly that id.
type Message={key:number;role:'user'|'assistant'|'system';text:string;href?:string;source?:string};
const prompts=['What has Alex built?','What is his tech stack?','What certifications has he completed?'];
// Left in the transcript at the point the thread actually broke, rather than
// announced at the top. Silently forgetting is the worse failure: a visitor
// who returns and asks "and the second one?" would otherwise get a confused
// answer and no way to know why.
// The server refuses anything longer (app/api/chat/route.ts), so this is not
// a preference. It is a hard boundary that the visitor is entitled to see
// coming rather than discover.
const MAX_QUESTION=500;
// Where the counter appears. Far enough back to be a warning, close enough
// that it is not decoration on a normal question.
const COUNTER_FROM=420;
const RESET_NOTE='New thread. The last conversation timed out after ten minutes of quiet, so this question is answered on its own.';
export default function Chat({onOpen}:{onOpen:()=>void}) {
 const [open,setOpen]=useState(false);const [messages,setMessages]=useState<Message[]>([{key:0,role:'assistant',text:'Hi there. I’m Alex’s portfolio guide. Ask me about his AI projects, skills, certifications, or engineering experience.',source:'Answers from the portfolio'}]);const [input,setInput]=useState('');const [busy,setBusy]=useState(false);const [slow,setSlow]=useState(false);const [writingKey,setWritingKey]=useState<number|null>(null);const [notice,setNotice]=useState<string|null>(null);const end=useRef<HTMLDivElement>(null);const inputRef=useRef<HTMLInputElement>(null);const lastReply=useRef<HTMLDivElement>(null);const box=useRef<HTMLDivElement>(null);const inflight=useRef<AbortController|null>(null);
 // The chat is stateless on the server, so the client is what remembers.
 // Four turns is enough for a follow-up chain to resolve a pronoun without
 // shipping a whole session; `carriedRef` holds the answer ids the last
 // reply drew on, which is what keeps "why wasn't this production?" on the
 // thing it is asking about. See lib/chat/nim.ts.
 const historyRef=useRef<{role:'user'|'assistant';text:string}[]>([]);const carriedRef=useRef<string[]>([]);
 // Ten minutes of silence ends the conversation. Nothing server-side ends,
 // because nothing server-side began: what ends is the context above, and
 // the visitor being told so. See hooks/use-idle.ts.
 const expired=useSessionExpired();
 // Nothing is ever spoken unless a visitor presses play on one reply, so
 // there is no autoplay to defend against and no preference to remember.
 // One subscription here rather than one per message: speakingId is what
 // tells a single reply that it is the live one.
 const voices=useVoices();const voice=pickVoice(voices);
 // `speechBroken` is set once an utterance was accepted and never started.
 // Chrome 153 on macOS 26 does exactly that: 199 voices, no error, no sound.
 // The control withdraws rather than lying about it. See hooks/use-speech.ts.
 const speechBroken=useSpeechBroken();
 const canSpeak=speechSupported()&&!speechBroken;const speakingId=useSpeakingId();
 const toggleVoice=useVoiceToggle(voice,speakingId);
 const tooLong=input.length>MAX_QUESTION;
 const turn=useRef(0);const asked=useRef(0);const answered=useRef(0);const openedAt=useRef(0);const lastSource=useRef<string|null>(null);
 // A long answer is up to 1200 characters, and scrolling the end sentinel
 // into view dropped the visitor on its last line with the whole reply above
 // them. Anchor on the top of the newest reply instead, and fall back to the
 // sentinel for a question, the thinking line and the timeout notice, where
 // the bottom is the right place to be.
 // Two scrolls, because a new turn and a growing one want opposite things.
 //
 // The turn scroll animates, and must fire ONCE. It used to depend on
 // `messages`, so every streamed token produced a new array and restarted a
 // behavior:'smooth' animation that had not finished the last one. Fifty
 // interrupted animations per answer is exactly what "not smooth" looked
 // like. Depending on the count means it fires when a turn appears and not
 // while one is being written.
 const turns=messages.length;const lastRole=messages.at(-1)?.role;
 useEffect(()=>{if(lastRole==='assistant'&&lastReply.current)lastReply.current.scrollIntoView({block:'start',behavior:'smooth'});else end.current?.scrollIntoView({block:'nearest'})},[turns,lastRole,busy,expired]);
 // The follow scroll does NOT animate, and fires on every token. Text
 // arriving at the bottom of the view should stay in view, and the only way
 // to do that without fighting the animation above is to move the scrollTop
 // directly. Skipped unless the visitor is already near the bottom: someone
 // who scrolled up to reread an earlier answer is not asking to be dragged
 // back down every time a word arrives.
 const written=messages.at(-1)?.text.length??0;
 useEffect(()=>{const el=box.current;if(!el)return;if(el.scrollHeight-el.scrollTop-el.clientHeight<140)el.scrollTop=el.scrollHeight},[written]);
 async function send(text:string,promptIndex:number|null=null){const question=text.trim();if(!question||busy)return;if(question.length>MAX_QUESTION){setNotice(`That question is ${question.length-MAX_QUESTION} characters over the ${MAX_QUESTION} limit. Please shorten it and send again.`);inputRef.current?.focus();return;}
  // Read the clock before restarting it. A lapsed session drops the context
  // rather than carrying an hour-old pronoun into the prompt. `historyRef` is
  // the second half of the condition and not a formality: a panel left open
  // with nothing asked has no conversation to end, and announcing one that
  // never happened is worse than saying nothing.
  const lapsed=sessionLapsed()&&historyRef.current.length>0;touchSession();
  if(lapsed){historyRef.current=[];carriedRef.current=[]}
  setNotice(null);setInput('');
  // Keys are taken outside the updater: React may call an updater twice in
  // development, and a counter advanced in there would hand the two runs
  // different ids for the same message.
  const noteKey=lapsed?nextKey():0;const userKey=nextKey();
  setMessages(m=>trimTranscript([...m,...(lapsed?[{key:noteKey,role:'system' as const,text:RESET_NOTE}]:[]),{key:userKey,role:'user' as const,text:question}]));
  setBusy(true);stopSpeaking();
  turn.current+=1;asked.current+=1;
  // Queued before the await: a question asked moments before the tab closes
  // is still recorded, and the pagehide beacon carries it.
  const {startedAt}=trackChatAsk(question,promptIndex,turn.current);
  historyRef.current=[...historyRef.current,{role:'user' as const,text:question}].slice(-8);
  let result:Answer;let offline=false;let failure:ChatFailure=null;let status:number|undefined;
  // Two ways to stop: the 8.5s ceiling, and the visitor pressing stop. Both
  // land in the same catch, and both are meant to: an abandoned question
  // still gets the offline answer rather than leaving the panel stuck busy.
  const controller=new AbortController();inflight.current=controller;
  // Minted before the request so the streamed placeholder and the finished
  // reply are the same message rather than two.
  const replyKey=nextKey();
  // A model reply is written, not looked up, and takes seconds. Saying so
  // after four of them is the difference between a wait and a hang.
  const slowTimer=setTimeout(()=>setSlow(true),4000);
  try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify({message:question,history:historyRef.current.slice(-4),carried:carriedRef.current,stream:true}),signal:controller.signal});if(!response.ok){status=response.status;throw new Error('status')}
   if(response.headers.get('content-type')?.includes('text/event-stream')&&response.body){
    // The reply is being written. Put an empty assistant turn on screen now
    // so the words have somewhere to land, and grow it as they arrive.
    // The deadline is on the FIRST token, not the whole reply. Once words
    // are on screen, cutting the connection would delete a half-read
    // sentence, which is worse than the wait it saves.
    // Tokens do not arrive at a readable rate. They come in bursts, several
    // per network read, and React batches the setStates in one tick, so a
    // whole clause lands in a single frame and then nothing happens for
    // half a second. Buffering them and releasing a slice per animation
    // frame turns that into something that reads like writing.
    //
    // The slice is a FRACTION of what is waiting rather than a fixed rate,
    // so it is self-balancing: a full buffer drains fast and never falls
    // behind the model, an almost-empty one trickles. A hidden tab stops
    // firing frames and the buffer simply waits; the terminal frame sets
    // the whole text anyway, so nothing is ever lost.
    let pending='';let pumping=false;let finished=false;
    const pump=()=>{
     if(finished||!pending.length){pumping=false;return}
     const take=paceChars(pending.length);
     const piece=pending.slice(0,take);pending=pending.slice(take);
     setMessages(m=>m.some(entry=>entry.key===replyKey)
      ?m.map(entry=>entry.key===replyKey?{...entry,text:entry.text+piece}:entry)
      :trimTranscript([...m,{key:replyKey,role:'assistant' as const,text:piece,source:'AI · grounded in portfolio'}]));
     requestAnimationFrame(pump);
    };
    const outcome=await readChatStream(response.body,text=>{
     // The turn is created by the first token, not before it: until then
     // the thinking line is the honest thing to show.
     clearTimeout(slowTimer);setBusy(false);setSlow(false);setWritingKey(replyKey);
     pending+=text;
     if(!pumping){pumping=true;requestAnimationFrame(pump)}},{
     // 12s, where the non-streaming path had 8.5s, and the increase is the
     // point of streaming rather than a regression of it. Measured
     // time-to-first-token varies 3.3s to 19s, and this is a ceiling before
     // giving up, not a typical wait: the thinking line says "still working
     // on it" from 4s, and the moment a token lands the visitor is reading
     // rather than waiting. Passing it costs them the curated answer they
     // would have had at 8.5s anyway.
     firstTokenMs:12000,abort:()=>controller.abort('slow')});
    if(outcome){
     // Clearing these here and not only in onDelta is the whole fix for a
     // bug that shipped: a `fallback` frame arriving before any token left
     // busy and slow true, so the approved answer appeared UNDERNEATH
     // "Still working on it" with the stop button still live.
     finished=true;pending='';
     clearTimeout(slowTimer);setBusy(false);setSlow(false);setWritingKey(null);
     // 'fallback' is every check in lib/chat/nim.ts that cannot pass on a
     // partial reply: whatever was shown is replaced by the approved text.
     const settled=outcome.payload as unknown as Answer;
     setMessages(m=>m.some(entry=>entry.key===replyKey)
      ?m.map(entry=>entry.key===replyKey?{...entry,text:settled.answer,href:settled.href,source:settled.source}:entry)
      :trimTranscript([...m,{key:replyKey,role:'assistant' as const,text:settled.answer,href:settled.href,source:settled.source}]));
     inflight.current=null;touchSession();
     historyRef.current=[...historyRef.current,{role:'assistant' as const,text:settled.answer.slice(0,320)}].slice(-8);
     carriedRef.current=Array.isArray(settled.ids)?settled.ids.slice(0,4):[];
     answered.current+=1;lastSource.current=settled.source;
     trackChatAnswer({source:settled.source,mode:settled.mode,offline:false,failure:null,status,startedAt,hasHref:Boolean(settled.href),answerLen:settled.answer.length,turn:turn.current});
     inputRef.current?.focus();return;
    }
    // No terminal frame: nothing started in time, or the connection died.
    // Drop the placeholder and take the offline path below.
    finished=true;pending='';
    setMessages(m=>m.filter(entry=>entry.key!==replyKey));clearTimeout(slowTimer);setSlow(false);setWritingKey(null);setBusy(true);
    throw new Error('stream');
   }
   result=await response.json()}catch(error){failure=classifyFailure(error);offline=true;result=answerQuestion(question);
   // A refused request is not an offline one, and saying "Offline" when the
   // visitor is plainly online teaches them the label means nothing. The
   // answer served is the same curated text either way; only the reason
   // differs, and the reason is the part worth being honest about.
   if(controller.signal.reason==='user')result.source='Stopped · from the portfolio';
   else if(status===429){result.source='Rate limited · from the portfolio';setNotice('That is faster than the guide can answer. Give it about a minute — these replies still come from the portfolio.')}
   else result.source='Offline · from the portfolio'}
  // The ten minutes runs from the reply, not the question: reading a long
  // answer is not being idle.
  clearTimeout(slowTimer);setSlow(false);setWritingKey(null);
  touchSession();
  // Trim the assistant turn: the model needs the thread of the conversation,
  // not a verbatim transcript, and a 1200-character answer in every
  // subsequent prompt is most of the context window spent on itself.
  historyRef.current=[...historyRef.current,{role:'assistant' as const,text:result.answer.slice(0,320)}].slice(-8);
  carriedRef.current=Array.isArray(result.ids)?result.ids.slice(0,4):[];
  answered.current+=1;lastSource.current=result.source;
  trackChatAnswer({source:result.source,mode:result.mode,offline,failure,status,startedAt,hasHref:Boolean(result.href),answerLen:result.answer.length,turn:turn.current});
  inflight.current=null;setMessages(m=>trimTranscript([...m,{key:replyKey,role:'assistant' as const,text:result.answer,href:result.href,source:result.source}]));setBusy(false);inputRef.current?.focus();
 }
 return <Sheet open={open} onOpenChange={value=>{setOpen(value);if(value){touchSession();openedAt.current=trackChatOpen('launcher');onOpen()}else {stopSpeaking();trackChatClose({asked:asked.current,answered:answered.current,openedAt:openedAt.current,lastSource:lastSource.current})}}}><SheetTrigger data-track-tag="chat-open" data-track-cta="chat-open" className="chat-launcher"><MessageCircle size={19}/><span>Ask about Alex</span><span className="chat-dot"/></SheetTrigger><SheetContent className="chat-panel"><SheetHeader className="chat-header"><div className="assistant-symbol"><Sparkles size={23}/></div><SheetTitle>Meet the mind behind the work.</SheetTitle><SheetDescription>Portfolio guide · answers from documented work</SheetDescription></SheetHeader><div ref={box} className="chat-messages" role="log" aria-label="Conversation">{messages.map(m=>{if(m.role==='system')return <p key={m.key} className="chat-divider">{m.text}</p>;const id=`m${m.key}`;const live=speakingId===id;return <div key={m.key} ref={m.key===messages.at(-1)?.key&&m.role==='assistant'?lastReply:undefined} className={`message message-${m.role}`}>{m.role==='assistant'?<span className="message-label"><img className={`message-avatar${live?' is-speaking':''}`} src={profile.avatar} width={26} height={26} alt="" decoding="async" loading="lazy"/>ALEX’S PORTFOLIO</span>:<span className="message-label"><span className="message-avatar message-avatar-you" aria-hidden="true"><User size={14}/></span>YOU</span>}<p>{linkSegments(m.text).map((part,at)=>part.href?<a key={at} className="msg-link" href={part.href} target="_blank" rel="noreferrer">{linkLabel(part.href)}<ArrowUpRight size={11}/></a>:<span key={at}>{part.text}</span>)}{m.key===writingKey&&<span className="writing" aria-hidden="true"/>}</p>{m.href&&<a data-track-tag="chat-source-link" href={m.href} target="_blank" rel="noreferrer">View source <ArrowUpRight size={13}/></a>}{m.role==='assistant'&&<span className="message-foot">{m.source&&<small>{m.source}</small>}{canSpeak&&<button type="button" data-track-tag="chat-speak" className={`msg-speak${live?' is-speaking':''}`} onClick={()=>{touchSession();toggleVoice(id,speakable(m.text))}} aria-label={live?'Stop reading this answer':'Read this answer aloud'} title={live?'Stop':'Read aloud'}>{live?<Square size={11}/>:<Volume2 size={13}/>}<span>{live?'Stop':'Listen'}</span></button>}</span>}</div>})}{busy&&<output aria-live="off" className="thinking">{slow?'Still working on it — this one is being written rather than looked up':'Finding that in the portfolio'}<span className="dots" aria-hidden="true"><i/><i/><i/></span></output>}{notice&&<output aria-live="off" className="thinking">{notice}</output>}{expired&&messages.length>1&&<output aria-live="off" className="thinking">This conversation has been quiet for ten minutes, so it has ended. Your next question starts a fresh thread.</output>}{speechBroken&&<output aria-live="off" className="thinking">{speechFailureHint(navigator.userAgent)}</output>}<div ref={end}/></div><div className="chat-bottom">{(messages.length===1||expired)&&<div className="chat-suggestions">{prompts.map((p,i)=><button key={p} data-track-tag={`chat-suggestion-${i}`} onClick={()=>send(p,i)}>{p}<ArrowUpRight size={13}/></button>)}</div>}<form onSubmit={e=>{e.preventDefault();void send(input)}}><label htmlFor="chat-input" className="sr-only">Your question about Alex</label><Input ref={inputRef} id="chat-input" value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about my work…" readOnly={busy} aria-busy={busy} aria-invalid={tooLong||undefined} aria-describedby={tooLong?'chat-input-error':input.length>=COUNTER_FROM?'chat-input-count':undefined}/>{busy?<button type="button" data-track-tag="chat-stop" onClick={()=>inflight.current?.abort('user')} aria-label="Stop this question" title="Stop"><X size={18}/></button>:<button data-track-tag="chat-send" type="submit" disabled={!input.trim()||tooLong} aria-label="Send question"><Send size={18}/></button>}</form>{tooLong?<p id="chat-input-error" className="chat-invalid" role="alert">{input.length-MAX_QUESTION} characters over the {MAX_QUESTION} limit. Shorten the question to send it.</p>:input.length>=COUNTER_FROM?<p id="chat-input-count" className="chat-count">{MAX_QUESTION-input.length} characters left</p>:null}<div className="chat-footnote"><span>Grounded in Alex’s published work.</span><a data-track-tag="chat-email" href={`mailto:${profile.email}`}>Email Alex <ArrowUpRight size={11}/></a></div></div></SheetContent></Sheet>
}
