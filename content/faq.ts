import { profile, projects, privateWork, erpProject, experience, skills, recommendations, RELATION_LABEL, certifications, work, publishedAwards, tenure, CAREER_START, NORTHWIND_START, PYTHON_START } from './portfolio';
import { dashboards } from './dashboards';
/** A project by id. Positional lookups broke the moment the array was reordered. */
const byId=(id:string)=>projects.find(project=>project.id===id)!;
/** Repo answers link to GitHub; a project without a repo links to its own route. */
/** Detail plus the measured outcome, when the project has one. */
const projectAnswer=(id:string)=>{const project=byId(id);return project.outcome?`${project.detail} ${project.outcome}`:project.detail;};
const projectHref=(id:string)=>{const project=byId(id);return project.repo?`${profile.github}/${project.repo}`:project.href;};
/**
 * Certifications newest first, by their own `issued` month.
 *
 * The array in portfolio.ts is grouped for reading, not sorted by date, the
 * k6 credential is April 2026 and sits eighth. Any answer that says "most
 * recent" has to derive the order or it states something false the moment a
 * credential is inserted anywhere but the top.
 */
const CERT_MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const certMonths=(issued:string|null)=>{if(!issued)return 0;const parts=issued.toLowerCase().split(' ');return Number(parts[1])*12+CERT_MONTHS.indexOf(parts[0]);};
const newestCertifications=[...certifications].sort((a,b)=>certMonths(b.issued)-certMonths(a.issued));
const reportCount=recommendations.filter(person=>person.relation==='report').length;
export const answers = [
 // Awards derive from `publishedAwards`, so an unconfirmed one is absent from
 // the chatbot as well as from the page, the chatbot is the surface most
 // likely to be asked this outright, and it must not be the one that answers
 // from a placeholder. Specific awards come before the aggregate below,
 // because the first pattern match wins and the aggregate claims 'award'.
 ...publishedAwards.map(award=>({id:`award-${award.id}`,patterns:award.aliases,answer:`${award.name}, ${award.issuer}, ${award.issued}. ${award.citation} Listed in Alex's LinkedIn honours section.`,href:'/#awards'})),
 ...certifications.map(certificate=>({id:`certification-${certificate.id}`,patterns:certificate.aliases,answer:`Alex completed ${certificate.name}, issued by ${certificate.issuer}.${certificate.issued?` Issued ${certificate.issued}.`:''} This credential is listed on his LinkedIn profile. See the certifications section for the credential link.`,href:'/#certifications'})),
 {id:'availability',patterns:['availability','notice period','open to work','open to relocation','relocate','relocation','joining','buyout','job change','available for hire','currently available','join immediately','immediate joiner','when can he join','hybrid','work from home','wfh','onsite','in office','open to remote','contract','contract role','contract to hire','full time','full-time','permanent','freelance','part time','part-time','engagement type'],answer:`${profile.availability}. Locations: ${profile.openTo}. Reach him at ${profile.email}.`,href:'/#contact'},
 {id:'visa',patterns:['visa','sponsorship','work permit','work authorisation','work authorization','right to work','h1b','h-1b','passport','abroad','overseas','international relocation','outside the us','uk','united kingdom','europe','european','usa','united states','america','australia','work abroad','move abroad','relocate abroad'],answer:`${profile.relocation}. For roles in the US no sponsorship is required; for the UK, EU or Australia he would need visa sponsorship. Within the US he is open to ${profile.openTo}.`,href:'/#contact'},
 // ── Answers added because the greedy patterns above used to swallow them ──
 // Each of these questions previously reached a confident, wrong answer: a
 // phone number for "has he built any mobile apps", his home suburb for "is
 // the chatbot live", a job history for "what is his React experience". The
 // fix is two-sided, the greedy pattern loses the word, and the question
 // gets an entry of its own. They sit here, early, because first match wins.
 {id:'colleague-contact',patterns:['manager\'s phone','manager\'s number','manager\'s contact','manager\'s email','manager phone','manager number','manager contact','colleague contact','colleague\'s contact','teammate contact','recommender contact'],answer:`Contact details for Alex\u2019s colleagues, managers and recommenders are not published here. Their LinkedIn recommendations are, each one attributed and dated. For Alex himself: ${profile.email} or ${profile.phone}.`,href:'/#recommendations'},
 {id:'why-hire',patterns:['why hire','why should we hire','why hire alex','why choose alex','why him','what makes him','makes him stand out','stand out','strengths','strength','sell him','elevator pitch','recommend hiring','should we hire','what sets him apart','best thing about him','problem solving','problem-solving','solve complex'],answer:`Judge it from measured work rather than adjectives. At Meridian he led a Playwright TypeScript migration that cut regression time by 50% and reached 90% automation coverage on critical features. At Northwind he has ${erpProject.workflows.length} live internal workflows on Frappe and ERPNext and ${dashboards.length} operational dashboards. Lumen runs publicly at lumen.example with the frontend, mobile UI and first-party analytics pipeline he built. ${recommendations.length} LinkedIn recommendations, ${reportCount} of them from people who reported to him, and ${publishedAwards.length} awards. He came into development through quality engineering, which is why this portfolio ships with its own unit, chatbot and analytics test suites.`,href:'/#work'},
 // ── Asked by recruiters, answered with numbers ────────────────────────────
 // These sit high on purpose. A screening call is a sequence of specific
 // questions with specific answers, and before this block the chatbot met
 // half of them with "not documented" while the numbers were sitting in
 // content/portfolio.ts one answer away.
 {id:'hardest-problem',patterns:['hardest','hardest problem','toughest','most difficult','difficult problem','complex problem','tricky problem','trade off','trade offs','trade-off','trade-offs','tradeoff','tradeoffs','engineering judgement','engineering judgment','design decision','design decisions','hard call'],answer:'The recurring one is making something measurable without taking more than it needs. The analytics behind this site is first-party on Cloudflare Workers and D1 and stores no visitor IP at all, addresses are salted and hashed and thrown away, and the homepage stays statically rendered, so measurement never costs the visitor a slower page. The chatbot you are using now is the same call made again: a language model may only choose which approved answer fits, and the text always comes from that approved set, so it cannot invent a claim about Alex. On the realtime voice agent the trade-off was latency against interruption handling, and it holds under 2s turn latency with working barge-in across Hindi, English, Gujarati and Marathi. The measurement side is open at /analytics.',href:'/analytics'},
 {id:'stakeholders',patterns:['client facing','client-facing','face the client','stakeholder','stakeholders','business users','work with clients','client communication','requirement gathering','requirements gathering','cross functional','cross-functional'],answer:`Yes, and it is the shape of the job rather than an occasional extra: Northwind is a consulting firm, so the delivery is client delivery. Publicly named engagements include Lumen, Halcyon, Tixly and Taxwise. The internal systems he built are themselves stakeholder machinery, BRD submission with review, approval and rework, RCA documents with version history, and project documents routed through manager and client approval. ${recommendations.length} LinkedIn recommendations back it, ${reportCount} of them from people who reported to him.`,href:'/#recommendations'},
 {id:'next-role',patterns:['next role','looking for in his next','what is he looking for','what does he want','career goal','career goals','five years','5 years','long term','long-term','ambition','aspiration','where does he see himself','motivation'],answer:`What is on record: ${profile.availability}, open to ${profile.openTo}, and ${profile.relocation}. On direction, his own summary is the closest thing documented: "${profile.summary}" The specifics of what he wants next, team, domain and scope, are worth putting to him directly at ${profile.email} or ${profile.phone}.`,href:'/#contact'},
 {id:'behavioural',patterns:['time he failed','a failure','his failure','biggest mistake','a mistake','went wrong','disagreement','disagree','conflict','difficult colleague','difficult manager','handle pressure','under pressure','criticism','negative feedback','weakness','weaknesses'],answer:`Not documented here, and a question better put to him directly at ${profile.email} or ${profile.phone}. What is on record is how the people who worked with him describe it: ${recommendations.length} LinkedIn recommendations, ${reportCount} from people who reported to him and one from a manager. A bootcamp teammate singles out his "ability to disassociate himself from work done by him and analyse it from a third-person perspective", which is the habit that makes a post-mortem worth holding.`,href:'/#recommendations'},
 {id:'leadership',patterns:['led a team','lead a team','leading a team','leadership','team lead','managed a team','people management','has he led','does he lead','line manager','has he managed','managed people','how many people','people has he managed','direct reports'],answer:`He has led work and people without having held a manager title. ${reportCount} of his ${recommendations.length} LinkedIn recommendations are from people who reported to him. One calls him \u201ca great leader and mentor\u201d, another describes \u201cstrong ownership and leadership in everything he does\u201d. A peer notes he was managing QA for the AI projects single-handedly. He led the Playwright migration at Meridian and brought the QA team onto the new framework, and at Northwind he has onboarded new joiners and mentored a junior developer and interns.`,href:'/#recommendations'},
 {id:'mobile',patterns:['mobile app','mobile apps','mobile ui','mobile-first','mobile first','android','ios','react native','flutter','responsive','app store','play store','native app','mobile development'],answer:'Mobile-first web rather than a native app. On Lumen he rebuilt the customer-facing product in React and TypeScript, including a mobile-first rework of the interface, and at Northwind he has developed web and mobile automation. No native iOS or Android app is documented, and there is no React Native or Flutter work in the portfolio.',href:'/#products'},
 {id:'spoken-languages',patterns:['languages does he speak','language does he speak','spoken language','spoken languages','does he speak','speak english','fluent','communication skills','soft skills','presentation skills'],answer:`This portfolio documents programming languages rather than spoken ones. For spoken languages, ask Alex directly at ${profile.email}. What is on record: a Coursera credential in English for Running a Successful Business from the University of California, Irvine, and recommendations that single out his communication. One colleague cites \u201cexcellent communication and interpersonal skills\u201d, another that his \u201creporting and presentations are always on point\u201d.`,href:'/#certifications'},
 {id:'clients',patterns:['clients','client list','which clients','who are his clients','engagements','customer names'],answer:`Publicly named engagements: ${work.map(item=>item.name).join(', ')}, alongside Northwind\u2019s own internal ERP. Client names behind the operational dashboards are withheld throughout. Those carry positional labels only, and the same letter always means the same client.`,href:'/#products'},
 {id:'chatbot',patterns:['this chatbot','the chatbot','your chatbot','how do you work','how does this work','are you ai','are you an ai','are you chatgpt','what model','which model','llm powering','who built you','are you human','are you a bot','are you a script','how are you built'],answer:'This guide answers from Alex\u2019s published portfolio content, and it is built so that the model never writes the prose. An approved answer set is computed first; a language model may only choose which answer id fits, and the text you get back is always looked up from that set. It degrades through three tiers so it keeps answering with the server down: the browser answers on its own if the Worker is unreachable, the Cloudflare Worker asks an NVIDIA NIM model which documented answer fits when no pattern matches, and an optional FastAPI service can do the same with Gemini. Both it and the analytics behind this site are Alex\u2019s work.',href:'/analytics'},
 {id:'analytics',patterns:['portfolio analytics','analytics system','analytics behind this site','click heatmap','heatmap','heatmaps','funnel','funnels','admin dashboard','cloudflare','cloudflare workers','vinext','next.js','nextjs','how is this site built','how was this site built','how is this portfolio built','this website','static rendering','tech stack of this site'],answer:projectAnswer('analytics'),href:'/analytics'},
 // One answer per dashboard, before the aggregate below, for the same reason
 // the awards and certifications spreads come before theirs: the first pattern
 // match wins, and the aggregate claims the bare word 'dashboard'. Without
 // these, "tell me about the payroll action plan" was not documented at all.
 ...dashboards.map(board=>({id:`dashboard-${board.id}`,patterns:[...new Set([board.short,board.name].map(label=>label.toLowerCase().replace(/[()]/g,'').replace(/\s+/g,' ').trim()))],answer:`${board.name}. ${board.purpose} What it shows: ${board.shows} Built with ${board.stack.join(', ')}. Audience: ${board.client??'internal'}; scale: ${board.metric}; ${board.status}. It is rebuilt on invented data. The layout and calculations are the original's, the people, clients and numbers are not.`,href:`/dashboards/${board.id}`})),
 {id:'dashboards',patterns:['dashboard','dashboards','operational dashboards','payroll','apps script','google apps script','sprint','sprint ceremonies','ceremonies','agile','scrum','kanban','delivery process','delivery lifecycle','estimate','estimates','estimation','story points','velocity','burndown','defect board','defect intelligence','scorecard','go no go','release readiness'],answer:`${dashboards.length} operational dashboards built at Northwind, so that delivery status, quality, effort and objectives stopped living in spreadsheets and chat threads: ${dashboards.map(board=>board.short).join(', ')}. Nine are Google Apps Script web apps over Google Sheets behind Workspace sign-in; the OKR dashboard is a page inside the Frappe and ERPNext ERP. Between them they cover pipeline counts by stage, a month of deliverables beside the delivery lifecycle and sprint ceremonies the plan assumes, estimate against actual on every task, weighted quality scores, defect intelligence that states a release position, a go / conditional-go / no-go verdict with the rule that produced it, effort logged against approved and invoiced, capability ratings, and organisation-wide OKRs. Each one is rebuilt at /dashboards on invented data.`,href:'/dashboards'},
 {id:'data-privacy',patterns:['data privacy','user data','privacy','pii','gdpr','data protection','personal data','data retention','how is data stored','anonymise','anonymize','cookies'],answer:'No visitor IP is ever stored by this site\u2019s analytics. Visitors are counted through a rotating salted hash instead. What is collected and for how long is stated on the privacy page, which carries a working opt-out. The operational dashboards are rebuilt on invented data: every person, client, project and figure is changed, and client names are withheld throughout, including for the engagements named elsewhere on this site. On Lumen he also did authorisation hardening and freshness monitoring for the data pipeline.',href:'/privacy'},
 {id:'auth',patterns:['authentication','authorisation','authorization','oauth','jwt','sso','single sign-on','session management','login','rbac','permissions','role-based','access control'],answer:'On this site: an admin dashboard behind Google sign-in, with Google\u2019s signature verified against their JWKS through WebCrypto and the audience claim checked against our own client id, plus HMAC-signed sessions whose deadline is enforced server-side rather than left to a cookie. On Lumen he did authorisation hardening. In the Northwind ERP, role-based permissions and approver workflows across seven live systems, including a credential store where reveal and copy activity is logged and changes require approval.',href:'/analytics'},
 {id:'not-in-stack',patterns:['graphql','vue','angular','svelte','golang','go lang','rust','php','ruby on rails','ruby','kafka','rabbitmq','redis','grpc','redux','state management','prisma','sqlalchemy','mongodb','nosql','terraform','jenkins','spring boot','dotnet','asp.net','jquery','webpack','orm'],answer:`Not in his documented stack. What is: ${skills.map(group=>`${group.name.toLowerCase()}: ${group.items.join(', ')}`).join('; ')}. This portfolio states what he has actually used rather than what he could pick up, so something absent here is genuinely absent rather than modestly omitted.`,href:'/#skills'},
 {id:'ai-stack',patterns:['langchain','llamaindex','agent framework','agent frameworks','llm provider','llm providers','which llm','which models','openai','anthropic','gemini','ollama','crewai','autogen','model providers'],answer:`Providers across his work: Gemini, OpenAI and Anthropic are all supported by Notesgen; the MCP RAG server carries an Anthropic integration and generates embeddings locally with Sentence Transformers; the realtime voice agent runs on the OpenAI Realtime API; and he runs local models through Ollama. Tooling rather than frameworks is the pattern: MCP for retrieval, and LangSmith, RAGAs and DeepEval for evaluation. ${skills[2].name} on his skills list: ${skills[2].items.join(', ')}.`,href:'/#skills'},
 {id:'learning-now',patterns:['currently learning','what is he learning','upskilling','learning now','recent learning','staying current','keeping up to date','what is he studying','latest certification','most recent certification'],answer:`His most recent credentials, newest first: ${newestCertifications.slice(0,3).map(certificate=>`${certificate.name} (${certificate.issuer}${certificate.issued?`, ${certificate.issued}`:''})`).join('; ')}. He also keeps study notes in Google Docs for agent workflows, machine learning testing, RAG evaluation, GenAI tools, k6 and Playwright, and publishes project guides on the MCP RAG server, the realtime voice agent and prompt evaluation.`,href:'/#certifications'},
 {id:'employer-meridian',patterns:['what does meridian do','about meridian','meridian technologies','who is meridian','what is meridian','previous employer','past employer','stp','straight through processing','straight-through processing'],answer:`${experience[1].company} (${experience[1].dates}): ${experience[1].about} Alex was a ${experience[1].role} there. ${experience[1].summary}`,href:experience[1].url},
 {id:'employer',patterns:['what does northwind do','about northwind','northwind technologies','northwind company','who is northwind','what is northwind','product or service company','service based','product based','service company','consulting','current employer','which company'],answer:`${experience[0].company}: ${experience[0].about} Alex has been a ${experience[0].role} there since March 2025, building internal workflow systems on Frappe and ERPNext. Before Northwind he was at ${experience[1].company} from November 2022 to March 2025.`,href:experience[0].url},
 // Before `experience`, which claims the bare word 'work', and before
 // `location`, which claims 'where': without this, "where does he work?" was
 // answered with the full two-employer history or with his home suburb.
 {id:'workplace',patterns:['where does he work','where does alex work','where does alex rivera work','where do you work','where is he working','where does he currently work','where is he employed','who does he work for','current workplace','workplace'],answer:`${profile.name} works at ${experience[0].company} currently, which is located in Austin. He is a ${experience[0].role} there, building Frappe and ERPNext workflows. Before Northwind he was at ${experience[1].company} from November 2022 to March 2025.`,href:experience[0].url},
 {id:'django',patterns:['django','flask'],answer:`Django is not in Alex\u2019s stack. His Python web work is FastAPI (the Notesgen backend and the voice agent\u2019s token service) and Frappe/ERPNext, where he has built seven live internal workflows at Northwind.`,href:'/#skills'},
 {id:'nodejs',patterns:['node.js','nodejs','node js','express','javascript backend'],answer:'Yes. The scheme automation reference is a React 19 and TypeScript frontend on an Express backend, wired to BigQuery, Google Cloud Storage and Cloud Run. His Playwright and k6 automation tooling is Node-based as well.',href:`${profile.github}/scheme-automation`},
 {id:'kubernetes',patterns:['kubernetes','k8s','container orchestration','helm','eks'],answer:'No. Alex uses Docker and AWS EC2 for environment deployments, having moved Meridian\u2019s QA infrastructure to EC2, plus Google Cloud Run in the scheme automation work and Cloudflare Workers for this site. Kubernetes is not something he has used.',href:'/#skills'},
 {id:'microservices',patterns:['microservice','microservices','service oriented','service-oriented','distributed system','distributed systems'],answer:'He has built systems composed of separate services rather than large distributed estates. The realtime voice agent splits a FastAPI token service from LiveKit and the OpenAI Realtime API; the scheme automation work runs an Express API against BigQuery, Google Cloud Storage and Cloud Run.',href:'/#work'},
 {id:'system-design',patterns:['system design','systems design','design a system','architecture experience','hld','lld','scalability','how does it scale','scale','scales','architecture','high availability'],answer:'Judge it from what he has designed. The analytics behind this site: a deliberately open ingest endpoint with a server-side allowlist, a rotating salted hash instead of stored visitor IPs, HMAC-signed admin sessions whose deadline is enforced server-side, and a dashboard behind Google sign-in with the audience claim verified. Its chatbot degrades through three tiers so it keeps answering with the server down.',href:'/analytics'},
 {id:'fine-tuning',patterns:['fine-tune','fine tune','fine-tuned','fine tuned','finetuning','fine-tuning','train a model','training a model','model training','lora'],answer:'No. His applied-AI work is retrieval, agents and evaluation rather than training. He builds RAG pipelines with ChromaDB and Sentence Transformers, runs local models through Ollama, and evaluates output with LangSmith, RAGAs and DeepEval.',href:'/#skills'},
 {id:'python-years',patterns:['years of python','how long python','python experience','experience in python'],get answer(){return `${tenure(PYTHON_START)} of substantial Python, since 2024: evaluation pipelines with LangSmith and RAGAs, FastAPI services, and Frappe/ERPNext business logic at Northwind. His earlier automation work at Meridian was mainly Playwright with TypeScript.`},href:'/#skills'},
 {id:'mentoring',patterns:['mentor','mentored','mentoring','onboard','onboarded','onboarding','juniors','junior developers','knowledge sharing','knowledge session','training session','coaching','documentation','document his work','documents his work','writes documentation','knowledge transfer','documented'],answer:'Yes. At Northwind he has onboarded new joiners onto the codebase and delivery process, mentored a junior developer and interns, and run knowledge sessions for the team. During the Playwright migration at Meridian he brought the QA team onto the new framework.',href:'/#recommendations'},
 {id:'on-call',patterns:['on-call','on call','oncall','production support','pager','incident response','24/7','support rotation','production incident','incident','incidents','outage','postmortem','post-mortem','firefighting'],answer:'He has not carried a formal on-call rota. He does support live systems (seven internal workflows in production at Northwind and Lumen running publicly) and is open to an on-call rotation.',href:'/#contact'},
 {id:'code-review',patterns:['code review','code reviews','review code','pull request','pull requests','pr review','merge request','code quality','clean code','coding standards','code standards','best practices'],answer:'His review instinct comes from testing rather than from authoring PR feedback: two and a half years in QA automation reading code for what breaks, what is not covered, and what happens on the unhappy path. Two of the seven Northwind workflows were built collaboratively.',href:'/#about'},
 {id:'discipline',patterns:['backend or frontend','frontend or backend','front end or back end','backend developer or','is he full stack','frontend or full stack','which side','frontend','front end','frontend framework','frontend frameworks','ui framework','backend framework'],answer:`Both, and the split is documented. Interface: ${skills[0].items.join(', ')}. Backend: ${skills[1].items.join(', ')}. At Northwind he builds both halves of internal workflow systems on Frappe and ERPNext; on Lumen he built the frontend and mobile UI plus an admin analytics dashboard.`,href:'/#skills'},
 // ── These two read the clock, so they must be getters ────────────────────
 // `answers` is a module-scope array, and on a Cloudflare Worker Date.now()
 // returns 0 for the whole of top-level evaluation, a deliberate side-channel
 // defence. A duration computed there came out as "under a month of
 // professional engineering since November 2022" in production while every
 // local test passed, because Node's clock works at module scope. A getter
 // moves the call into the request, where the Worker's clock is real, and
 // JSON.stringify still reads it at prebuild for knowledge.json. Turning
 // either back into a plain template string reintroduces the bug silently;
 // tests/faq.test.ts asserts they stay lazy.
 {id:'years-experience',patterns:['years of experience','total experience','how many years','years experience','overall experience','work experience','how much experience','how experienced','total years','years in the industry','experience does he have','fresher','fresher or experienced'],get answer(){return `${tenure(CAREER_START)} of professional engineering since November 2022: ${tenure(CAREER_START,NORTHWIND_START)} in QA automation at Meridian Fintech, then full stack development at Northwind Systems from March 2025. Before that, a PG Diploma in Advanced Computing at Brookfield Institute in 2022.`},href:'/#about'},
 // "Is he from a CS background?" is a credential check, and it used to be
 // answered by civil-to-software, which opens with two Civil Engineering
 // qualifications. Same facts, wrong end first: the postgraduate
 // qualification IS in computing, and a screening call is not the place to
 // bury that under the undergraduate degree. The last sentence names the
 // filter risk on purpose, because a recruiter finding it later is worse
 // than a recruiter told now.
 {id:'civil-to-software',patterns:['civil engineering','civil','why software','how did he get into software','non cs background','non-cs background','non it background','non-it background','switch from civil','switched from civil','civil to it','civil to software','bootcamp'],answer:'Alex holds a Diploma in Civil Engineering (2018) and a BE in Civil Engineering (2021). The turn came during his final-year internship and project: a 2 sq km industrial area surveyed in a single day and mapped in a GIS application in two more, work that would have taken weeks by hand. Watching that much manual effort disappear is what made him want to build the tools rather than only use them, and that project went on to win Best Project of the Year. He retrained on the Brookfield Institute PG Diploma in Advanced Computing, a full stack Java programme covering Core Java, Advanced Java, C, C++, SQL, SDLC, Docker, .NET, HTML, CSS and React, completed in 2022. That led to his first software role, Junior Software Engineer in Automation QA at Meridian Fintech. QA automation first, then full stack development.',href:'/#about'},
 {id:'qa-to-dev',patterns:['move from qa','moved from qa','qa to development','qa to dev','why did he move','why did he switch','career change','career transition','switched from testing','tester to developer'],answer:'Alex spent November 2022 to March 2025 in QA automation at Meridian Fintech, joined Northwind Systems in March 2025 as AI QA, and moved into full stack development there. He describes it as the point of the path rather than a detour: breaking software first is why he now builds it to be verified.',href:'/#about'},
 {id:'testing-approach',patterns:['approach to testing','testing approach','how does he test','test strategy','testing strategy','quality approach','qa approach','does he write tests','unit tests','test coverage','approach testing','test case','test cases','playwright','testing philosophy','quality engineering','how he tests','regression','regression time','shift left','manual testing','automation coverage','performance testing','performance engineering'],answer:`Alex's foundation is quality engineering: ISTQB Foundation Level, and a Playwright TypeScript migration at Meridian Fintech that cut regression time by 50% and reached 90% automation coverage on critical features. He has also worked in k6 performance testing and LLM evaluation with LangSmith, RAGAs and DeepEval. This portfolio itself ships with unit, chatbot and analytics test suites.`,href:'/#about'},
 {id:'llm-evaluation',patterns:['evaluate llm','evaluate the llm','llm output','evaluate a model','evaluate models','how does he evaluate','evals','rag evaluation','agent testing','hallucination','measure ai quality','measures ai quality','ai quality metrics','quality of ai','measure model quality','cost of running','running cost','running costs','llm cost','llm costs','inference cost','token cost','cost and latency','cost control','how much does it cost','cost aware','cost-aware'],answer:'Alex built Python evaluation pipelines with LangSmith and RAGAs at Northwind, and holds certifications in RAG/LLM evals, ML model testing and DeepEval/RAGAs with Ollama. His public LLM Prompt Evaluation Harness scores metrics with an LLM across repeatable runs and tracks cost and latency.',href:`${profile.github}/llm-prompt-evaluation-harness`},
 {id:'vector-store',patterns:['vector database','vector db','vector store','chromadb','chroma db','embedding store','pinecone','weaviate','faiss','qdrant'],answer:'ChromaDB, with Sentence Transformers generating embeddings locally, in his MCP RAG server. The server exposes ingestion, semantic search, question answering, listing and deletion as MCP tools.',href:`${profile.github}/mcp-rag-server`},
 {id:'databases',patterns:['what databases','which databases','database experience','postgres','postgresql','bigquery','sqlite','data storage'],answer:'SQL and PostgreSQL in application work, ChromaDB for vector storage in the MCP RAG server, BigQuery and Google Cloud Storage in the scheme automation reference, Supabase on Lumen, and Cloudflare D1 behind this site\u2019s analytics.',href:'/#skills'},
 {id:'delivery',patterns:['ci/cd','cicd','continuous integration','continuous delivery','deployment pipeline','devops','docker','containers','how does he deploy','aws','gcp','google cloud','azure','cloud provider','ec2','hosting'],answer:'Git and GitHub, Docker, AWS EC2 and CI/CD are in his delivery toolkit. At Meridian he moved QA infrastructure to AWS EC2. This portfolio deploys to Cloudflare Workers behind a preflight gate that blocks a deploy which would come up half-broken.',href:'/#skills'},
 {id:'production',patterns:['production experience','in production','live systems','real users','shipped to production','production ready','shipped','ship to production','anything in production','running in production','live system','production systems'],answer:`Yes. Seven live internal workflows at Northwind on Frappe and ERPNext, Lumen running publicly at lumen.example with the frontend, mobile UI and admin analytics dashboard he built, and this portfolio\u2019s own analytics system running on Cloudflare Workers. The four repositories in Selected Work are prototypes and references, and are labelled as such.`,href:'/#work'},
 {id:'code-samples',patterns:['see code','see his code','code sample','code samples','source code','show me code','his repositories','his repos','github repos','read his code'],answer:`Public repositories: ${projects.filter(project=>project.repo).map(project=>project.name).join(', ')}. Client and employer work is private. The dashboard from this site\u2019s analytics system is demonstrated publicly on synthetic data at /analytics.`,href:profile.github},
 {id:'security',patterns:['prompt injection','security review','security reviews','security testing','vulnerability','vulnerabilities','owasp','penetration','secure coding','application security'],answer:'At Halcyon Alex ran security vulnerability reviews and performance work across internal sales-team products, and validated the data behind them. This portfolio\u2019s own chatbot is built so the model never authors prose: it may only select an answer id from an approved set, and the served text is always looked up from that set.',href:'/#products'},
 {id:'schedule',patterns:['schedule a call','book a call','set up a call','arrange a call','schedule an interview','interview slot','set up a meeting','book a meeting','next steps','interview','technical interview','screening call','technical round','discussion'],answer:`The fastest route is direct: ${profile.email} or ${profile.phone}. ${profile.availability}. Alex replies to LinkedIn as well.`,href:'/#contact'},
 {id:'leaving',patterns:['why is he leaving','why leave','why did he leave','why he left','why did he quit','reason he left','reason for change','reason for leaving','looking for a change'],answer:`That one is worth asking Alex directly at ${profile.email} or ${profile.phone}. What is documented: ${profile.availability}, open to ${profile.openTo}.`,href:'/#contact'},
 // A yes/no question, answered yes. It sits above 'contact' because the
 // first pattern match wins, and the generic contact answer replied to
 // "is this number on WhatsApp?" with a list of ways to get in touch,
 // which is a topic being matched rather than a question being answered.
 // The number is read from profile.phone, so it is written in one place
 // and a hard-coded second copy cannot drift or survive a sanitisation
 // pass that only knows the spaced form.
 {id:'whatsapp',patterns:['whatsapp','whats app','text him','sms'],answer:`Yes. ${profile.phone} is on WhatsApp, so a message there reaches Alex directly. Email works too: ${profile.email}.`,href:'/#contact'},
 {id:'contact',patterns:['contact','contact details','contact him','how to contact','email','email address','get in touch','phone','phone number','mobile number','call him','contact number','reach him'],answer:`You can reach Alex at ${profile.email} or ${profile.phone}, or connect on LinkedIn. He is a ${experience[0].role} at ${experience[0].company}, with a focus on full stack applications and applied AI.`,href:profile.linkedin},
 // Sub-products BEFORE their parent, because the first pattern match wins:
 // 'halcyon' belongs to the parent, so a question about the Halcyon
 // Chatbot would otherwise be answered with the engagement summary instead.
 ...work.flatMap(product=>(product.items??[]).map(item=>({id:item.id,patterns:item.aliases,answer:`${item.name}, part of Alex's work on ${product.name}: ${item.description}`,href:'/#products'}))),
 // A product answers for itself only if it carries both aliases and prose.
 ...work.flatMap(product=>product.aliases&&product.description?[{id:`work-${product.id}`,patterns:product.aliases,answer:`${product.name}: ${product.description}${product.items?` Products covered: ${product.items.map(item=>item.name).join(', ')}.`:''}${product.stack?` Focus: ${product.stack.join(', ')}.`:''}`,href:'/#products'}]:[]),
 ...privateWork.filter(project=>project.id!=='private-work-overview').map(project=>({id:project.id,patterns:project.aliases,answer:`${project.name}: ${project.description}`,href:undefined})),
 {id:'private-work-overview',patterns:privateWork.find(project=>project.id==='private-work-overview')!.aliases,answer:privateWork.find(project=>project.id==='private-work-overview')!.description,href:undefined},
 ...erpProject.workflows.map(workflow=>({id:`erp-${workflow.id}`,patterns:workflow.aliases,answer:`${workflow.name} at Northwind: ${workflow.description} Alex's contribution: ${workflow.contribution.toLowerCase()}. Listed as live in the automation tracker. Built on Frappe and ERPNext.`,href:'/#northwind-erp'})),
 {id:'erp',patterns:['erpnext','frappe','northwind_erp','northwind erp','erp','enterprise workflow','erp automation','workflows','live workflows','how many workflows','internal workflows'],answer:`${erpProject.name}: ${erpProject.description} Systems: ${erpProject.workflows.map(w=>w.name).join(', ')}. Stack: ${erpProject.stack.join(', ')}.`,href:'/#northwind-erp'},
 {id:'mcp',patterns:['mcp','rag','retrieval','embedding','chroma'],answer:projectAnswer('mcp'),href:projectHref('mcp')},
 {id:'voice',patterns:['voice','livekit','speech','realtime','websocket','websockets','barge-in','interruption'],answer:projectAnswer('voice'),href:projectHref('voice')},
 {id:'course-notes',patterns:['course notes','course note','study notes','google docs notes'],answer:'Alex keeps study notes in Google Docs for agent workflows, machine learning testing, RAG evaluation, GenAI tools, k6, and Playwright. Each set is linked from the credential it belongs to in the certifications section.',href:'/#certifications'},
 {id:'notes',patterns:['notesgen','notes','learning','chrome','chrome extension','transcript','transcripts','course material'],answer:projectAnswer('notes'),href:projectHref('notes')},
 {id:'scheme',patterns:['scheme','spreadsheet','bigquery','pipeline'],answer:projectAnswer('pipeline'),href:projectHref('pipeline')},
  {id:'awards',patterns:['award','awards','recognition','recognised','recognized','employee of the month','star of the month','honour','honours','honor','honors','prize','won anything','any awards'],answer:`Alex has received ${publishedAwards.length} awards:\n\n${publishedAwards.map(a=>`${a.name}, ${a.issuer}, ${a.issued}. ${a.citation}`).join('\n\n')}\n\nAll are listed in his LinkedIn honours section.`,href:'/#awards'},
 {id:'certifications',patterns:['certification','certifications','certificate','certificates','certified','completed course','completed courses','course certificates','udemy course','udemy courses','coursera certificate','coursera certificates','coursera credential','coursera credentials','linkedin certifications','linkedin certificate','credential','credentials','verify his credentials'],answer:`Alex’s LinkedIn profile lists these ${certifications.length} courses and certifications:\n\n${certifications.map(c=>`${c.name}. ${c.issuer}${c.issued?`, ${c.issued}`:''}.${c.href?` ${c.href}`:''}`).join('\n\n')}\n\nEach link goes to the issuer's own credential page, so you can verify it without leaving this chat.`,href:'/#certifications'},
 {id:'evaluation',patterns:['token costs','token usage','evaluation','langsmith','ragas','deepeval','prompt'],answer:'Alex built Python evaluation pipelines with LangSmith and RAGAs at Northwind Systems. His public LLM Prompt Evaluation Harness explores metrics scored by an LLM, repeated runs, and cost and latency tracking.',href:`${profile.github}/llm-prompt-evaluation-harness`},
 // ── Where to find him, and the sites he has worked on ──────────────────
 //
 // Placement is the whole design here, because the first pattern match
 // wins and three of these words already belonged to something else:
 // 'github' is a pattern on `projects`, 'github repos' on `code-samples`,
 // and 'his profile' on `about`. So this block sits AFTER code-samples,
 // which keeps "show me his github repos" on the code answer, and BEFORE
 // projects, which is what lets "his github" mean the account rather than
 // the work. Bare 'github' is deliberately NOT a pattern here and still
 // reaches `projects`, where someone typing one word most likely meant it.
 //
 // 'linkedin' is bare-word poison for the same reason. `recommendations`
 // owns "linkedin recommendations" and `certifications` owns "linkedin
 // certifications" — and "Show his LinkedIn certifications" contains the
 // phrase 'his linkedin', which is how the existing suite caught this
 // block sitting too high. It now sits below both of them, and still
 // above `projects`, which is the window where every one of these words
 // means the account rather than the work.
 {id:'social-linkedin',patterns:['linkedin profile','linkedin link','linkedin url','linkedin account','linkedin id','linkedin page','his linkedin','your linkedin','on linkedin','connect on linkedin'],answer:`Alex\u2019s LinkedIn: ${profile.linkedin}\n\nIt carries his full history, ${recommendations.length} recommendations and every certification listed here.`,href:profile.linkedin},
 {id:'social-github',patterns:['github profile','github link','github url','github account','github id','github page','his github','your github'],answer:`Alex\u2019s GitHub: ${profile.github}\n\nThe public repositories are ${projects.filter(p=>p.repo).map(p=>p.name).join(', ')}.`,href:profile.github},
 {id:'social-x',patterns:['twitter','his x account','x account','x profile','x handle','twitter handle','twitter profile'],answer:`Alex is on X at ${profile.twitter}.`,href:profile.twitter},
 {id:'social-instagram',patterns:['instagram','insta profile','his insta','instagram handle'],answer:`Alex is on Instagram at ${profile.instagram}.`,href:profile.instagram},
 // Asked for all of them at once. This has to precede the generic answer
 // below, which asks which platform: a visitor who already said "all" has
 // answered that question and should not be asked it again.
 {id:'social-all',patterns:['all the links','all links','all of them','all his links','all social','all his social','all your social','all the profiles','all profiles','every link','every profile','all four'],answer:`All four, one by one:\n\nLinkedIn: ${profile.linkedin}\n\nGitHub: ${profile.github}\n\nX: ${profile.twitter}\n\nInstagram: ${profile.instagram}\n\nEmail reaches him directly at ${profile.email}.`,href:profile.linkedin},
 {id:'social',patterns:['social media','social link','social links','social profile','social profiles','his socials','socials','where can i follow','follow him','follow you','online presence','other profiles','handles'],answer:`Alex is on four: LinkedIn, GitHub, X and Instagram. Which one would you like? Say \u201call the links\u201d and I will list every one.\n\nLinkedIn is the fullest picture of his work: ${profile.linkedin}`,href:profile.linkedin},
 // The client-facing sites, which is a different question from "what has
 // he built": these are live products a visitor can open and look at. Only
 // the entries that actually carry a public URL are listed, because the
 // rest are private engagements and naming a site with no link to it
 // invites the reader to go looking for one.
 {id:'live-sites',patterns:['websites he has worked on','websites worked on','sites he has worked on','live sites','live websites','which websites','what websites','live products','live urls','site links','website links','production sites','taxwise','tixly site','helixai','helix ai','lumen site'],get answer(){const live=work.filter(w=>w.href?.startsWith('http'));return `Live sites Alex has worked on:\n\n${live.map(w=>`${w.name}. ${w.role}. ${w.href}`).join('\n\n')}\n\nThe rest of his client work is under NDA, so it is described on this site without links: ${work.filter(w=>!w.href?.startsWith('http')).map(w=>w.name).join(', ')}.`},href:'/#products'},
 {id:'projects',patterns:['project','projects','product','products','github','built','builds','portfolio','work samples'],answer:`Featured projects, each with its repository:\n\n${projects.map(p=>`${p.name}. ${p.description}${p.repo?` ${profile.github}/${p.repo}`:''}`).join('\n\n')}\n\nVoice Agent is a prototype and Scheme Automation is a sanitized reference. Enterprise work includes ${erpProject.name}: seven live Frappe/ERPNext workflows. Products contributed to include ${work.map(w=>w.name).join(', ')}.`,href:profile.github},
 {id:'experience',patterns:['designation','current role','current position','career','career history','background','job','jobs','companies','employment','employment history','northwind','meridian','qa','previous roles','past roles','his experience','work history'],answer:experience.map(e=>`${e.company} (${e.dates}): ${e.role}. ${e.summary}`).join('\n\n'),href:'/#about'},
 {id:'skills',patterns:['skill','skills','stack','python','react','java','fastapi','technology','technologies','language','languages','typescript','javascript','html','css'],answer:`Alex works with ${skills.map(g=>`${g.name.toLowerCase()}: ${g.items.join(', ')}`).join('; ')}.`,href:profile.github},
 {id:'education',patterns:['education','college','university','degree','brookfield','diploma','qualification','qualifications','highest qualification','graduation','btech','b.e','bachelor','bachelors','engineering degree','academics'],answer:'Alex completed a PG Diploma in Advanced Computing at Brookfield Institute, Denver in 2022, a BE in Civil Engineering at Riverside College of Engineering in 2021, and a Diploma in Civil Engineering in 2018.',href:'/resume-sample.pdf'},
 {id:'recommendations',patterns:['recommendation','recommendations','recommended','recommend','references','reference check','referral','colleague','team','ajay','pratik','vouch','managed him','who managed','his manager','reported to him','direct reports','supervised','testimonial','testimonials'],answer:`${recommendations.length} LinkedIn recommendations, including colleagues who reported to Alex and a manager. The first few:\n\n${recommendations.slice(0,5).map(r=>`${r.name} (${r.role}, ${RELATION_LABEL[r.relation]}): “${r.quote}”`).join('\n\n')}\n\nThe rest are in the recommendations section.`,href:profile.linkedin},
 {id:'location',patterns:['location','located','based','residence','resident','address','home town','hometown','commute','austin','texas','pin code','which city','where does he live','where does alex live','where is he based','where is he located','where does he stay','current city'],answer:`Alex lives in ${profile.residence}, and is based in the greater Austin area. He is open to ${profile.openTo}. ${profile.relocation}.`,href:profile.linkedin},
 {id:'resume',patterns:['resume','cv','curriculum vitae','resume pdf','download resume','download'],answer:`The résumé PDF covers Alex’s current role as ${experience[0].role} at ${experience[0].company}, his earlier automation engineering work at Meridian Fintech, selected projects, technical skills, education, and certifications.`,href:'/resume-sample.pdf'},
 {id:'about',patterns:['who is alex','who is he','who is alex rivera','full name','what is his name','introduce','introduction','summary','tell me about alex','tell me about him','his profile','bio','overview'],answer:`${profile.fullName} is a ${experience[0].role} at ${experience[0].company}, based in Austin. He previously worked in AI QA at Northwind. ${profile.summary} His professional background is in quality engineering and AI evaluation.`,href:profile.linkedin},
];
/**
 * The five guards, in the order answerQuestion() applies them.
 *
 * Both implementations of this logic read these strings, TypeScript compiles
 * them with `new RegExp`, and backend/main.py re-executes the very same text
 * through `re.search` out of knowledge.json. That rules out anything only one
 * engine has: no variable-length lookbehind, no named groups, no inline flags.
 * A negative lookahead is safe in both and is used once, deliberately, below.
 *
 * ── `sensitive` has two halves, and the second one is gated ────────────────
 * The first half is the always-refuse list: an API key, a bearer token, a
 * connection string and a deployment host are secrets in every sentence they
 * appear in, so no context can make them askable.
 *
 * The second half is the dual-use list, and it is why this guard grew a verb
 * clause. "Give me your test cases" asks for an artifact; "has he written test
 * cases?" asks about a skill, and the flat word list answered both with a
 * refusal that reads as though something is being hidden, from the single
 * most likely question a QA-hiring interviewer asks. So `source code`,
 * `test cases`, `client data`, `user data` and the rest now refuse only when
 * an acquisitive verb reaches them within the same clause. `write` is
 * deliberately absent from that verb list: "does he write test cases" is a
 * question about practice, not a request for files.
 *
 * ── `personal` exists because "not documented" was the wrong answer ────────
 * Caste, religion, marital status, disability and gender used to fall through
 * to the unknown tier, whose text invites the asker to contact Alex directly.
 * That turned the chatbot into something that nudges a recruiter to ask a
 * candidate his caste. These questions need a boundary, not a redirect, so
 * they get their own tier and their own answer with no contact details in it.
 * `unknown` keeps salary and CTC, where "ask him directly" is the right
 * answer.
 *
 * ── Prefixes wrapped in \b never matched their own inflections ────────────
 * `politic` and `diagnos` were written as stems inside `\b(...)\b`, which
 * requires a word boundary immediately after the stem, so neither could ever
 * match "politics" or "diagnose", the only forms anyone types. They carry an
 * explicit `\w*` now. `capital`, `president`, `solve`, `calculate`,
 * `write a`, `explain how` and `teach me` went the other way: each was broad
 * enough to deflect a legitimate question ("can he solve complex problems",
 * "explain how he built the analytics"), so each is narrowed to the phrasing
 * that is actually off-topic.
 */
