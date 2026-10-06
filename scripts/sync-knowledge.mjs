import ts from 'typescript';
import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile(new URL('../content/portfolio.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const data=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
// faq.ts imports two content modules, and neither resolves inside a data: URL
// a relative specifier there has no directory to be relative to. Each is
// transpiled and inlined as its own data URL, so adding a third content import
// to faq.ts means adding it here too, or the prebuild fails loudly rather than
// emitting a knowledge.json missing those answers.
const inline=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const portfolioUrl=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
// faq.ts sees portfolio.ts through this shim, which swaps the two clock readers
// for placeholders that backend/main.py renders per answer. Frozen at prebuild,
// "3 years 10 months" made this file change every month and failed CI's diff
// on it. A closed range cannot drift, so it is still written out. A local
// export shadows the same name from `export *`, which is the whole trick.
const clockShim=`export * from '${portfolioUrl}';import {tenure as live,age as liveAge,BIRTH_MONTH} from '${portfolioUrl}';export const tenure=(from,to)=>to?live(from,to):'{{tenure:'+from+'}}';export const age=to=>to?liveAge(to):'{{age:'+BIRTH_MONTH+'}}';`;
const dashboardsUrl=inline(await readFile(new URL('../content/dashboards.ts',import.meta.url),'utf8'));
const faqSource=(await readFile(new URL('../content/faq.ts',import.meta.url),'utf8'))
 .replace("from './portfolio'",`from 'data:text/javascript;base64,${Buffer.from(clockShim).toString('base64')}'`)
 .replace("from './dashboards'",`from '${dashboardsUrl}'`);
const faqJs=ts.transpileModule(faqSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const faq=await import(`data:text/javascript;base64,${Buffer.from(faqJs).toString('base64')}`);
// The answers' getters run inside JSON.stringify, so the output is rendered
// twice, under two clocks 98 years apart. Any difference is a clock read with
// no placeholder, and it would bring the monthly diff back, so it is refused.
const render=()=>JSON.stringify({profile:data.profile,answers:faq.answers,guard:faq.guard,homoglyphs:faq.HOMOGLYPHS,replies:{guards:faq.GUARD_REPLIES,greeting:faq.GREETING,fallback:faq.FALLBACK}},null,2)+'\n';
const RealDate=globalThis.Date;let pinned=0;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[pinned]))}static now(){return pinned}};
let first,second;
try{pinned=RealDate.UTC(2001,0,15);first=render();pinned=RealDate.UTC(2099,6,15);second=render()}finally{globalThis.Date=RealDate}
if(first!==second)throw new Error('knowledge.json would depend on the date it was generated: an answer reads the clock without a placeholder. See the tenure() comment in content/portfolio.ts.');
await writeFile(new URL('../backend/knowledge.json',import.meta.url),first);
console.log('Synchronized Python knowledge from shared portfolio content.');
