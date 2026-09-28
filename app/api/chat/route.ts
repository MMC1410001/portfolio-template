import { answerQuestion } from '@/content/faq';
import { recordChatHealth } from '@/lib/analytics/chat-health';
import { chargeChatRequest } from '@/lib/analytics/chat-limit';
import { modelEligible as isModelEligible, screenHistory } from '@/lib/chat/gate';
import { composeAnswer, nimConfigured, streamAnswer, type ChatTurn } from '@/lib/chat/nim';
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
 const client=await chargeChatRequest(request);
 if(!client.allowed)return Response.json({error:'Too many questions just now. Try again in a minute.'},{status:429,headers:{'Retry-After':'60','Cache-Control':'private, no-store'}});
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
 if(backend&&enrichable){
  try{const response=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.CHAT_BACKEND_TOKEN?{'Authorization':`Bearer ${process.env.CHAT_BACKEND_TOKEN}`}:{}),...(client.bucket?{'X-Client-Bucket':client.bucket}:{})},body:JSON.stringify({message:body.message}),signal:AbortSignal.timeout(7000)});if(response.ok){const data=await response.json() as {answer?:string;mode?:string};if(typeof data.answer==='string'){backendOk=true;recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return Response.json(await signed({answer:data.answer.slice(0,4000),mode:data.mode==='ai'?'ai':'faq',source:data.mode==='ai'?'AI · grounded in portfolio':fallback.source,href:fallback.href}))}}backendFailed=!backendOk}catch{backendFailed=true;/* An unavailable model must never block portfolio answers. */}
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
 if(body.stream===true&&modelEligible&&!backendOk&&nimConfigured()){
  const encoder=new TextEncoder();
  const curated=await signed(fallback.id?{...fallback,ids:[fallback.id]}:fallback);
  const stream=new ReadableStream({async start(controller){
   const send=(event:string,data:unknown)=>controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
   // Recorded once the terminal frame is known, not when the stream opens.
   // Counting it `ok` up front meant every fallback the model tier produced
   // looked like a success on the Backend health card.
   let terminal:'done'|'fallback'|null=null;let failed=false;
   try{
    for await(const part of streamAnswer(body.message,history,fallback.id?[fallback.id,...carried]:carried,request.signal)){
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
   recordChatHealth({configured:true,ok:!failed,failed,guarded:false});
   try{controller.close()}catch{/* already closed by a cancelled request */}
  }});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store','X-Accel-Buffering':'no'}});
 }
 if(modelEligible&&!backendOk&&nimConfigured()){
  const picked=await composeAnswer(body.message,history,fallback.id?[fallback.id,...carried]:carried);
  if(picked){recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return Response.json(await signed({answer:picked.answer.slice(0,4000),mode:'ai',source:'AI · grounded in portfolio',href:picked.href??fallback.href,ids:picked.ids}))}
  modelFailed=true;
 }
 // Coarse counters only, no question text. This is the one thing that
 // knows whether PYTHON_CHAT_URL answered, which the client provably
 // cannot. Rendered in its own card so it cannot double-count chat_*.
 recordChatHealth({configured:Boolean(backend)||nimConfigured(),ok:backendOk,failed:backendFailed||modelFailed,guarded:shortCircuited});
 return Response.json(await signed(fallback.id?{...fallback,ids:[fallback.id]}:fallback));
}
