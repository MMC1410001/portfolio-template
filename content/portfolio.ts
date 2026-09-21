export type Project = { id: string; name: string; category: string; description: string; stack: string[]; repo?: string; href?: string; kind: string; detail: string; flow: [string, string, string]; outcome?: string };
/** A grouped sub-product, for a client engagement covering more than one. */
export type ProjectItem = { id: string; name: string; aliases: string[]; description: string };
/**
 * One product Alex has contributed to.
 *
 * `role` is the one line the card shows; `description` is the longer prose the
 * chatbot answers with, and `aliases` are what reach it. An entry without both
 * of the latter simply has no answer of its own. See the derivation in faq.ts.
 */
export type WorkItem = { id: string; name: string; category: string; group: 'built' | 'quality'; role: string; href: string | null; aliases?: string[]; description?: string; stack?: string[]; items?: ProjectItem[]; itemsLabel?: string };
export const profile = {
 name: 'Alex Rivera', fullName: 'Alex Morgan Rivera', role: 'AI Full Stack Developer', location: 'Austin, United States', residence: 'Austin, Texas 78701', email: 'alex@example.com', phone: '+1 555 0142',
 photo: '/portrait-900.jpg', photoLarge: '/portrait-1600.jpg', avatar: '/avatar.jpg', github: 'https://github.com/example-dev', linkedin: 'https://www.linkedin.com/in/example-dev/', twitter: 'https://x.com/exampledev', instagram: 'https://www.instagram.com/exampledev/',
 summary: 'I build connected experiences, from the interface you touch to the intelligence behind it. I came into development through quality engineering. Two and a half years of test automation before moving to full stack is why I build systems meant to be verified, not just shipped.',
 availability: 'Open to opportunities · 60-day notice, buyout available',
 openTo: 'Austin · Denver · Seattle · Remote',
 relocation: 'Holds a valid passport; open to sponsored relocation to the UK, EU, Canada or Australia',
};
export const projects: Project[] = [
 {id:'analytics',name:'Portfolio analytics',category:'PRODUCT ENGINEERING',description:'The analytics behind this site: event ingest, section dwell, click heatmaps, conversion funnels, and a dashboard behind Google sign-in. No visitor IP is ever stored.',stack:['Cloudflare Workers','D1','WebCrypto','Google SSO'],href:'/analytics',kind:'Running in production',flow:['VISIT','INGEST','DASHBOARD'],detail:'A first-party analytics system built for this portfolio and running on Cloudflare Workers with a D1 database. It records page views, section dwell time, click heatmaps and conversion funnels, behind an admin dashboard gated by Google sign-in with HMAC-signed sessions. Visitors are identified by a rotating salted hash rather than an IP address. The site around it runs on vinext, a Next.js App Router reimplementation on Vite, with a statically rendered homepage and a chatbot that degrades through three tiers so it keeps answering with the server down. The dashboard is demonstrated publicly on synthetic data at /analytics.'},
 {id:'mcp',name:'MCP RAG server',category:'AI SYSTEMS',description:'Give AI assistants a searchable memory. Ingest documents, retrieve context, and ask grounded questions through MCP.',stack:['Python','MCP','ChromaDB'],repo:'mcp-rag-server',kind:'Open source project',flow:['DOCUMENTS','MCP','CONTEXT'],detail:'A Python MCP server with tools for document ingestion, semantic search, question answering, listing, and deletion. Uses Sentence Transformers for local embeddings, ChromaDB for storage, and an Anthropic integration.'},
 {id:'voice',name:'Realtime voice agent',category:'CONVERSATIONAL AI',description:'A voice assistant built around realtime conversation, interruption handling, and configurable prompts.',stack:['FastAPI','LiveKit','OpenAI Realtime'],repo:'realtime-voice-agent',kind:'Reference prototype',flow:['VOICE','LIVE','RESPONSE'],outcome:'Under 2s turn latency with working barge-in, across Hindi, English, Gujarati and Marathi.',detail:'A voice agent prototype connecting LiveKit and OpenAI Realtime with a FastAPI token service. YAML prompt configuration covers language, interruptions, and escalation. A reference implementation, not a production service.'},
 {id:'notes',name:'Notesgen',category:'FULL STACK + AI',description:'Turn course material into structured notes, with a local web interface, browser extension, and flexible exports.',stack:['Python','FastAPI','Gemini'],repo:'Utility_With_UI_for_notes',kind:'Open source project',flow:['SOURCE','AI','NOTES'],outcome:'Handles transcripts up to 180 minutes; structured notes out in about 5 minutes.',detail:'A local learning workflow with a FastAPI UI and Chrome extension. Supports Gemini, OpenAI, and Anthropic providers and export formats including Markdown, PDF, HTML, DOCX, and Google Docs.'},
 {id:'pipeline',name:'Scheme automation',category:'FULL STACK',description:'A workflow that turns spreadsheets into structured data, connecting a React interface with validation and cloud pipeline orchestration.',stack:['React','TypeScript','Express'],repo:'scheme-automation',kind:'Sanitized reference',flow:['SPREADSHEET','API','PIPELINE'],outcome:'Replaces a manual routine where sheets from several departments were reconciled by hand against historical data and email threads.',detail:'A React 19 and TypeScript frontend with Express, BigQuery, Google Cloud Storage, and Cloud Run integration. This public repository is a sanitized reference implementation; cloud configuration and authentication are not included.'},
];
// Contributions supplied by Alex. Lumen's stack and admin capabilities
// were cross-checked against its repository; private source links stay private.
// These summaries are deliberately limited to safe public scope. They describe
// the kind of work Alex has done without exposing private code, client data,
// infrastructure, configurations, test artifacts, or security findings.
export const privateWork = [
 {id:'ai-quality-research',name:'AI quality and evaluation',aliases:['ai quality','ai quality work','ai quality research','ai qa demo','rag testing','agent testing','llm evaluation','langsmith experiments','ai testing framework'],description:'Learning and prototype work around RAG evaluation, agent testing, LLM tracing, and AI assisted test automation. It demonstrates an evaluation focused approach without sharing prompts, datasets, model settings, or internal test results.'},
 {id:'uptime-monitoring',name:'Uptime and health monitoring',aliases:['uptime kuma','uptime monitoring','uptime','health check','health checks','health monitoring','monitoring','monitor','observability','downtime','alerting','alerts','incident alerting','status page','sla','availability','synthetic monitoring','google chat alerts','gchat alerts'],description:'Set up and runs Uptime Kuma as the monitoring layer across the applications he works on, covering both halves of each one: HTTP checks on frontends and API endpoints, and TCP and port checks on the services behind them, grouped per application so a parent monitor reports the whole stack. Failures raise a Google Chat notification through an incoming webhook, with retry counts and a shorter recheck interval on a failing monitor so a single slow response does not page anyone and a real outage is confirmed within minutes. Certificate expiry and response-time trends are tracked on the same dashboard. The portfolio shares the setup and the reasoning, not the monitored hosts, their names, or their availability data.'},
 {id:'automation-performance',name:'Automation and performance engineering',aliases:['k6 performance','load testing','jmeter','locust','qa macro','browser automation','playwright automation'],description:'Private automation and performance work spans browser tests, macro tooling, and load testing harnesses. The portfolio shares the capability, not target applications, test plans, thresholds, or execution data.'},
 {id:'application-prototypes',name:'Application and workflow prototypes',aliases:['frappe test','frappe learning','n8n automation','qa os','qa workflow agent','mcp assignment','claude mcp','speech generation','link checker'],description:'Built learning and prototype work with Frappe and ERPNext, workflow automation, MCP and RAG, browser utilities, and speech generation. Public descriptions omit workflow exports, endpoints, and source files.'},
 {id:'apex-pharma',name:'Apex Pharma HR feedback automation',aliases:['apex pharma','apex hr','new joiner feedback','new-joiner feedback','hr feedback automation'],description:'A proof of concept for collecting new joiner feedback within an HR workflow. User records, configuration, and operational details are private.'},
 {id:'onefinance',name:'Nimbus Finance product visibility portal',aliases:['nimbus finance','product visibility portal','organisation visibility'],description:'Brief and research work supporting a product visibility portal. Internal requirements, analytics, and delivery material are private.'},
 {id:'private-work-overview',name:'Selected private work',aliases:['private work','private projects','confidential projects','client work','client projects','private portfolio'],description:'Alex maintains private work across applied AI quality, automation, performance engineering, and internal application delivery. Public summaries cover goals and outcomes only; code, data, infrastructure, configurations, security findings, and access details remain private.'},
];
// Workflow scope and development attribution were checked against Alex's
// automation tracker and the northwind_erp source. Internal documents stay private.
export const erpProject = {
 id: 'northwind-erp', name: 'Northwind ERP automation', category: 'ENTERPRISE APPLICATIONS',
 description: 'Developed seven live internal workflows, including systems built with teammates, using Frappe and ERPNext. Connected Python business logic with web interfaces, approval flows, notifications, and traceable records.',
 stack: ['Frappe', 'ERPNext', 'Python', 'JavaScript', 'SQL', 'HRMS'],
 workflows: [
  {id:'okr',name:'OKR management',contribution:'Development',aliases:['okr','okrs','objectives and key results'],description:'Employee objectives and key results with manager approval, monthly reviews, progress tracking, and revision snapshots.'},
  {id:'employee-feedback',name:'Employee feedback at 30, 60, and 90 days',contribution:'Collaborative development',aliases:['employee feedback','30-60-90','30 60 90','30–60–90','feedback system'],description:'Helped build the workflow for collecting employee feedback at 30, 60, and 90 days.'},
  {id:'requirements',name:'Requirements management',contribution:'Development',aliases:['requirements management','requirement document','brd','business requirements'],description:'BRD submission, review, approval, and rework, with document versions and sequential delivery stages that capture blockers and holds.'},
  {id:'rca',name:'RCA document management',contribution:'Development',aliases:['rca','root cause','root-cause'],description:'Root cause analysis document reviews with approval and rework flows, version history, activity records, and notifications.'},
  {id:'subscriptions',name:'Subscription management',contribution:'Development',aliases:['subscription management','subscriptions','subscription system','renewals'],description:'Subscription requests routed through approval and finance review, with renewal records and expiry reminders.'},
  {id:'password-management',name:'Password management',contribution:'Development',aliases:['password management','credential vault','credential management'],description:'Credential records with owner and approver workflows, changes that require approval, reveal and copy activity logs, and MFA metadata.'},
  {id:'document-management',name:'Document management',contribution:'Collaborative development',aliases:['document management','dms','project document'],description:'Project document reviews with manager and client approvals, revision history, controlled editing, and tracking of execution stages.'},
 ],
};
export const experience = [
 {company:'Northwind Systems',url:'https://northwind.example/',about:'IT and technology consulting: apps, websites and engineering talent across development, QA, project management and cloud, delivered for measurable client outcomes.',role:'Full Stack Developer',dates:'Mar 2025 to Present',summary:'Develops Frappe and ERPNext workflows for document approvals, OKRs, employee feedback, subscriptions, and credential management. Previously AI QA at Northwind, before moving into full stack development. Built Python evaluation pipelines with LangSmith and RAGAs for AI applications. Developed web and mobile automation, evaluated chatbots and voicebots, and documented engineering workflows.'},
 {company:'Meridian Fintech',url:'https://meridian.example/',about:'Multinational financial technology firm. Its straight-through-processing platforms run middle- and back-office work for banks. They cover rules-based transaction matching, invoice reconciliation and compliance, handling currency conversion, tax and discount calculation across multiple countries in one place.',role:'Jr. Software Engineer, QA Automation',dates:'Nov 2022 to Mar 2025',summary:'Led a Playwright TypeScript migration that reduced regression time by 50%. Reached 90% automation coverage for critical features and moved QA infrastructure to AWS EC2.'},
];
/**
 * Career dates, and why a duration is computed rather than written.
 *
 * "About four years of professional engineering since November 2022" was
 * accurate the day it was authored and quietly wrong a year later. A tenure is
 * a fact with an expiry date, and the chatbot states it more often than any
 * other surface on this site, so it is derived from the start dates instead of
 * being retyped.
 *
 * The derived value is frozen into backend/knowledge.json at prebuild, so it
 * refreshes on every deploy rather than on every request. For a duration
 * measured in months that is close enough, and it is what guarantees the
 * TypeScript and Python implementations quote the same number within a build.
 */
