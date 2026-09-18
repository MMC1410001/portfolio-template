import {readFile} from 'node:fs/promises';
const cases=JSON.parse(await readFile(new URL('./chat-cases.json',import.meta.url),'utf8'));
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
for(const [message,expected] of cases){const r=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});const body=await r.json();if(!r.ok||!body.answer?.toLowerCase().includes(expected.toLowerCase()))throw new Error(`Failed: ${message}\n${JSON.stringify(body)}`)}
for(const body of [null,[],{message:''},{message:'x'.repeat(501)},{message:2},{}]){const r=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(r.status!==400)throw new Error(`Input validation returned ${r.status}`)}
console.log(`Passed ${cases.length} portfolio-answer cases and 6 input-validation cases.`);
