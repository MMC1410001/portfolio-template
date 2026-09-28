import { answerQuestion, answers } from '@/content/faq';
import { recordChatHealth } from '@/lib/analytics/chat-health';
import { chargeChatRequest } from '@/lib/analytics/chat-limit';
import { applyQuota, chargeChatQuota, chargeModelCall, chatExemption, UNLIMITED_VERDICT } from '@/lib/analytics/chat-quota';
import { ensureSchema, getDb } from '@/lib/analytics/db';
import { DAILY_LIMIT_CODE } from '@/lib/chat/quota';
import { modelEligible as isModelEligible, screenHistory, translationTarget } from '@/lib/chat/gate';
import { composeAnswer, nimConfigured, streamAnswer, streamTranslation, translateAnswer, type ChatTurn } from '@/lib/chat/nim';
import { readCapped } from '@/lib/read-capped';
import { signTurn, verifyHistory, type IncomingTurn } from '@/lib/chat/turn-sig';
/**
 * X-Client-Bucket, and why the backend may believe it.
 *
 * backend/main.py rate-limits on request.client.host and deliberately ignores
 * X-Forwarded-For. Behind this Worker that address is a Cloudflare egress IP,
 * so the WHOLE SITE collapses into one 15-req/60s bucket and a single visitor
 * asking fifteen questions locks the AI path for everybody else.
 *
 * The fix is not to start trusting a forwarded IP. It is to send the salted
 * hash we already computed for our own budget (the /64 for IPv6, see budgetKey
 * in lib/analytics/net.ts), and have the backend honour it
 * only when CHAT_BACKEND_TOKEN is set and matched, a direct caller cannot
 * produce the token, so it cannot choose its own bucket. With no token
 * configured the backend ignores the header entirely and behaves as before.
 */