export const CAREER_START = '2022-11-01';
export const NORTHWIND_START = '2025-03-01';
export const PYTHON_START = '2024-01-01';
/**
 * Whole years and months between two dates, "3 years 10 months".
 *
 * UTC throughout: the two implementations that read this run in different
 * timezones, and a month boundary is not worth a disagreement.
 */
export function tenure(fromIso: string, toIso?: string): string {
 const from=new Date(`${fromIso}T00:00:00Z`),to=toIso?new Date(`${toIso}T00:00:00Z`):new Date();
 let months=(to.getUTCFullYear()-from.getUTCFullYear())*12+(to.getUTCMonth()-from.getUTCMonth());
 if(to.getUTCDate()<from.getUTCDate())months--;
 if(months<1)return 'under a month';
 const years=Math.floor(months/12),rest=months%12;
 return [years?`${years} year${years===1?'':'s'}`:'',rest?`${rest} month${rest===1?'':'s'}`:''].filter(Boolean).join(' ');
}
/**
 * Internal awards, newest first.
 *
 * `citation` is what it was given for, in Alex's words, the part a reader
 * cannot infer from the title. "Employee of the Month" twice says he was
 * recognised; the citation says what for, and that is the whole value of
 * listing an internal award at all. An entry without one is a line of
 * decoration, which is why the field is required rather than optional.
 *
 * "Employee of the Month" is the certificate title and the one used here.
 * Alex's LinkedIn honours list the same two awards as "Star of the Month", 
 * confirmed to be the same award, not a second one. That wording is kept in
 * `aliases` rather than on the card: a recruiter who saw the LinkedIn title
 * can still find it through the chatbot, and the page states one name.
 *
 * Not every award here is from an employer (the 2021 entry is academic) so
 * nothing on the section may assume a single issuer. Each card carries its
 * own, and the chatbot answer names it per award rather than once up front.
 *
 * Every date and citation below is transcribed from the award certificates,
 * with the November 2025 citation taken from the LinkedIn entry, which is
 * more specific than the certificate's template wording. `AWARD_TBC` remains
 * as the sentinel for any award added later: `publishedAwards` filters it out
 * and `tests/awards.test.ts` guards it, so an unconfirmed entry can sit in
 * this file without reaching the page.
 *
 * The certificate images are deliberately NOT published. They carry the
 * founder's handwritten signature, and a signature is not ours to put on a
 * public page. The LinkedIn honours link is the verification route instead.
 */