/**
 * Asking for a thing, in either word order.
 *
 * `[^.?!]` keeps a match inside one clause, which is what makes the pair safe
 * to read in both directions: "what client data do you have" puts the verb
 * after the noun and must still refuse, while "his approach to source code
 * quality? can I see the repo" cannot join across the question mark.
 *
 * `write` is deliberately not an acquisitive verb. See guard.sensitive.
 */
const ACQUISITIVE='(?:give|send|show|share|provide|paste|dump|upload|download|export|leak|reveal|expose|hand over|access to|see|view|get|have)';
const DUAL_USE='(?:source (?:code|files?)|file contents?|test (?:data|cases?|plans?)|client (?:data|lists?)|customer (?:data|lists?)|user data|security vulnerabilit(?:y|ies)|exploits?|attack payloads?)';
const DEMANDED=`\\b${ACQUISITIVE}\\b[^.?!]{0,40}?\\b${DUAL_USE}\\b|\\b${DUAL_USE}\\b[^.?!]{0,40}?\\b${ACQUISITIVE}\\b`;
/**
 * "How many years has he coded in Go?"
 *
 * That question used to reach the `years-experience` answer through its
 * 'how many years' pattern and come back with "3 years 10 months of
 * professional engineering since November 2022", which names no technology
 * and reads, to the recruiter who asked, as three years ten months of Go.
 * It was the only answer in testing that was actively false rather than
 * merely unhelpful.
 *
 * The portfolio records total experience and a list of technologies; it does
 * not record years per technology, and no wording of that question has a
 * documented answer. So it is refused rather than approximated.
 *
 * The allow-list is what keeps the real question working: "how many years of
 * experience", "years in the industry" and "years of QA automation" all name
 * a span the portfolio does state, and must fall through to the answer.
 *
 * `python` is in the list because `python-years` is a real answer with a real
 * date behind it. That coupling is the fragile part of this guard, so it is
 * enforced rather than remembered: `tests/faq.test.ts` fails if an answer id
 * ending `-years` names a technology this list does not allow. Add the
 * answer, add the word, or the guard will refuse a question you documented.
 */
