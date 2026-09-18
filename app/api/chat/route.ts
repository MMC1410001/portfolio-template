import { answerQuestion } from '@/content/faq';
import { recordChatHealth } from '@/lib/analytics/chat-health';
import { chargeChatRequest } from '@/lib/analytics/chat-limit';
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
 let backendOk=false;let backendFailed=false;
 // Only a documented match may be enriched. An allow-list, not a deny-list:
 // a new source string in faq.ts would otherwise default to "forward it", and
 // that is how 'Safety boundary' came to be sent to the backend and returned
 // labelled "From the portfolio".
 const enrichable=fallback.source==='From the portfolio';
 const shortCircuited=!enrichable;
 if(backend&&enrichable){
  try{const response=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.CHAT_BACKEND_TOKEN?{'Authorization':`Bearer ${process.env.CHAT_BACKEND_TOKEN}`}:{}),...(client.bucket?{'X-Client-Bucket':client.bucket}:{})},body:JSON.stringify({message:body.message}),signal:AbortSignal.timeout(7000)});if(response.ok){const data=await response.json() as {answer?:string;mode?:string};if(typeof data.answer==='string'){backendOk=true;recordChatHealth({configured:true,ok:true,failed:false,guarded:false});return Response.json({answer:data.answer.slice(0,4000),mode:data.mode==='ai'?'ai':'faq',source:data.mode==='ai'?'AI · grounded in portfolio':fallback.source,href:fallback.href})}}backendFailed=!backendOk}catch{backendFailed=true;/* An unavailable model must never block portfolio answers. */}
 }
 // Coarse counters only, no question text. This is the one thing that
 // knows whether PYTHON_CHAT_URL answered, which the client provably
 // cannot. Rendered in its own card so it cannot double-count chat_*.
 recordChatHealth({configured:Boolean(backend),ok:backendOk,failed:backendFailed,guarded:shortCircuited});
 return Response.json(fallback);
}