export const AWARD_TBC = 'NEEDS_CONFIRMATION';
export const awards = [
 {id:'engineering-excellence',name:'Engineering Excellence Award',issuer:'Northwind Systems',category:'Annual award',issued:'June 2026',citation:'Sample citation. Replace with the wording from your own certificate, or delete the entry.',aliases:['engineering excellence award','engineering excellence','annual award']},
 {id:'employee-of-the-month-jun',name:'Employee of the Month',issuer:'Northwind Systems',category:'Monthly recognition',issued:'June 2026',citation:'Sample citation for a monthly award.',aliases:['employee of the month june','june 2026 employee of the month']},
 {id:'best-project-2021',name:'Best Project of the Year',issuer:'Riverside College of Engineering',category:'Academic award',issued:'June 2021',citation:'Sample citation for an academic award, kept so the section shows more than one issuer.',aliases:['best project of the year','best project award','college award','academic award','gis project','gis','final year project']},
];
/** The LinkedIn honours section, the public record behind all three. */
export const awardSource = `${profile.linkedin}details/honors/`;/**
 * The awards safe to publish: both facts confirmed.
 *
 * One filter, used by the section, the nav and the chatbot alike, so an
 * unconfirmed award cannot appear in one surface and not another. The
 * chatbot matters most here, it answers from `content/faq.ts` and is the
 * surface most likely to be asked "what awards has he won" directly.
 */