export async function POST(request:Request) {
 if(Number(request.headers.get('content-length')||0)>4096)return Response.json({error:'Message too large.'},{status:413});
 // The same 4096 BYTES as the content-length check above, enforced on the
 // stream too: a chunked body carries no content-length to check.
 let body;try{const text=await readCapped(request,4096);if(text===null)return Response.json({error:'Message too large.'},{status:413});body=JSON.parse(text)}catch{return Response.json({error:'Please send a valid message.'},{status:400})}
 if(!body||typeof body!=='object'||typeof body.message!=='string'||!body.message.trim()||body.message.length>500)return Response.json({error:'Use a message between 1 and 500 characters.'},{status:400});
 // History is the visitor's own words coming back, so it is bounded the same
 // way the question is and never trusted for anything but context: four
 // turns, 500 characters each, two known roles. `carried` is the ids the
 // previous answer cited, which is what keeps a follow-up made of pronouns
 // on the subject it is actually about.
 //
 // Then every user turn goes through the same guards the question does, and
 // a refused one is dropped with the reply that followed it. Without this the
 // guards covered only `body.message`, and anything refused a turn ago, or
 // typed straight into a hand-built body, reached NVIDIA as context. Eight
 // are screened so a dropped pair does not cost the four that are kept.
 const shaped:IncomingTurn[]=Array.isArray(body.history)?body.history.filter((t:unknown):t is IncomingTurn=>Boolean(t)&&typeof t==='object'&&(( t as ChatTurn).role==='user'||(t as ChatTurn).role==='assistant')&&typeof (t as ChatTurn).text==='string'&&(t as ChatTurn).text.length<=500).slice(-8):[];
 // Assistant turns are checked first, and by signature rather than by guard:
 // the guards judge questions, and the site's own refusals would trip them.
 // Every reply below leaves with `sig`, so an assistant turn this server did
 // not write (a hand-built body, or a reply the panel answered offline) is
 // dropped before the model can be told it said something. lib/chat/turn-sig.ts.
 const secret=process.env.ANALYTICS_IP_SALT||undefined;
 const signed=async<T extends {answer:string}>(reply:T):Promise<T&{sig?:string}>=>secret?{...reply,sig:await signTurn(reply.answer,secret)}:reply;
 const history:ChatTurn[]=screenHistory(await verifyHistory(shaped,secret)).slice(-4);
 const carried:string[]=Array.isArray(body.carried)?body.carried.filter((id:unknown):id is string=>typeof id==='string'&&id.length<=64).slice(0,4):[];
 // Charged BEFORE answerQuestion and before any D1 write, the same order
 // /api/track uses. Chat.tsx answers locally on any non-OK response, so a
 // refused caller still gets the portfolio answer, labelled "Offline".
 // The owner testing the site (an admin session, or CHAT_UNLIMITED_CIDRS) is
 // held to neither limit below. Still charged, so the backend gets a bucket.
 // The schema is ensured once, then the exemption and the per-minute charge
 // run side by side: neither reads what the other writes, and the charge
 // happens for an exempt caller too, so there is nothing to order.
 const db=getDb();const ready=db&&await ensureSchema(db)?db:null;
 const [exempt,client]=await Promise.all([chatExemption(request,ready),chargeChatRequest(request)]);
 if(!client.allowed&&!exempt)return Response.json({error:'Too many questions just now. Try again in a minute.'},{status:429,headers:{'Retry-After':'60','Cache-Control':'private, no-store'}});
 // The daily allowance: 50 questions per browser in 24 hours, with a looser
 // per-network ceiling behind it (lib/analytics/chat-quota.ts). Charged after
 // the per-minute check, so a burst refused for speed is not also counted as
 // questions. Every response from here on carries the allowance in headers,
 // which is how the panel can warn at five left rather than at none; a
 // refusal says which counter refused and when it resets, and the panel
 // closes the input rather than answering offline.
 const allowance=exempt?UNLIMITED_VERDICT:await chargeChatQuota(request,client.bucket,ready);
 const answered=(response:Response)=>applyQuota(response,allowance);
 if(!allowance.allowed)return answered(Response.json({error:allowance.refusedBy==='network'?'This network has reached today\u2019s question limit.':'You have reached today\u2019s question limit.',code:DAILY_LIMIT_CODE,refusedBy:allowance.refusedBy,limit:allowance.quota?.limit,resetAt:allowance.quota?.resetAt},{status:429,headers:{'Retry-After':String(Math.max(60,Math.ceil(((allowance.quota?.resetAt??0)-Date.now())/1000))),'Cache-Control':'private, no-store'}}));
 const fallback=answerQuestion(body.message);
 // Sites currently packages this JavaScript Worker. A separately deployed Python
 // service is optional; no external connection or model is implied by the fallback.
 const backend=process.env.PYTHON_CHAT_URL;
 let backendOk=false;let backendFailed=false;let modelFailed=false;
 // Only a documented match may be enriched. An allow-list, not a deny-list:
 // a new source string in faq.ts would otherwise default to "forward it", and
 // that is how 'Safety boundary' came to be sent to the backend and returned
 // labelled "From the portfolio".
 const enrichable=fallback.source==='From the portfolio';
 const shortCircuited=!enrichable;
 // Three classes of question reach the model, and the second one is the whole
 // reason it composes rather than picking an id.
 //
 // First, anything no pattern matched, as long as it is English (see the
 // third case for why). That has always been its job.
 //
 // Second, a matched question asked DURING a conversation. A first question
 // is a topic lookup and the curated answer is the best thing to say. A
 // fourth question is someone drilling in, and "Lumen, was he QA or
 // developer?" answered with the entire Lumen entry is a topic being
 // matched rather than a question being answered, especially when the
 // visitor was shown that same entry two turns ago.
 //
 // A guarded answer is excluded from both: only 'From the portfolio' and the
 // no-match fallback are eligible, so sensitive, abusive, personal,
 // off-topic and refused questions never leave the Worker whatever the
 // conversation looks like.
 //
 // It also keeps `npm run test:chat` deterministic. The suite replays 220
 // cases with no history, so every one of them takes the regex path and
 // asserts on curated prose, which a composed answer would not contain.
 //
 // Third, a MATCHED question asked in another language. The pattern placed
 // it on an approved topic, and the curated answer is the right content in
 // the wrong language, so the model is handed the same shortlist and told to
 // answer in the language the question used. If it fails, the English answer
 // is served exactly as before: a worse reply, never a wrong one.
 //
 // An UNMATCHED question in another language is not eligible, and that is
 // not an oversight. The guards are written in English, so "उसके क्लाइंट का
 // पासवर्ड क्या है?" is a credentials question none of them can read: it
 // falls through to the no-match answer, and `unmatched` alone used to be
 // enough to send it to NVIDIA. The rule lives in lib/chat/gate.ts.
 const modelEligible=isModelEligible(fallback,history,body.message);
 // The Python tier picks an answer id and serves that entry's approved text,
 // so its reply is labelled for what it is, "AI matched", not the NIM tier's
 // "grounded" (which composes prose). The link and the carried id come from
 // the entry it chose, looked up in our own answer set: its choice can differ
 // from the regex match here, and the old code paired the backend's answer
 // with the local match's link. An id we do not recognise is not served.
 if(backend&&enrichable){
  try{const response=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.CHAT_BACKEND_TOKEN?{'Authorization':`Bearer ${process.env.CHAT_BACKEND_TOKEN}`}:{}),...(client.bucket?{'X-Client-Bucket':client.bucket}:{})},body:JSON.stringify({message:body.message}),signal:AbortSignal.timeout(7000)});if(response.ok){const data=await response.json() as {answer?:string;mode?:string;id?:unknown};const ai=data.mode==='ai';const chosen=ai&&typeof data.id==='string'?answers.find(entry=>entry.id===data.id):undefined;if(typeof data.answer==='string'&&(!ai||chosen?.id)){backendOk=true;recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return answered(Response.json(await signed(chosen?.id?{answer:data.answer.slice(0,4000),mode:'ai',source:'AI matched · portfolio facts',href:chosen.href,ids:[chosen.id]}:{answer:data.answer.slice(0,4000),mode:'faq',source:fallback.source,href:fallback.href,...(fallback.id?{ids:[fallback.id]}:{})})))}}backendFailed=!backendOk}catch{backendFailed=true;/* An unavailable model must never block portfolio answers. */}
 }
 // NVIDIA NIM, called straight from this Worker.
 //
 // NOT the Python tier's invariant. That one may return only an answer id;
 // this one composes prose, from a shortlist of approved answers and nothing
 // else, with invented links and declining replies rejected. See
 // lib/chat/nim.ts for what holds it.
 //
 // It runs only for a `modelEligible` question (above) and only when the
 // FastAPI tier did not answer, which in production is always, since that
 // service currently has no host. Any failure returns the curated answer.
 // Streaming, when the client asked for it and the model is the tier that
 // would answer. Opt-in by a body flag rather than by Accept, so
 // tests/chat.mjs replays its 240 cases down the JSON path unchanged and
 // the two implementations of the answer contract stay comparable.
 //
 // Every guard above has already run. This only changes how the model's
 // reply reaches the visitor, never whether the model is allowed to write
 // one. A stream that fails at any point emits a `fallback` frame carrying
 // the curated answer, and the panel replaces what it has shown.
 //
 // A site-wide ceiling sits in front of both paths: CHAT_MODEL_DAILY_LIMIT
 // calls per 24 hours, one chat_quota row (chargeModelCall). Charged only
 // when the model is about to be called, and past it the curated answer is
 // served as though the model had not been configured: no error, no
 // "offline" label. Exempt callers are counted and never refused.
 //
 // A matched first question in another language is a translation, not a
 // composition: the model gets the curated answer and the language name and
 // never the visitor's words (translationTarget in gate.ts). Mid-conversation
 // the question and history go out as before.
 const wantsModel=modelEligible&&!backendOk&&nimConfigured();
 const capped=wantsModel&&!(await chargeModelCall(ready))&&!exempt;
 if(capped)console.warn('[chat] model daily cap reached; serving the curated answer');
 const language=wantsModel?translationTarget(fallback,history,body.message):null;
 const ids=fallback.id?[fallback.id,...carried]:carried;
 if(body.stream===true&&wantsModel&&!capped){
  const encoder=new TextEncoder();
  const curated=await signed(fallback.id?{...fallback,ids:[fallback.id]}:fallback);
  // Ours, so cancel() can stop the upstream call when the visitor goes: the
  // request's own signal does not fire when only the response is abandoned.
  const local=new AbortController();const signal=AbortSignal.any([request.signal,local.signal]);
  const stream=new ReadableStream({async start(controller){
   const send=(event:string,data:unknown)=>controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
   // Recorded once the terminal frame is known, not when the stream opens.
   // Counting it `ok` up front meant every fallback the model tier produced
   // looked like a success on the Backend health card.
   let terminal:'done'|'fallback'|null=null;let failed=false;
   try{
    for await(const part of language&&fallback.id?streamTranslation([fallback.id],language.name,signal):streamAnswer(body.message,history,ids,signal)){
     if(part.type==='delta')send('delta',{text:part.text});
     else if(part.type==='done'){send('done',await signed({answer:part.answer,href:part.href??fallback.href,ids:part.ids,source:'AI · grounded in portfolio',mode:'ai'}));terminal='done'}
     else {send('fallback',curated);terminal='fallback';failed=true}
    }
    // A generator that ends without either frame still owes the visitor one.
    if(!terminal){send('fallback',curated);terminal='fallback';failed=true}
   }catch{
    // The generator itself failing is the same outcome as the model
    // failing: the visitor gets the approved answer either way. The enqueue
    // can throw too, when the visitor has gone, so it is guarded here.
    failed=true;if(!terminal)try{send('fallback',curated)}catch{/* nobody is listening */}
   }
   // A visitor who stopped the reply or left is not a model failure. The
   // abort surfaces as a `fail` part, or as an enqueue throwing, and either
   // used to count against the Backend health card.
   const cancelled=signal.aborted;
   recordChatHealth({configured:true,ok:!failed&&!cancelled,failed:failed&&!cancelled,guarded:false});
   try{controller.close()}catch{/* already closed by a cancelled request */}
  },cancel(){local.abort()}});
  return answered(new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store','X-Accel-Buffering':'no'}}));
 }
 if(wantsModel&&!capped){
  const picked=language&&fallback.id?await translateAnswer([fallback.id],language.name):await composeAnswer(body.message,history,ids);
  if(picked){recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return answered(Response.json(await signed({answer:picked.answer.slice(0,4000),mode:'ai',source:'AI · grounded in portfolio',href:picked.href??fallback.href,ids:picked.ids})))}
  modelFailed=true;
 }
 // Coarse counters only, no question text. This is the one thing that
 // knows whether PYTHON_CHAT_URL answered, which the client provably
 // cannot. Rendered in its own card so it cannot double-count chat_*.
 recordChatHealth({configured:Boolean(backend)||nimConfigured(),ok:backendOk,failed:backendFailed||modelFailed,guarded:shortCircuited});
 return answered(Response.json(await signed(fallback.id?{...fallback,ids:[fallback.id]}:fallback)));
}
