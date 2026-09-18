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
const dashboardsUrl=inline(await readFile(new URL('../content/dashboards.ts',import.meta.url),'utf8'));
const faqSource=(await readFile(new URL('../content/faq.ts',import.meta.url),'utf8'))
 .replace("from './portfolio'",`from 'data:text/javascript;base64,${Buffer.from(js).toString('base64')}'`)
 .replace("from './dashboards'",`from '${dashboardsUrl}'`);
const faqJs=ts.transpileModule(faqSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const faq=await import(`data:text/javascript;base64,${Buffer.from(faqJs).toString('base64')}`);
await writeFile(new URL('../backend/knowledge.json',import.meta.url),JSON.stringify({profile:data.profile,answers:faq.answers,guard:faq.guard},null,2)+'\n');
console.log('Synchronized Python knowledge from shared portfolio content.');