export const publishedAwards = awards.filter(
 award=>award.issued!==AWARD_TBC&&award.citation!==AWARD_TBC,
);
export const skills = [
 {name:'Interface',items:['HTML / CSS','JavaScript','TypeScript','React']},
 {name:'Backend',items:['Python','FastAPI','Java','SQL / PostgreSQL','Frappe / ERPNext']},
 {name:'Intelligence',items:['MCP / RAG','AI agents','LangSmith','RAGAs / DeepEval']},
 {name:'Delivery',items:['Git / GitHub','Docker','AWS EC2','CI/CD','Uptime Kuma']},
];
export const certificationSource = `${profile.linkedin}details/certifications/`;
export const certifications = [
 {id:'agentic-ai',name:'Sample: Agentic AI and Multi Agent Workflows',issuer:'Sample Academy',issued:'October 2025',category:'Applied AI',href:'https://example.com',notesHref:'https://example.com',aliases:['agentic ai course','agentic ai certification','multi agent automation']},
 {id:'ml-testing',name:'Sample: Machine Learning Model Testing',issuer:'Sample Academy',issued:'October 2025',category:'Applied AI',href:'https://example.com',notesHref:'https://example.com',aliases:['machine learning models testing','ml testing certificate']},
 {id:'rag-evals',name:'Sample: RAG and LLM Evaluation',issuer:'Sample Academy',issued:'September 2025',category:'Applied AI',href:'https://example.com',notesHref:'https://example.com',aliases:['rag llm evals','rag certification','rag course']},
 {id:'genai-tools',name:'Sample: GenAI Tools and AI Agents',issuer:'Sample Academy',issued:'August 2025',category:'Applied AI',href:'https://example.com',aliases:['genai tools course','genai certification']},
 {id:'generative-ai',featured:true,name:'Sample: Introduction to Generative AI',issuer:'Sample Cloud',issued:'February 2025',category:'Applied AI',href:'https://example.com',aliases:['introduction to generative ai','generative ai course']},
 {id:'k6',name:'Sample: Performance Testing with JavaScript',issuer:'Sample Academy',issued:'April 2026',category:'Software engineering',href:'https://example.com',notesHref:'https://example.com',aliases:['k6','performance testing masterclass']},
 {id:'playwright',name:'Sample: Playwright Automation from Scratch',issuer:'Sample Academy',issued:'June 2025',category:'Software engineering',href:'https://example.com',notesHref:'https://example.com',aliases:['playwright certification','playwright course']},
 {id:'istqb',featured:true,name:'Sample: Foundation Level Tester',issuer:'Sample Board',issued:'February 2025',category:'Software engineering',href:certificationSource,aliases:['istqb','foundation level']},
 {id:'business-english',name:'Sample: English for Business',issuer:'Northgate University',issued:null,category:'Communication',href:'https://example.com',aliases:['business english','english certification']},
];