const DOCUMENTED_SPAN='(?:experience|engineering|professional|industry|the\\b|work|working|career|qa|quality|automation|testing|test|development|dev|software|full[ -]?stack|coding|programming|it\\b|total|python)';
const SCOPED_DURATION=`\\byears?\\b[^.?!]{0,25}?\\b(?:of|in|with|using)\\s+(?!${DOCUMENTED_SPAN})[a-z][\\w+#.]*`;
/**
 * Letters that are not ASCII but are drawn identically to it.
 *
 * NFKD does not touch these, and correctly so: Cyrillic `\u0430` and Latin `a` are
 * different letters, not two encodings of one. But `Ign\u043ere all previous
 * instructi\u043ens` walks straight past `guard.abuse` while reading, to a human,
 * exactly like the string the guard is written to catch.
 *
 * This used to be an accepted risk, on the grounds that nothing downstream
 * could be steered by prose because the model could only return an answer id.
 * That stopped being true when the NIM tier began composing prose: a question
 * no guard matched is `unmatched`, and `unmatched` is what makes it eligible
 * for the model. The folding closes the gap at the guard instead.
 *
 * Folding is deliberately one-way and lossy. A genuinely Russian question
 * comes out as mangled Latin, which matches nothing and reaches the
 * not-documented answer, which is where it was going anyway.
 */
