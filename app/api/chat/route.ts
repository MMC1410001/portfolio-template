import { answerQuestion } from '@/content/faq';
import { recordChatHealth } from '@/lib/analytics/chat-health';
import { chargeChatRequest } from '@/lib/analytics/chat-limit';
import { detectLanguage } from '@/lib/chat/language';
import { composeAnswer, nimConfigured, streamAnswer, type ChatTurn } from '@/lib/chat/nim';
/**
 * X-Client-Bucket, and why the backend may believe it.
 *
 * backend/main.py rate-limits on request.client.host and deliberately ignores
 * X-Forwarded-For. Behind this Worker that address is a Cloudflare egress IP,
 * so the WHOLE SITE collapses into one 15-req/60s bucket and a single visitor
 * asking fifteen questions locks the AI path for everybody else.
 *
 * The fix is not to start trusting a forwarded IP. It is to send the salted
 * hash we already computed for our own budget, and have the backend honour it
 * only when CHAT_BACKEND_TOKEN is set and matched, a direct caller cannot
 * produce the token, so it cannot choose its own bucket. With no token
 * configured the backend ignores the header entirely and behaves as before.
 */
export async function POST(request:Request) {
 if(Number(request.headers.get('content-length')||0)>4096)return Response.json({error:'Message too large.'},{status:413});
 let body;try{const text=await request.text();if(text.length>4096)return Response.json({error:'Message too large.'},{status:413});body=JSON.parse(text)}catch{return Response.json({error:'Please send a valid message.'},{status:400})}
 if(!body||typeof body!=='object'||typeof body.message!=='string'||!body.message.trim()||body.message.length>500)return Response.json({error:'Use a message between 1 and 500 characters.'},{status:400});
 // History is the visitor's own words coming back, so it is bounded the same
 // way the question is and never trusted for anything but context: four
 // turns, 500 characters each, two known roles. `carried` is the ids the
 // previous answer cited, which is what keeps a follow-up made of pronouns
 // on the subject it is actually about.
 const history:ChatTurn[]=Array.isArray(body.history)?body.history.filter((t:unknown):t is ChatTurn=>Boolean(t)&&typeof t==='object'&&(( t as ChatTurn).role==='user'||(t as ChatTurn).role==='assistant')&&typeof (t as ChatTurn).text==='string'&&(t as ChatTurn).text.length<=500).slice(-4):[];
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
 // Two classes of question reach the model, and the second one is the whole
 // reason it composes rather than picking an id.
 //
 // First, anything no pattern matched. That has always been its job.
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
 // Third, a question asked in another language. A matched pattern returns
 // approved English prose, which is the right content in the wrong language,
 // and the guards have already run so nothing unsafe reaches this point. The
 // model is handed the same shortlist and told to answer in the language the
 // question used. If it fails, the English answer is served exactly as
 // before: a worse reply, never a wrong one.
 const asked=detectLanguage(body.message);
 const modelEligible=fallback.unmatched===true||(enrichable&&(history.length>0||asked!==null));
 if(backend&&enrichable){
  try{const response=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.CHAT_BACKEND_TOKEN?{'Authorization':`Bearer ${process.env.CHAT_BACKEND_TOKEN}`}:{}),...(client.bucket?{'X-Client-Bucket':client.bucket}:{})},body:JSON.stringify({message:body.message}),signal:AbortSignal.timeout(7000)});if(response.ok){const data=await response.json() as {answer?:string;mode?:string};if(typeof data.answer==='string'){backendOk=true;recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return Response.json({answer:data.answer.slice(0,4000),mode:data.mode==='ai'?'ai':'faq',source:data.mode==='ai'?'AI · grounded in portfolio':fallback.source,href:fallback.href})}}backendFailed=!backendOk}catch{backendFailed=true;/* An unavailable model must never block portfolio answers. */}
 }
 // NVIDIA NIM, called straight from this Worker.
 //
 // Same invariant as the Python tier and for the same reason: the model is
 // handed the approved answer set as data and may return only an answer id,
 // and the prose served back is looked up from content/faq.ts by that id. It
 // cannot author a sentence about Alex. See lib/chat/nim.ts.
 //
 // It runs only when the guards already passed (`enrichable`) and only when
 // the FastAPI tier did not answer, which in production is always, since that
 // service currently has no host. Any failure returns the regex answer.
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
  recordChatHealth({configured:true,ok:true,failed:false,guarded:false});
  const encoder=new TextEncoder();
  const curated=fallback.id?{...fallback,ids:[fallback.id]}:fallback;
  const stream=new ReadableStream({async start(controller){
   const send=(event:string,data:unknown)=>controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
   try{
    for await(const part of streamAnswer(body.message,history,fallback.id?[fallback.id,...carried]:carried,request.signal)){
     if(part.type==='delta')send('delta',{text:part.text});
     else if(part.type==='done')send('done',{answer:part.answer,href:part.href??fallback.href,ids:part.ids,source:'AI · grounded in portfolio',mode:'ai'});
     else send('fallback',curated);
    }
   }catch{
    // The generator itself failing is the same outcome as the model
    // failing: the visitor gets the approved answer either way.
    send('fallback',curated);
   }
   controller.close();
  }});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store','X-Accel-Buffering':'no'}});
 }
 if(modelEligible&&!backendOk&&nimConfigured()){
  const picked=await composeAnswer(body.message,history,fallback.id?[fallback.id,...carried]:carried);
  if(picked){recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return Response.json({answer:picked.answer.slice(0,4000),mode:'ai',source:'AI · grounded in portfolio',href:picked.href??fallback.href,ids:picked.ids})}
  modelFailed=true;
 }
 // Coarse counters only, no question text. This is the one thing that
 // knows whether PYTHON_CHAT_URL answered, which the client provably
 // cannot. Rendered in its own card so it cannot double-count chat_*.
 recordChatHealth({configured:Boolean(backend)||nimConfigured(),ok:backendOk,failed:backendFailed||modelFailed,guarded:shortCircuited});
 return Response.json(fallback.id?{...fallback,ids:[fallback.id]}:fallback);
}