export const learning = [
 {id:'mcp-guide',title:'Building a searchable memory with MCP',label:'PROJECT GUIDE',href:`${profile.github}/mcp-rag-server#readme`,description:'Ingestion, embeddings, retrieval, and the tools that connect them.'},
 {id:'voice-notes',title:'Inside a realtime voice agent',label:'IMPLEMENTATION NOTES',href:`${profile.github}/realtime-voice-agent#readme`,description:'Explore the architecture and configuration in the project README.'},
 {id:'eval-guide',title:'Testing what a prompt changes',label:'EVALUATION GUIDE',href:`${profile.github}/llm-prompt-evaluation-harness#readme`,description:'Metrics scored by an LLM, repeatable runs, cost, and latency tracking.'},
];
// Ordered by depth of contribution, not alphabetically: the three that carry a
// description, a stack or sub-products come first so the section opens with
// substance rather than with a one-line testing credit.
export const work: WorkItem[] = [
 {id:'lumen',name:'Lumen',category:'Vedic astrology fintech',group:'built',role:'Frontend & mobile UI, first-party analytics pipeline, admin console, GA4 & Microsoft Clarity, social campaign, product thinking',href:'https://lumen.example',aliases:['lumen','astro fin'],description:'Rebuilt the customer-facing product in React and TypeScript: landing page, mobile-first rework, a sectioned admin console, and an analytics dashboard with click heatmaps, funnel reporting and session timelines. Built the first-party analytics pipeline end to end, from browser instrumentation through a Supabase edge function to the reporting views behind the dashboard, alongside authorisation hardening, freshness monitoring for the data pipeline, a page-weight pass on the landing page, and Vitest, Playwright and Deno test suites. Integrated Google Analytics and Microsoft Clarity, ran the social media campaign, and contributed to product thinking.',stack:['React','TypeScript','Vite','Supabase','PostgreSQL','GA4 / GTM','Clarity']},
 {id:'northwind-erp-link',name:'Northwind ERP',category:'Enterprise workflow automation',group:'built',role:'Seven live internal workflows on Frappe and ERPNext: approvals, OKRs, feedback, subscriptions and credential management',href:'#northwind-erp',stack:['Frappe','ERPNext','Python','SQL']},
 {id:'halcyon-halcyon',name:'Halcyon',category:'Internal sales platform for paints',group:'quality',role:'Performance, security review, data validation & chatbot quality',href:null,aliases:['halcyon halcyon','halcyon','halcyon'],description:'Worked on performance improvements and security vulnerability reviews across several internal products built for the sales teams. Validated and refined data, and improved chatbot responses.',stack:['Performance','Security','Chatbot evaluation','Data validation'],itemsLabel:'INTERNAL SALES-TEAM PRODUCTS',items:[
  {id:'halcyon-halcyon-chatbot',name:'Halcyon Assistant',aliases:['halcyon chatbot','halcyon halcyon chatbot','halcyon chatbot'],description:'An assistant used by the sales teams. Alex reviewed and refined its responses, validated the data behind them, and raised performance and security findings.'},
  {id:'halcyon-dealer-apis',name:'Dealer APIs',aliases:['dealer api','dealer apis','halcyon dealer api','halcyon dealer apis'],description:'Services behind the dealer-facing sales workflows. Alex covered them with performance and security review and validated the data they returned.'},
  {id:'halcyon-tsm-ai',name:'Field AI',aliases:['field ai','halcyon tsm','tsm'],description:'An internal AI tool supporting the field sales team. Alex evaluated its responses and data quality and reported performance and security issues.'},
 ]},
 {id:'tixly',name:'Tixly',category:'Ticket resale marketplace',group:'quality',role:'User journey improvements & product flow testing',href:'https://tixly.example',aliases:['tixly','ticket resale','ticket marketplace'],description:'Improved user journeys and tested product flows on Tixly to help make the experience easier to navigate and use.',stack:['User journeys','Product testing']},
 {id:'taxwise',name:'Taxwise',category:'AI tax filing',group:'quality',role:'AI, API, performance & UI testing',href:'https://taxwise.example'},
 {id:'cadencelabs',name:'Cadence Labs',category:'Meeting intelligence',group:'quality',role:'Voice, transcription & summarization testing',href:null},
 {id:'vega',name:'Vega',category:'Enterprise AI assistant',group:'quality',role:'AI agent & chatbot evaluation',href:null},
 {id:'helixai',name:'Helix AI',category:'Pharma AI',group:'quality',role:'AI application testing',href:'https://helixai.example'},
];
/**
 * Who the recommender was to Alex, in LinkedIn’s own terms. Shown on the card
 * so a reader can weigh it: "reported to Alex" and "worked on the same team"
 * are not the same evidence, and a section that flattens them invites the
 * reader to assume the weaker one.
 */