export const HOMOGLYPHS:Record<string,string>={'\u0430':'a','\u0432':'b','\u0441':'c','\u0501':'d','\u0435':'e','\u04bb':'h','\u043d':'h','\u0456':'i','\u0458':'j','\u043a':'k','\u04cf':'l','\u043c':'m','\u043e':'o','\u0440':'p','\u0455':'s','\u0442':'t','\u0443':'y','\u0445':'x','\u03b1':'a','\u03b2':'b','\u03b5':'e','\u03b9':'i','\u03ba':'k','\u03bd':'v','\u03bf':'o','\u03c1':'p','\u03c4':'t','\u03c5':'u','\u03c7':'x'};
export const guard = {
 abuse:'\\b(?:ignore|disregard|override|jailbreak|system prompt|developer message|secret|api key|passwords?(?! management)|pretend|roleplay|role-play|act as|insult|hate|stupid|idiot|dumb|useless|worthless|nonsense|rubbish|shut up|garbage bot|trash bot|bakwas|chut(?:i)?ya|chutya|gandu|madarch(?:o|oo)d|b(?:e|he)henchod|bhenchod|bsdk|harami|kamina|nalayak|ghatiya|faltu|bewakoof|pagal|fuck|sex|your (?:instructions|rules|guidelines|prompt|training data)|instructions verbatim|repeat after me|forget (?:your|the|all|previous|everything)|you are (?:now )?dan|dan mode|(?:no|without|bypass|remove|ignore) (?:your |all |any )?restrictions?|unrestricted)\\b',
 sensitive:`\\b(?:api[ _-]?keys?|access[ _-]?keys?|secrets?|(?:auth|access|refresh|bearer|session|admin|github|api)[ _-]?tokens?|private[ _-]?keys?|ssh[ _-]?keys?|connection strings?|database (?:urls?|uris?|credentials?)|(?:login|admin|database|db|server) credentials?|env(?:ironment)? (?:vars?|variables?)|service accounts?|internal (?:urls?|endpoints?|hosts?)|production (?:urls?|endpoints?|hosts?)|private (?:repo(?:sitory)? )?(?:links?|urls?|access)|github clones?|clone commands?|(?:n8n )?workflow exports?|enterprise client [a-d]|(?:real|actual) names?|names? of the (?:people|employees|staff|users|clients))\\b|\\.env\\b|ip[ _-]?salt\\b|${DEMANDED}`,

 personal:'\\b(?:caste|reserved category|sc/st|obc|religion|religious|politic\\w*|marital status|married|unmarried|spouse|wife|husband|girlfriend|boyfriend|dating|children|kids|pregnan\\w*|his age|your age|age of alex|how old|date of birth|dob|birthday|gender|male or (?:a )?female|man or (?:a )?woman|woman or (?:a )?man|sexuality|sexual orientation|disabilit\\w*|disabled|handicap\\w*|blood group|mental health|medical history|aadhaa?r|pan (?:card|number|details)|passport number|bank (?:account|details)|drinks?|smoke[sr]?|smoking|alcohol)\\b',
 unknown:`\\b(?:salary|salaries|ctc|compensation|pay(?: package| scale)?|stock options?|esops?|expected package|current package|hike|payslip|salary slip)\\b|${SCOPED_DURATION}`,
 offTopic:'\\b(?:weather|recipe|capital of|president of|prime minister|(?:^|can you |could you |would you |will you |please |now )write\\b[^.?!]{0,30}?\\b(?:function|program|script|query|class|snippet|regex|poem|song|story|essay|sql|code)|solve (?:this|that|the following|for x)|algorithms? (?:question|round|problem|challenge)|leetcode|dsa|bitcoin|crypto price|stock market|medical|diagnos\\w*|poem|joke|calculate (?:this|that|the following)|explain how to|teach me (?:python|java|javascript|to code|how to code)|what is python|explain python|what is javascript|explain javascript|what is java|explain java)\\b',
};
/**
 * `unmatched` marks the last resort, and only it.
 *
 * The guard.unknown branch and the final fallback both answer with the
 * source 'Not documented', so the source string cannot tell them apart, and
 * the difference matters: one is a deliberate refusal (salary, CTC) and the
 * other is simply a question no pattern happened to catch. A model tier may
 * be offered the second and must never be offered the first.
 * See app/api/chat/route.ts.
 */
