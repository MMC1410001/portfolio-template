import { answerQuestion } from '@/content/faq';
import { recordChatHealth } from '@/lib/analytics/chat-health';
import { chargeChatRequest } from '@/lib/analytics/chat-limit';
import { nimConfigured, selectAnswer } from '@/lib/chat/nim';
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
 // The model tier takes the OPPOSITE class of question to the FastAPI tier:
 // only the one no pattern matched.
 //
 // It was briefly the union of both, and `npm run test:chat` caught why that
 // is wrong within one run. Asked "What did he do at Northwind?" the model
 // preferred the company answer over the experience answer. Both are approved
 // prose, neither is false, and the reply was worse -- the patterns in
 // content/faq.ts are hand-tuned against these exact questions, so a model
 // overruling a match it did not need to make can only regress. The gap the
 // regex leaves is the only place a model adds anything.
 //
 // Safe because every guard runs first and returns its own source, so
 // `unmatched` is set only after sensitive, abuse, personal, unknown and
 // off-topic have all passed -- and because the model may still name nothing
 // but an approved answer id.
 const modelEligible=fallback.unmatched===true;
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
 if(modelEligible&&!backendOk&&nimConfigured()){
  const picked=await selectAnswer(body.message);
  if(picked){recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return Response.json({answer:picked.answer.slice(0,4000),mode:'ai',source:'AI · grounded in portfolio',href:picked.href??fallback.href})}
  modelFailed=true;
 }
 // Coarse counters only, no question text. This is the one thing that
 // knows whether PYTHON_CHAT_URL answered, which the client provably
 // cannot. Rendered in its own card so it cannot double-count chat_*.
 recordChatHealth({configured:Boolean(backend)||nimConfigured(),ok:backendOk,failed:backendFailed||modelFailed,guarded:shortCircuited});
 return Response.json(fallback);
}
