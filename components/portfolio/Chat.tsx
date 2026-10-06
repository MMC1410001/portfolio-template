'use client';
import { memo, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import { ArrowUpRight, Send, Sparkles, Volume2, Square, User, X } from 'lucide-react';
import { Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { profile } from '@/content/portfolio';
import { trackChatOpen, trackChatAsk, trackChatAnswer, trackChatClose } from '@/lib/analytics/chat';
import { pickVoice, speakable, speechFailureHint } from '@/lib/chat/speech-text';
import { TURN_CHARS } from '@/lib/chat/turn-sig';
import { nextKey, trimTranscript } from '@/lib/chat/session';
import { paceChars } from '@/lib/chat/stream-client';
import { ask, type HistoryTurn } from '@/lib/chat/ask';
import { linkLabel, linkSegments } from '@/lib/chat/linkify';
import { sessionLapsed, touchSession, useSessionExpired } from '@/hooks/use-idle';
import { useStored } from '@/hooks/use-stored';
import { DAILY_QUESTIONS, QUOTA_WARN_AT, UNLIMITED, parseQuota, quotaExpired } from '@/lib/chat/quota';
import { speechSupported, stopSpeaking, useSpeakingId, useSpeechBroken, useVoiceToggle, useVoices } from '@/hooks/use-speech';
// This whole file is a lazy chunk now, loaded by ChatLauncher.tsx when the
// browser is idle or the launcher is hovered, focused or pressed. The Sheet,
// the input and the FAQ corpus behind the offline answer were about a third of
// the homepage's own JavaScript, all of it for a panel most visitors never
// open. The launcher button itself lives there, rendered eagerly, and owns
// `open`: this panel is controlled by it. The voice stays in this chunk:
// hooks/use-speech.ts and lib/chat/speech-text.ts are a couple of KB.
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
// The daily allowance is the server's (lib/analytics/chat-quota.ts); the panel
// only reports it. Each response says what is left, and the last one heard is
// kept in localStorage so a reload does not forget the chat was closed. The
// clock is read out here, outside the component, where react-compiler's
// purity rule does not reach: it only decides whether a stored allowance is
// stale, and the server has the final word on every question anyway.
const QUOTA_KEY='pfChatQuota';
const staleQuota=(raw:string)=>quotaExpired(parseQuota(raw));
function resetLabel(resetAt:number):string{const at=new Date(resetAt);const time=at.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);return at.toDateString()===new Date().toDateString()?`at ${time}`:at.toDateString()===tomorrow.toDateString()?`tomorrow at ${time}`:`on ${at.toLocaleDateString([],{weekday:'long'})} at ${time}`}
// Where the counter appears. Far enough back to be a warning, close enough
// that it is not decoration on a normal question.
const COUNTER_FROM=420;
// Where a question is in its life. `busy` ends at the first token, because
// from there the thinking line is replaced by the reply being written.
// `streaming` covers the rest, until the terminal frame: without it a second
// question could be sent mid-reply, two requests raced for one transcript, and
// the Stop button vanished while the first was still arriving. One reducer
// rather than four setters, because they only ever change together. The
// clocks that drive it (the header ceiling, the first-token watchdog, "still
// working") live in lib/chat/ask.ts.
type Phase={busy:boolean;streaming:boolean;slow:boolean;writingKey:number|null};
type PhaseAction={type:'ask'|'slow'|'done'}|{type:'token';key:number};
const IDLE:Phase={busy:false,streaming:false,slow:false,writingKey:null};
// 'token' and 'slow' return the same object when nothing changes, so a reply
// arriving in fifty pieces is not fifty extra renders.
function phaseOf(state:Phase,action:PhaseAction):Phase{switch(action.type){case 'ask':return {...IDLE,busy:true};case 'slow':return state.slow?state:{...state,slow:true};case 'token':return state.streaming&&!state.busy&&!state.slow&&state.writingKey===action.key?state:{busy:false,streaming:true,slow:false,writingKey:action.key};case 'done':return IDLE}}
const RESET_NOTE='New thread. The last conversation timed out after ten minutes of quiet, so this question is answered on its own.';
type RowProps={m:Message;live:boolean;writing:boolean;canSpeak:boolean;replyRef?:RefObject<HTMLDivElement|null>;toggleVoice:(id:string,text:string)=>void};
// One transcript entry, memoised. A streamed reply replaces only its own
// message object per animation frame (pump() returns every other entry as it
// was), so every row but the one being written bails out here instead of
// re-running linkSegments over the whole conversation on every frame.
// The <img> is the 26px avatar. vinext has no next/image, so the rule's
// advice cannot be taken; the file is already sized and loads lazily.
// oxlint-disable-next-line nextjs/no-img-element -- no next/image under vinext; see above
const Row=memo(function Row({m,live,writing,canSpeak,replyRef,toggleVoice}:RowProps){if(m.role==='system')return <p className="chat-divider">{m.text}</p>;const id=`m${m.key}`;return <div ref={replyRef} className={`message message-${m.role}`}>{m.role==='assistant'?<span className="message-label"><img className={`message-avatar${live?' is-speaking':''}`} src={profile.avatar} width={26} height={26} alt="" decoding="async" loading="lazy"/>ALEX’S PORTFOLIO</span>:<span className="message-label"><span className="message-avatar message-avatar-you" aria-hidden="true"><User size={14}/></span>YOU</span>}<p>{linkSegments(m.text).map((part,at)=>part.href?<a key={at} className="msg-link" href={part.href} target="_blank" rel="noreferrer">{linkLabel(part.href)}<ArrowUpRight size={11}/></a>:<span key={at}>{part.text}</span>)}{writing&&<span className="writing" aria-hidden="true"/>}</p>{m.href&&<a data-track-tag="chat-source-link" href={m.href} target="_blank" rel="noreferrer">View source <ArrowUpRight size={13}/></a>}{m.role==='assistant'&&<span className="message-foot">{m.source&&<small>{m.source}</small>}{canSpeak&&<button type="button" data-track-tag="chat-speak" className={`msg-speak${live?' is-speaking':''}`} onClick={()=>{touchSession();toggleVoice(id,speakable(m.text))}} aria-label={live?'Stop reading this answer':'Read this answer aloud'} title={live?'Stop':'Read aloud'}>{live?<Square size={11}/>:<Volume2 size={13}/>}<span>{live?'Stop':'Listen'}</span></button>}</span>}</div>});
// No `onOpen` hook any more, and its absence is the point. It used to call
// setAutoplay(false) in Portfolio.tsx, which does not pause the three-second
// reveal countdown but cancels it outright — nothing sets autoplay back — so
// a visitor who opened the chat in the first three seconds never saw the
// theme change at all. That made sense when this panel was a modal covering
// the page. It is a floating panel now: the page is visible and the reveal
// can happen behind it. REVEAL_CONFIG's own comment already settled the
// principle, having been through this once for scrolling and reading — only
// a hidden tab pauses the clock.
export default function Chat({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}) {
 const [storedQuota,setStoredQuota]=useStored(QUOTA_KEY,'');const quota=parseQuota(storedQuota);const exhausted=quota!==null&&quota.remaining===0;const lowQuota=quota!==null&&quota.remaining>0&&quota.remaining<=QUOTA_WARN_AT;const unlimited=storedQuota===UNLIMITED;const [messages,setMessages]=useState<Message[]>([{key:0,role:'assistant',text:'Hi there. I’m Alex’s portfolio guide. Ask me about his AI projects, skills, certifications, or engineering experience.',source:'Answers from the portfolio'}]);const [input,setInput]=useState('');const [{busy,streaming,slow,writingKey},dispatch]=useReducer(phaseOf,IDLE);const [notice,setNotice]=useState<string|null>(null);const inputRef=useRef<HTMLInputElement>(null);const lastReply=useRef<HTMLDivElement>(null);const box=useRef<HTMLDivElement>(null);const inflight=useRef<AbortController|null>(null);
 // The chat is stateless on the server, so the client is what remembers.
 // Four turns is enough for a follow-up chain to resolve a pronoun without
 // shipping a whole session; `carriedRef` holds the answer ids the last
 // reply drew on, which is what keeps "why wasn't this production?" on the
 // thing it is asking about. See lib/chat/nim.ts.
 const historyRef=useRef<HistoryTurn[]>([]);const carriedRef=useRef<string[]>([]);
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
 // What opening and closing do, keyed on `open` now that the launcher owns
 // it. The launcher toggles it, and so do Escape and the close button through
 // onOpenChange below, so one effect sees every transition from either side:
 // open is tracked as it begins, close in the cleanup as it ends. Same calls,
 // same order as the Sheet's own onOpenChange used to make them. A stale
 // allowance is forgotten while the panel is open, which covers the moment
 // it opens; it is its own effect so an answer updating the allowance does
 // not re-run the open/close pair.
 useEffect(()=>{if(open&&staleQuota(storedQuota))setStoredQuota('')},[open,storedQuota,setStoredQuota]);
 useEffect(()=>{if(!open)return;touchSession();openedAt.current=trackChatOpen('launcher');return()=>{stopSpeaking();trackChatClose({asked:asked.current,answered:answered.current,openedAt:openedAt.current,lastSource:lastSource.current})}},[open]);
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
 useEffect(()=>{const el=box.current;if(!el)return;
  // scrollTop, not scrollIntoView. scrollIntoView walks every scrollable
  // ancestor including the document, which was harmless while the panel was
  // modal and the page was locked. Non-modal, it drags the page behind the
  // panel on every reply.
  const reply=lastReply.current;
  if(lastRole==='assistant'&&reply)el.scrollTo({top:reply.offsetTop-el.offsetTop-8,behavior:'smooth'});
  else el.scrollTop=el.scrollHeight},[turns,lastRole,busy,expired]);
 // The follow scroll does NOT animate, and fires on every token. Text
 // arriving at the bottom of the view should stay in view, and the only way
 // to do that without fighting the animation above is to move the scrollTop
 // directly. Skipped unless the visitor is already near the bottom: someone
 // who scrolled up to reread an earlier answer is not asking to be dragged
 // back down every time a word arrives.
 const written=messages.at(-1)?.text.length??0;
 useEffect(()=>{const el=box.current;if(!el)return;if(el.scrollHeight-el.scrollTop-el.clientHeight<140)el.scrollTop=el.scrollHeight},[written]);
 // `busy` and `streaming` are the phase reducer's; see phaseOf above.
 async function send(text:string,promptIndex:number|null=null){const question=text.trim();if(!question||busy||streaming)return;if(exhausted&&!staleQuota(storedQuota))return;if(question.length>MAX_QUESTION){setNotice(`That question is ${question.length-MAX_QUESTION} characters over the ${MAX_QUESTION} limit. Please shorten it and send again.`);inputRef.current?.focus();return;}
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
  dispatch({type:'ask'});stopSpeaking();
  turn.current+=1;asked.current+=1;
  // Queued before the await: a question asked moments before the tab closes
  // is still recorded, and the pagehide beacon carries it.
  const {startedAt}=trackChatAsk(question,promptIndex,turn.current);
  // The question joins the history only once it has been answered, and only
  // when a guard did not answer it. Sent before the reply, it went out as the
  // last "prior" turn of its own request, so every first question looked
  // mid-conversation to /api/chat. Kept after a guard, a refused question
  // came back as context on the next one. Trim the assistant turn: the model
  // needs the thread of the conversation, not a verbatim transcript, and a
  // 1200-character answer in every subsequent prompt is most of the context
  // window spent on itself.
  const prior=historyRef.current.slice(-4);
  // The reply is kept to TURN_CHARS because that is exactly what the server
  // signed; `sig` goes back with it, and a reply without one (answered
  // locally) is dropped server-side. See lib/chat/turn-sig.ts.
  const remember=(reply:string,guarded:boolean,sig?:string)=>{if(!guarded)historyRef.current=[...historyRef.current,{role:'user' as const,text:question},{role:'assistant' as const,text:reply.slice(0,TURN_CHARS),...(sig?{sig}:{})}].slice(-8)};
  // Owned here and not in ask(), because the Stop button aborts it with
  // 'user'. The transport (both deadlines, the allowance headers, the 429s and
  // the curated answer with its label) is lib/chat/ask.ts.
  const controller=new AbortController();inflight.current=controller;
  // Minted before the request so the streamed placeholder and the finished
  // reply are the same message rather than two.
  const replyKey=nextKey();
  // Tokens do not arrive at a readable rate. They come in bursts, several per
  // network read, and React batches the updates in one tick, so a whole clause
  // lands in a single frame and then nothing happens for half a second.
  // Buffering them and releasing a slice per animation frame turns that into
  // something that reads like writing.
  //
  // The slice is a FRACTION of what is waiting rather than a fixed rate, so it
  // is self-balancing: a full buffer drains fast and never falls behind the
  // model, an almost-empty one trickles. A hidden tab stops firing frames and
  // the buffer simply waits; the terminal frame sets the whole text anyway, so
  // nothing is ever lost.
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
  const outcome=await ask({question,history:prior,carried:carriedRef.current,controller},{onQuota:setStoredQuota,onSlow:()=>dispatch({type:'slow'}),
   // The reply is being written. The turn is created by the first token, not
   // before it: until then the thinking line is the honest thing to show.
   onDelta:text=>{dispatch({type:'token',key:replyKey});pending+=text;if(!pumping){pumping=true;requestAnimationFrame(pump)}}});
  finished=true;pending='';
  const result=outcome.answer;
  if(outcome.notice)setNotice(outcome.notice);
  // Every path ends here, and not only the onDelta one, which is the whole fix
  // for a bug that shipped: a `fallback` frame arriving before any token left
  // busy and slow true, so the approved answer appeared UNDERNEATH "Still
  // working on it" with the stop button still live.
  // The ten minutes runs from the reply, not the question: reading a long
  // answer is not being idle.
  dispatch({type:'done'});
  touchSession();
  remember(result.answer,outcome.guarded,outcome.offline?undefined:result.sig);
  carriedRef.current=Array.isArray(result.ids)?result.ids.slice(0,4):[];
  answered.current+=1;lastSource.current=result.source;
  trackChatAnswer({source:result.source,mode:result.mode,offline:outcome.offline,failure:outcome.failure,status:outcome.status,startedAt,hasHref:Boolean(result.href),answerLen:result.answer.length,turn:turn.current});
  // A stream's terminal frame replaces its own placeholder in place: 'done' is
  // the model's whole reply, and 'fallback' is approved text replacing a
  // partial one that failed a check in lib/chat/nim.ts. Anything else drops the
  // placeholder a stream that never finished may have left, and appends.
  inflight.current=null;setMessages(m=>outcome.kind==='streamed'&&m.some(entry=>entry.key===replyKey)
   ?m.map(entry=>entry.key===replyKey?{...entry,text:result.answer,href:result.href,source:result.source}:entry)
   :trimTranscript([...m.filter(entry=>entry.key!==replyKey),{key:replyKey,role:'assistant' as const,text:result.answer,href:result.href,source:result.source}]));
  inputRef.current?.focus();
 }
 // modal={false} is the whole feature: no focus trap, no scroll lock, no
 // pointer blocking, so the visitor can read and scroll the page with the
 // panel open. disablePointerDismissal is its necessary other half — a
 // non-modal dialog closes on an outside press by default, which would shut
 // the panel the instant they clicked the thing they opened it to ask about.
 // Escape and the close button remain the ways out.
 //
 // `data-track-private` on the transcript: it holds the visitor's own words,
 // and the click tracker skips text inside it.
 return <Sheet open={open} modal={false} disablePointerDismissal onOpenChange={value=>{if(!value)onOpenChange(false)}}><SheetContent showOverlay={false} className="chat-panel"><SheetHeader className="chat-header"><div className="assistant-symbol"><Sparkles size={23}/></div><SheetTitle>Meet the mind behind the work.</SheetTitle><SheetDescription>Portfolio guide · answers from documented work</SheetDescription></SheetHeader><div ref={box} className="chat-messages" role="log" aria-label="Conversation" data-track-private>{messages.map(m=><Row key={m.key} m={m} live={speakingId===`m${m.key}`} writing={m.key===writingKey} canSpeak={canSpeak} replyRef={m.key===messages.at(-1)?.key&&m.role==='assistant'?lastReply:undefined} toggleVoice={toggleVoice}/>)}{busy&&<output aria-live="off" className="thinking">{slow?'Still working on it — this one is being written rather than looked up':'Finding that in the portfolio'}<span className="dots" aria-hidden="true"><i/><i/><i/></span></output>}{notice&&<output aria-live="off" className="thinking">{notice}</output>}{expired&&messages.length>1&&<output aria-live="off" className="thinking">This conversation has been quiet for ten minutes, so it has ended. Your next question starts a fresh thread.</output>}{speechBroken&&<output aria-live="off" className="thinking">{speechFailureHint(navigator.userAgent)}</output>}</div><div className="chat-bottom">{(messages.length===1||expired)&&<div className="chat-suggestions">{prompts.map((p,i)=><button key={p} data-track-tag={`chat-suggestion-${i}`} onClick={()=>send(p,i)}>{p}<ArrowUpRight size={13}/></button>)}</div>}{exhausted&&quota?<div className="chat-limit"><p>You’ve asked today’s {quota.limit} questions. The chat reopens {resetLabel(quota.resetAt)}.</p><p>For anything else, <a data-track-tag="chat-limit-email" href={`mailto:${profile.email}`}>email Alex</a> or <a data-track-tag="chat-limit-linkedin" href={profile.linkedin} target="_blank" rel="noreferrer">message him on LinkedIn</a>.</p></div>:<><p className={`chat-quota${lowQuota?' is-low':''}`} aria-live="polite">{unlimited?'No daily question limit here: signed in as admin, or on a trusted network.':lowQuota&&quota?`${quota.remaining} question${quota.remaining===1?'':'s'} left today, of ${quota.limit}.`:`You can ask up to ${quota?.limit??DAILY_QUESTIONS} questions about Alex a day.`}</p><form onSubmit={e=>{e.preventDefault();void send(input)}}><label htmlFor="chat-input" className="sr-only">Your question about Alex</label><Input ref={inputRef} id="chat-input" value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about my work…" readOnly={busy} aria-busy={busy} aria-invalid={tooLong||undefined} aria-describedby={tooLong?'chat-input-error':input.length>=COUNTER_FROM?'chat-input-count':undefined}/>{busy||streaming?<button type="button" data-track-tag="chat-stop" onClick={()=>inflight.current?.abort('user')} aria-label="Stop this question" title="Stop"><X size={18}/></button>:<button data-track-tag="chat-send" type="submit" disabled={!input.trim()||tooLong} aria-label="Send question"><Send size={18}/></button>}</form>{tooLong?<p id="chat-input-error" className="chat-invalid" role="alert">{input.length-MAX_QUESTION} characters over the {MAX_QUESTION} limit. Shorten the question to send it.</p>:input.length>=COUNTER_FROM?<p id="chat-input-count" className="chat-count">{MAX_QUESTION-input.length} characters left</p>:null}</>}<div className="chat-footnote"><span>Grounded in Alex’s published work.</span><a data-track-tag="chat-email" href={`mailto:${profile.email}`}>Email Alex <ArrowUpRight size={11}/></a></div></div></SheetContent></Sheet>
}