export type Relation = 'manager' | 'senior' | 'report' | 'peer' | 'cross-team' | 'teacher' | 'classmate';
export const RELATION_LABEL: Record<Relation, string> = {
 manager: 'Managed Alex directly', senior: 'Senior to Alex', report: 'Reported to Alex',
 peer: 'Worked on the same team', 'cross-team': 'Worked with Alex across teams',
 teacher: 'Taught Alex', classmate: 'Studied with Alex',
};
export type Recommendation = { id: string; name: string; role: string; relation: Relation; date: string; url: string | null; quote: string; full: string };
/**
 * Array order is the reading order, and it is curated rather than sorted.
 *
 * Sorting by relation was the first attempt and it is wrong here: it puts the
 * one manager recommendation first, and that one is four sentences of general
 * praise, while the strongest opener is a current colleague describing exactly
 * the QA-to-development move the rest of the site claims. A recruiter reads the
 * first card and maybe the second, so the order is chosen, not derived.
 *
 * The ordering rule, when adding one: recent and role-aligned first, then
 * evidence of leading people, then the manager and the senior voices, then
 * everything else. Fifteen of these describe Alex as a QA professional, which
 * is true of the years they cover, so the ones that speak to development and
 * to AI work lead, or the section reads as a QA CV under a developer headline.
 */