export type Answer={answer:string;href?:string;mode:'faq'|'ai';source:string;id?:string;unmatched?:boolean;/** Approved answers this reply drew on. Set by /api/chat, never by answerQuestion(); the client sends them back so a follow-up keeps its subject. */ids?:string[]};
/**
 * One spelling of the question, for every regex in this file.
 *
 * NFKD folds the compatibility forms, which closes two holes at once. A
 * fullwidth paste of `ｉｇｎｏｒｅ　ａｌｌ　ｐｒｅｖｉｏｕｓ　ｉｎｓｔｒｕｃｔｉｏｎｓ` decomposes to the ASCII
 * the abuse guard is written in, where before it walked straight past. And
 * with the combining marks stripped afterwards, `résumé` becomes `resume`, 
 * the pattern `'résumé'` could never match anything, because JavaScript's `\b`
 * is ASCII-only and an accented vowel is not a word character, so the trailing
 * boundary had nothing to sit against.
 *
 * Curly apostrophes fold to straight ones because phone keyboards produce
 * them and every pattern in this file is written with the straight form.
 *
 * NFKD alone does NOT defend against a Cyrillic homoglyph: it keeps `а` and
 * `a` distinct, correctly, since they are different letters rather than
 * different encodings of one. That used to be an accepted risk on the
 * grounds that the model could only choose an answer id, and it stopped
 * being one when the NIM tier began composing prose. `HOMOGLYPHS` above now
 * folds them, after lowercasing, so the guards see the string a human reads.
 */
