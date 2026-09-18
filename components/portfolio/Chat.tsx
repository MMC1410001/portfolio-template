'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, ArrowUpRight, Send, Sparkles } from 'lucide-react';
import { Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { answerQuestion,type Answer } from '@/content/faq';
import { profile } from '@/content/portfolio';
import { trackChatOpen, trackChatAsk, trackChatAnswer, trackChatClose, classifyFailure, type ChatFailure } from '@/lib/analytics/chat';
type Message={role:'user'|'assistant';text:string;href?:string;source?:string};
const prompts=['What has Alex built?','What is his tech stack?','What certifications has he completed?'];
export default function Chat({onOpen}:{onOpen:()=>void}) {
 const [open,setOpen]=useState(false);const [messages,setMessages]=useState<Message[]>([{role:'assistant',text:'Hi there. I’m Alex’s portfolio guide. Ask me about his AI projects, skills, certifications, or engineering experience.',source:'Answers from the portfolio'}]);const [input,setInput]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<string|null>(null);const end=useRef<HTMLDivElement>(null);const inputRef=useRef<HTMLInputElement>(null);
 const turn=useRef(0);const asked=useRef(0);const answered=useRef(0);const openedAt=useRef(0);const lastSource=useRef<string|null>(null);
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'})},[messages,busy]);
 async function send(text:string,promptIndex:number|null=null){const question=text.trim();if(!question||busy)return;if(question.length>500){setNotice('That question is too long. Keep it under 500 characters.');return;}setNotice(null);setInput('');setMessages(m=>[...m,{role:'user',text:question}]);setBusy(true);
  turn.current+=1;asked.current+=1;
  // Queued before the await: a question asked moments before the tab closes
  // is still recorded, and the pagehide beacon carries it.
  const {startedAt}=trackChatAsk(question,promptIndex,turn.current);
  let result:Answer;let offline=false;let failure:ChatFailure=null;let status:number|undefined;
  try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:question}),signal:AbortSignal.timeout(8500)});if(!response.ok){status=response.status;throw new Error('status')}result=await response.json()}catch(error){failure=classifyFailure(error);offline=true;result=answerQuestion(question);result.source='Offline · from the portfolio'}
  answered.current+=1;lastSource.current=result.source;
  trackChatAnswer({source:result.source,mode:result.mode,offline,failure,status,startedAt,hasHref:Boolean(result.href),answerLen:result.answer.length,turn:turn.current});
  setMessages(m=>[...m,{role:'assistant',text:result.answer,href:result.href,source:result.source}]);setBusy(false);inputRef.current?.focus();
 }
 return <Sheet open={open} onOpenChange={value=>{setOpen(value);if(value){openedAt.current=trackChatOpen('launcher');onOpen()}else trackChatClose({asked:asked.current,answered:answered.current,openedAt:openedAt.current,lastSource:lastSource.current})}}><SheetTrigger data-track-tag="chat-open" data-track-cta="chat-open" className="chat-launcher"><MessageCircle size={19}/><span>Ask about Alex</span><span className="chat-dot"/></SheetTrigger><SheetContent className="chat-panel"><SheetHeader className="chat-header"><div className="assistant-symbol"><Sparkles size={23}/></div><SheetTitle>Meet the mind behind the work.</SheetTitle><SheetDescription>Portfolio guide · answers from documented work</SheetDescription></SheetHeader><div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">{messages.map((m,i)=><div key={i} className={`message message-${m.role}`}>{m.role==='assistant'&&<span className="message-label">ALEX’S PORTFOLIO</span>}<p>{m.text}</p>{m.href&&<a data-track-tag="chat-source-link" href={m.href} target="_blank" rel="noreferrer">View source <ArrowUpRight size={13}/></a>}{m.source&&<small>{m.source}</small>}</div>)}{busy&&<output className="thinking">Finding that in the portfolio…</output>}{notice&&<output className="thinking">{notice}</output>}<div ref={end}/></div><div className="chat-bottom">{messages.length===1&&<div className="chat-suggestions">{prompts.map((p,i)=><button key={p} data-track-tag={`chat-suggestion-${i}`} onClick={()=>send(p,i)}>{p}<ArrowUpRight size={13}/></button>)}</div>}<form onSubmit={e=>{e.preventDefault();void send(input)}}><label htmlFor="chat-input" className="sr-only">Your question about Alex</label><Input ref={inputRef} id="chat-input" value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about my work…" maxLength={500} disabled={busy}/><button data-track-tag="chat-send" type="submit" disabled={busy||!input.trim()} aria-label="Send question"><Send size={18}/></button></form><div className="chat-footnote"><span>Grounded in Alex’s published work.</span><a data-track-tag="chat-email" href={`mailto:${profile.email}`}>Email Alex <ArrowUpRight size={11}/></a></div></div></SheetContent></Sheet>
}