export const recommendations: Recommendation[] = [
 {id:'priya-nair',name:'Priya Nair',role:'Data Scientist, Northwind Systems',relation:'peer',date:'March 31, 2026',url:null,quote:'Sample recommendation. Replace this array with your own, or delete the section.',full:'Sample recommendation text. This array ships as placeholder content so the section renders, the counts in content/faq.ts resolve, and tests/faq.test.ts has something to assert against. Replace each entry with a real one, or remove the section from Portfolio.tsx and drop the answers that derive from it. The `relation` field is what the card uses to tell a manager from a direct report, and RELATION_LABEL above maps each value to the label a reader sees.'},
 {id:'sam-okafor',name:'Sam Okafor',role:'Junior QA Engineer',relation:'report',date:'March 19, 2026',url:null,quote:'Sample recommendation from someone who reported to Alex. Replace before publishing.',full:'Sample recommendation text from a direct report. content/faq.ts counts entries with relation \'report\' to answer the leadership question, so keep at least one if you want that answer to stay truthful. Replace this prose with a real recommendation or delete the entry.'},
 {id:'dana-holt',name:'Dana Holt',role:'Engineering Manager',relation:'manager',date:'September 9, 2025',url:null,quote:'Sample recommendation from a manager. Replace before publishing.',full:'Sample recommendation text from a line manager. The section orders entries by the array order rather than sorting them, because the strongest opener is a choice rather than something derivable. See the comment above this array.'},
 {id:'jules-park',name:'Jules Park',role:'Lead Automation Engineer',relation:'peer',date:'January 17, 2026',url:null,quote:'Sample recommendation from a teammate. Replace before publishing.',full:'Sample recommendation text from a peer on the same team. Four entries are enough to exercise the carousel, the relation labels and the counts; add or remove freely.'},
 {id:'robin-vega',name:'Robin Vega',role:'Platform Engineer',relation:'cross-team',date:'August 14, 2025',url:null,quote:'Sample recommendation from another team. Replace before publishing.',full:'Sample recommendation text from someone who worked with Alex across teams. RELATION_LABEL renders this as "Worked with Alex across teams".'},
];