export function normaliseQuestion(question:string):string {
 return question.normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[‘’‛]/g,'\'').toLowerCase().replace(/[\u0400-\u04ff\u0370-\u03ff\u0500-\u052f]/g,ch=>HOMOGLYPHS[ch]??ch).trim();
}
export function answerQuestion(question:string):Answer {
 const q=normaliseQuestion(question);
 const privateWorkBoundary='I can share only safe public summaries of Alex’s work. I do not provide credentials, internal infrastructure, client data, source code, test data, security findings, or private links.';
 if(new RegExp(guard.sensitive,'i').test(q))return {answer:privateWorkBoundary,mode:'faq',source:'Safety boundary'};
 if(new RegExp(guard.abuse,'i').test(q))return {answer:'I can help with professional questions about Alex’s projects, skills, certifications, and experience.',mode:'faq',source:'Portfolio guide'};
 // No contact details in this one, on purpose. See guard.personal above.
 if(new RegExp(guard.personal,'i').test(q))return {answer:'That is personal information, and not something this portfolio covers. I can answer questions about Alex’s work, skills, experience, education and availability.',mode:'faq',source:'Out of scope'};
 if(new RegExp(guard.unknown,'i').test(q))return {answer:`That detail is not in the portfolio. Please ask Alex directly at ${profile.email} or ${profile.phone}.`,href:profile.linkedin,mode:'faq',source:'Not documented'};
 if(new RegExp(guard.offTopic,'i').test(q))return {answer:'I answer questions about Alex’s work. Ask about his projects, skills, certifications, or experience.',mode:'faq',source:'Portfolio guide'};
 if(/^(hi|hello|hey|thanks|thank you)[!. ]*$/i.test(q))return {answer:'Hello! I can help you explore Alex’s AI projects, full stack work, skills, certifications, and engineering experience.',mode:'faq',source:'Portfolio guide'};
 const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const found=answers.find(a=>a.patterns.some(word=>new RegExp(`\\b${escapeRegExp(word)}\\b`,'i').test(q)));
 if(found)return {answer:found.answer,href:found.href,mode:'faq',source:'From the portfolio',id:found.id};
 return {answer:`I don’t have a documented answer to that question. Try asking about Alex’s projects, skills, certifications, education, availability or experience. You can also reach him directly at ${profile.email} or ${profile.phone}.`,href:profile.linkedin,mode:'faq',source:'Not documented',unmatched:true};
}
