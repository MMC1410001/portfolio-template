'use client';
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import Link from 'next/link';
import Chat from './Chat';
import { useHeatmapPreview } from '@/hooks/use-heatmap-preview';
import { useModeTracking } from '@/hooks/use-mode-tracking';
const ImmersiveSystem=lazy(()=>import('./ImmersiveSystem'));
import TransformBurst from './TransformBurst';
import SocialIcons from './SocialIcons';
import { ArrowUpRight, ArrowDown, Phone, Code2 as Github, BriefcaseBusiness as Linkedin, AtSign as Twitter, Camera as Instagram, Sparkles, FileText, FileDown, X, Code2, ChevronRight } from 'lucide-react';
import { profile, projects, erpProject, experience, skills, certifications, certificationSource, learning, work, recommendations, RELATION_LABEL, publishedAwards, awardSource } from '@/content/portfolio';
import { dashboards } from '@/content/dashboards';
type Mode = 'resume' | 'transitioning' | 'immersive';
// `revealSeconds` is time on the page, not time spent idle. The reveal used to
// wait for ten seconds of no pointer, key or scroll events, which meant the
// visitor it was written for (someone reading and scrolling the résumé) never
// saw it, and it fired mainly for people who had stopped looking. Only a hidden
// tab pauses the clock now.
export const REVEAL_CONFIG = { revealSeconds: 3, behavior: 'auto' as 'auto' | 'invite' };
export default function Portfolio() {
 const [mode,setMode]=useState<Mode>('resume');
 const [seconds,setSeconds]=useState(REVEAL_CONFIG.revealSeconds);
 const [autoplay,setAutoplay]=useState(true);
 const [reduced,setReduced]=useState(false);
 const [invite,setInvite]=useState(false);
 const [active,setActive]=useState('work');
 const transitionTimer=useRef<ReturnType<typeof setTimeout> | null>(null);
 const immersive=mode!=='resume';
 // The heatmap frames this page. Everything that would mutate the layout
 // while it is being screenshotted is frozen off `preview`; `still` is the
 // union of that and prefers-reduced-motion, used at every motion gate.
 const {preview,mode:frozenMode}=useHeatmapPreview();
 const still=preview||reduced;
 const {note}=useModeTracking(mode,reduced,preview);
 // `immersive&&!preview`: mode is frozen below so this is already false in a
 // preview, but the failure is silent and the guard is one token.
 useEffect(()=>{document.documentElement.classList.toggle('dark',immersive&&!preview);return()=>document.documentElement.classList.remove('dark')},[immersive,preview]);
 useEffect(()=>{if(!preview)return;setAutoplay(false);setInvite(false);setMode(frozenMode);},[preview,frozenMode]);
 function reveal(trigger:'timer'|'manual'='manual') {note(trigger);setAutoplay(false);setInvite(false);if(still){setMode('immersive');return;}setMode('transitioning');transitionTimer.current=setTimeout(()=>setMode('immersive'),850);}
 function returnToResume(){note('manual');if(transitionTimer.current)clearTimeout(transitionTimer.current);setMode('resume');setAutoplay(false);}
 useEffect(()=>{const m=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>{setReduced(m.matches);if(m.matches)setAutoplay(false)};update();m.addEventListener('change',update);return()=>{m.removeEventListener('change',update);if(transitionTimer.current)clearTimeout(transitionTimer.current)}},[]);
 useEffect(()=>{
  if(!autoplay||mode!=='resume'||reduced||preview)return;
  // Accumulated rather than `now - start`: a backgrounded tab must not burn the
  // countdown, or the reveal happens where nobody is watching and the visitor
  // returns to a page that changed itself.
  let elapsed=0;let last=Date.now();
  const interval=setInterval(()=>{
   const now=Date.now();
   if(document.hidden){last=now;return;}
   elapsed+=now-last;last=now;
   const left=Math.max(0,REVEAL_CONFIG.revealSeconds-Math.floor(elapsed/1000));
   setSeconds(left);
   if(left===0){setAutoplay(false);if(REVEAL_CONFIG.behavior==='auto')reveal('timer');else setInvite(true);}
  },250);
  return()=>clearInterval(interval);
 },[autoplay,mode,reduced,preview]);
 function navigate(id:string){setActive(id);document.getElementById(id)?.scrollIntoView({behavior:still?'instant':'smooth',block:'start'});}
 // Scroll-spy for the header nav. `active` used to move only on click, so the
 // highlight stayed on whatever was last clicked however far the visitor
 // scrolled. setActive runs in the observer callback, not in the effect body,
 // which is what keeps react-compiler's EffectSetState rule satisfied.
 useEffect(()=>{
  const ids=['work','about','notes','contact'];
  const seen=new Set<string>();
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){if(entry.isIntersecting)seen.add(entry.target.id);else seen.delete(entry.target.id);}
   // Highest in document order wins, the lower one is the section being
   // scrolled away from, not the one being read.
   const next=ids.find(id=>seen.has(id));
   if(next)setActive(next);
  },{rootMargin:'-40% 0px -40% 0px',threshold:0});
  for(const id of ids){const el=document.getElementById(id);if(el)observer.observe(el);}
  return()=>observer.disconnect();
 },[]);
 return <div className={`portfolio ${immersive?'immersive':''} ${mode==='transitioning'?'transforming':''}`}>
  <a href="#main" className="skip-link">Skip to content</a>
  {mode==='transitioning'&&!preview&&<TransformBurst/>}
  {immersive&&!preview&&<div className="transform-afterglow" aria-hidden="true"/>}
  <header className="site-header"><a data-track-tag="nav-home" className="wordmark" href="#main" aria-label={`${profile.fullName} home`} title={profile.fullName}>MMC<i>.</i></a>
   <nav aria-label="Main navigation">{[['work','Work'],['dashboards','Dashboards'],...(publishedAwards.length?[['awards','Awards'] as const]:[]),['about','About'],['notes','Learning'],['contact','Contact']].map(([id,label])=><a key={id} data-track-tag={`nav-${id}`} href={`#${id}`} className={active===id?'active':''} onClick={()=>setActive(id)}>{label}</a>)}</nav>
   {/* The PDF is the one thing a recruiter always wants and immersive mode
       used to hide: the aside and the hero’s availability line are both
       résumé-mode only, leaving the footer as the sole route to it. Grouped
       with the socials rather than added as a fifth header child so
       `justify-content:space-between` keeps its four-cluster rhythm. */}
   <div className="header-links"><SocialIcons place="header"/><a data-track-tag="resume-pdf-header" data-track-cta="resume-pdf-header" className="header-resume" href="/resume-sample.pdf" target="_blank" rel="noreferrer" title="Résumé (PDF), opens in a new tab"><FileDown size={15}/><span>Résumé</span></a></div>
   <button data-track-tag="mode-toggle" data-track-cta="mode-toggle" className="mode-control" onClick={()=>{if(immersive)returnToResume();else reveal('manual')}}><span className="mode-dot"/>{immersive?'Back to résumé':'Experience mode'}<span className="mode-icon">{immersive?<FileText size={15}/>:<Sparkles size={15}/>}</span></button>
  </header>
  <main id="main">
   <section id="hero" className="hero" aria-labelledby="hero-title">
    <div className="hero-copy"><div className="eyebrow"><span className="status-dot"/>{profile.role.toUpperCase()} <span className="hero-edition">PORTFOLIO / 2026</span></div>
     <h1 id="hero-title"><span className="resume-title">Alex<br/>Rivera<span className="name-dot">.</span></span><span className="immersive-title">Human ideas.<br/><span>Intelligent</span><br/>experiences<span className="name-dot">.</span></span></h1>
     <div className="intro-identity"><span className="intro-avatar" aria-hidden="true"><img src={profile.avatar} width={720} height={720} alt="" decoding="async"/></span><p className="intro-name">{immersive?'Hi, I’m Alex Rivera.':'Python. Interfaces. Applied AI.'}</p></div><p className="hero-description">{profile.summary}</p>
     <div className="hero-actions"><a data-track-tag="hero-explore-work" data-track-cta="hero-explore-work" className="primary-action" href="#work" onClick={()=>setActive('work')}>Explore my work <ArrowUpRight size={18}/></a><a data-track-tag="hero-email" className="text-action" href={`mailto:${profile.email}`}>Let’s talk <ArrowUpRight size={17}/></a></div>
     <p className="hero-availability"><span>{profile.availability}</span><span>{profile.openTo}</span><span>{profile.relocation}</span><a data-track-tag="resume-pdf-hero" data-track-cta="resume-pdf-hero" href="/resume-sample.pdf" target="_blank" rel="noreferrer"><FileText size={15}/> Résumé (PDF)</a></p>
     <div className="hero-socials"><span>{profile.location}</span><span className="separator"/><a data-track-tag="hero-github" href={profile.github} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14}/></a><a data-track-tag="hero-linkedin" href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={14}/></a><a data-track-tag="hero-twitter" href={profile.twitter} target="_blank" rel="noreferrer">X <ArrowUpRight size={14}/></a><a data-track-tag="hero-instagram" href={profile.instagram} target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={14}/></a></div>
    </div>
    <div className="resume-aside"><div className="aside-top"><Code2 size={19}/><span>THE SHORT VERSION</span></div><dl><div><dt>Focus</dt><dd>Full stack & applied AI</dd></div><div><dt>Building with</dt><dd>Python · React · FastAPI</dd></div><div><dt>Background</dt><dd>QA automation &rarr; full stack</dd></div><div><dt>Currently</dt><dd>{experience[0].role} at Northwind</dd></div><div className="aside-availability"><dt>Availability</dt><dd>{profile.availability}</dd></div><div><dt>Open to</dt><dd>{profile.openTo}</dd></div><div><dt>Relocation</dt><dd>{profile.relocation}</dd></div></dl><a data-track-tag="resume-pdf-aside" data-track-cta="resume-pdf-aside" href="/resume-sample.pdf" target="_blank" rel="noreferrer"><FileText size={16}/> Résumé (PDF)<ArrowUpRight size={16}/></a></div>
    <div className="stage-column">
    <div className="system-stage">{immersive&&!preview&&<Suspense fallback={<div className="scene-loading">Connecting the stack…</div>}><ImmersiveSystem reduced={reduced} preview={preview}/></Suspense>}<div className="stage-caption"><span className="live-dot"/> THE CONNECTED STACK <span>EXPLORE ↓</span></div></div>
    {immersive&&<div className="stage-runway" aria-hidden="true"/>}
    </div>
    <div className="hero-bottom"><span>{immersive?'A little curiosity goes a long way.':'There’s another side to this portfolio.'}</span>{immersive?<button data-track-tag="hero-scroll-explore" onClick={()=>navigate('work')}>SCROLL TO EXPLORE <ArrowDown size={16}/></button>:<div className="reveal-controls"><button data-track-tag="reveal-immersive" data-track-cta="reveal-immersive" className="reveal-link" onClick={()=>reveal('manual')}>See the other side <Sparkles size={16}/></button>{autoplay?<><span className="countdown">in {seconds}s</span><button data-track-tag="reveal-pause" className="pause-reveal" aria-label="Pause automatic reveal" onClick={()=>setAutoplay(false)}><X size={14}/></button></>:<span className="countdown">{invite?'Ready when you are':'Click to transform'}</span>}</div>}</div>
   </section>
   <section className="stack-strip" aria-label="Core technologies"><span>FROM INTERFACE TO INTELLIGENCE</span><div><span>React</span><i aria-hidden="true">✳</i><span>Python</span><i aria-hidden="true">✳</i><span>FastAPI</span><i aria-hidden="true">✳</i><span>MCP</span><i aria-hidden="true">✳</i><span>RAG</span><i aria-hidden="true">✳</i><span>TypeScript</span></div></section>
   <section id="work" className="content-section"><div className="section-heading"><div><p className="eyebrow">SELECTED WORK</p><h2>Ideas, made tangible<span>.</span></h2></div><a data-track-tag="work-all-repos" className="text-action" href={profile.github} target="_blank" rel="noreferrer">All repositories <ArrowUpRight size={17}/></a></div>
    <article id={erpProject.id} data-track-cta="section-northwind-erp" className="erp-case-study" aria-labelledby="erp-project-title">
     <div className="erp-case-heading"><div><p className="eyebrow">{erpProject.category}</p><h3 id="erp-project-title">{erpProject.name}</h3></div><span className="erp-workflow-count">{erpProject.workflows.length} live workflows</span></div>
     <p className="erp-description">{erpProject.description}</p><div className="tag-list">{erpProject.stack.map(item=><span key={item}>{item}</span>)}</div>
     <details className="erp-details"><summary data-track-tag="erp-expand" data-track-cta="erp-expand">Explore the systems and my contributions</summary><div className="erp-workflows">{erpProject.workflows.map(workflow=><section key={workflow.id} aria-labelledby={`erp-${workflow.id}`}><span className="erp-contribution">{workflow.contribution}</span><h4 id={`erp-${workflow.id}`}>{workflow.name}</h4><p>{workflow.description}</p></section>)}</div></details>
    </article>
    <div className="project-grid">{projects.map(p=><article className={`project-card project-${p.id}`} key={p.id}><div className="project-visual"><div className="project-diagram"><span>{p.flow[0]}</span><ChevronRight/><strong>{p.flow[1]}</strong><ChevronRight/><span>{p.flow[2]}</span></div><span className="visual-kind">{p.kind}</span><Code2 className="visual-icon" size={22}/></div><div className="project-info"><p className="eyebrow">{p.category}</p><span className="project-scope">{p.kind}</span><a data-track-tag={`project-${p.id}`} className="project-title" href={p.href??`${profile.github}/${p.repo}`} target={p.href?undefined:'_blank'} rel={p.href?undefined:'noreferrer'}><h3>{p.name}</h3><ArrowUpRight/></a><p>{p.description}</p>{p.outcome&&<p className="project-outcome">{p.outcome}</p>}<div className="tag-list">{p.stack.map(s=><span key={s}>{s}</span>)}</div></div></article>)}</div>
   </section>
   <section id="dashboards" className="content-section"><div className="section-heading"><div><p className="eyebrow">OPERATIONAL VISIBILITY</p><h2>Ten dashboards, and why<br/>each one exists<span>.</span></h2></div><Link data-track-tag="dashboards-view-all" data-track-cta="dashboards-view-all" className="text-action" href="/dashboards">All dashboards <ArrowUpRight size={17}/></Link></div>
    <p className="section-intro">Built at Northwind so delivery status, quality, effort and objectives stopped living in spreadsheets. Each card opens a working rebuild on invented data. The layouts, the calculations and the controls are the originals; the people, clients and numbers are not.</p>
    <div className="dashboard-grid">{dashboards.map(d=><Link key={d.id} data-track-tag={`dashboard-card-${d.id}`} data-track-cta={`dashboard-card-${d.id}`} className="dashboard-card" href={`/dashboards/${d.id}`}>
     <span className="dashboard-card-top"><span className="product-category">{d.client??'Internal'}</span><span className={`dashboard-status dashboard-status-${d.status}`}>{d.status}</span></span>
     <h3>{d.name}</h3><p className="dashboard-tagline">{d.tagline}</p>
     <span className="dashboard-metric">{d.metric}</span>
     <span className="dashboard-card-foot">Open dashboard <ArrowUpRight size={15}/></span>
    </Link>)}</div>
   </section>
   {publishedAwards.length>0&&<section id="awards" className="content-section"><div className="section-heading"><div><p className="eyebrow">RECOGNITION</p><h2>Recognised for the<br/>work itself<span>.</span></h2></div><a data-track-tag="awards-linkedin" className="text-action" href={awardSource} target="_blank" rel="noreferrer">View on LinkedIn <ArrowUpRight size={17}/></a></div>
    <div className="award-grid">{publishedAwards.map(award=><article key={award.id} className="award-card"><span className="product-category">{award.category}</span><h3>{award.name}</h3><p className="award-date">{award.issued}</p><p className="award-citation">{award.citation}</p><span className="award-issuer">{award.issuer}</span></article>)}</div>
   </section>}
   <section id="about" className="content-section about-section"><div><p className="eyebrow">THE PERSON BEHIND THE CODE</p><h2>Curiosity builds.<br/>Rigor makes it last<span>.</span></h2><p>I’m Alex, a {experience[0].role} at {experience[0].company}, based in Austin. I connect Python backends, useful interfaces, and AI systems that can be evaluated.</p><p>My professional foundation is in quality engineering across FinTech and AI. That experience shapes how I build: understand the system, question the output, and make it reliable.</p><p>I came to software sideways, through a civil engineering degree, then Brookfield, then two and a half years automating tests before moving into development. Breaking software first is why I now build it to be verified.</p><div className="education"><span>EDUCATION</span><strong>PG Diploma in Advanced Computing</strong><p>Brookfield Institute · 2022</p><span>BE, Civil Engineering · 2021</span></div></div><figure className="about-portrait"><div className="portrait-frame"><img src={profile.photo} srcSet={`${profile.photo} 900w, ${profile.photoLarge} 1600w`} sizes="(max-width:700px) 92vw, 440px" width={900} height={1200} alt="Alex Morgan Rivera" loading="lazy" decoding="async"/></div><figcaption><strong>{profile.fullName}</strong><span>{profile.role}</span></figcaption></figure><div className="experience-list"><p className="eyebrow">ENGINEERING EXPERIENCE</p>{experience.map(e=><article key={e.company}><span className="experience-date">{e.dates}</span><h3>{e.url?<a data-track-tag={`employer-${e.company.split(' ')[0].toLowerCase()}`} href={e.url} target="_blank" rel="noreferrer">{e.company}<ArrowUpRight size={16}/></a>:e.company}</h3>{e.about&&<p className="company-about">{e.about}</p>}<p className="role-label">{e.role}</p><p>{e.summary}</p></article>)}</div></section>
   <section id="skills" className="content-section skills-section" aria-labelledby="stack-heading"><div className="section-heading"><div><p className="eyebrow">MY TOOLKIT</p><h2 id="stack-heading">Across the stack<span>.</span></h2></div></div><div className="skills-grid">{skills.map((group,i)=><div key={group.name}><span className="skill-symbol">{['{ }','>_','✳','↗'][i]}</span><h3>{group.name}</h3><ul>{group.items.map(s=><li key={s}>{s}</li>)}</ul></div>)}</div></section>
   <section id="notes" className="content-section"><div className="section-heading"><div><p className="eyebrow">LEARNING IN THE OPEN</p><h2>Build. Understand. Document<span>.</span></h2></div><span className="section-note">Notes and guides</span></div><div className="learning-list">{learning.map(n=><a key={n.href} data-track-tag={`learning-${n.id}`} href={n.href} target="_blank" rel="noreferrer"><div className="note-icon"><FileText size={23}/></div><div><span className="eyebrow">{n.label}</span><h3>{n.title}</h3><p>{n.description}</p></div><ArrowUpRight/></a>)}</div></section>
   <section id="products" className="content-section product-section"><div className="section-heading"><div><p className="eyebrow">PROFESSIONAL WORK</p><h2>What I built, and what I broke<span>.</span></h2></div></div><p className="section-intro">Client and in-house products, split by what I actually did on each: development, or the quality and evaluation engineering I moved into development from.</p>
    <p className="eyebrow product-group-label">BUILT &amp; SHIPPED</p><div className="product-list">{work.filter(w=>w.group==='built').map(w=><article key={w.id}><span className="product-category">{w.category}</span><h3>{w.href?<a data-track-tag={`product-${w.id}`} href={w.href} target={w.href.startsWith('#')?undefined:'_blank'} rel={w.href.startsWith('#')?undefined:'noreferrer'}>{w.name}<ArrowUpRight size={17}/></a>:w.name}</h3><p>{w.role}</p>{w.items&&<div className="project-items"><p className="eyebrow">{w.itemsLabel}</p><ul>{w.items.map(item=><li key={item.id}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul></div>}{w.stack&&<div className="tag-list">{w.stack.map(item=><span key={item}>{item}</span>)}</div>}</article>)}</div>
    <p className="eyebrow product-group-label">QUALITY &amp; EVALUATION ENGINEERING</p><div className="product-list">{work.filter(w=>w.group==='quality').map(w=><article key={w.id}><span className="product-category">{w.category}</span><h3>{w.href?<a data-track-tag={`product-${w.id}`} href={w.href} target={w.href.startsWith('#')?undefined:'_blank'} rel={w.href.startsWith('#')?undefined:'noreferrer'}>{w.name}<ArrowUpRight size={17}/></a>:w.name}</h3><p>{w.role}</p>{w.items&&<div className="project-items"><p className="eyebrow">{w.itemsLabel}</p><ul>{w.items.map(item=><li key={item.id}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul></div>}{w.stack&&<div className="tag-list">{w.stack.map(item=><span key={item}>{item}</span>)}</div>}</article>)}</div></section>
   <section id="certifications" className="content-section certifications-section" aria-labelledby="certifications-heading">
    <div className="section-heading"><div><p className="eyebrow">CERTIFICATIONS</p><h2 id="certifications-heading">Learning, with credentials<span>.</span></h2></div><a data-track-tag="certs-linkedin" className="text-action" href={certificationSource} target="_blank" rel="noreferrer">View on LinkedIn <ArrowUpRight size={17}/></a></div>
    <p className="section-intro">Two examined credentials, and the self-directed courses behind the rest of the work.</p>
    <div className="certification-grid">{certifications.filter(c=>c.featured).map(certificate=><article key={certificate.id}><p className="eyebrow">{certificate.category}</p><h3>{certificate.name}</h3><p className="certificate-issuer">{certificate.issuer}</p>{certificate.issued&&<p className="certificate-date">Issued {certificate.issued}</p>}<div className="certificate-links"><a data-track-tag={`cert-${certificate.id}`} href={certificate.href} target="_blank" rel="noreferrer" aria-label={`${certificate.id==='istqb'?'View on LinkedIn':'View credential'}: ${certificate.name}`}>{certificate.id==='istqb'?'View on LinkedIn':'View credential'}<ArrowUpRight size={16}/></a>{certificate.notesHref&&<a data-track-tag={`cert-notes-${certificate.id}`} href={certificate.notesHref} target="_blank" rel="noreferrer" aria-label={`Read Alex's notes for ${certificate.name}`}>Read notes<ArrowUpRight size={16}/></a>}</div></article>)}</div>
    <details className="certification-more"><summary data-track-tag="certs-expand">{certifications.filter(c=>!c.featured).length} further courses completed</summary><ul className="certification-list">{certifications.filter(c=>!c.featured).map(certificate=><li key={certificate.id}><span className="certificate-name">{certificate.name}</span><span className="certificate-meta">{certificate.issuer}{certificate.issued?` · ${certificate.issued}`:''}</span><span className="certificate-links"><a data-track-tag={`cert-${certificate.id}`} href={certificate.href} target="_blank" rel="noreferrer" aria-label={`View credential: ${certificate.name}`}>Credential<ArrowUpRight size={14}/></a>{certificate.notesHref&&<a data-track-tag={`cert-notes-${certificate.id}`} href={certificate.notesHref} target="_blank" rel="noreferrer" aria-label={`Read Alex's notes for ${certificate.name}`}>Notes<ArrowUpRight size={14}/></a>}</span></li>)}</ul></details>
   </section>
   <section id="recommendations" className="content-section recommendations-section"><div className="section-heading"><div><p className="eyebrow">PEOPLE, NOT JUST PROJECTS</p><h2>Better work happens together<span>.</span></h2></div><Linkedin size={27}/></div><p className="section-intro">{recommendations.length} recommendations on LinkedIn, from managers, colleagues who reported to Alex, and teammates across quality engineering and development. Scroll for the rest.</p><div className="recommendation-rail" role="region" aria-label="Recommendations" tabIndex={0}>{recommendations.map(r=><article key={r.id}><span className="quote-mark" aria-hidden="true">“</span><blockquote>{r.quote}</blockquote><div className="quote-person"><span className="avatar">{r.name.split(' ').map(w=>w[0]).join('')}</span><div>{r.url?<a data-track-tag={`recommendation-${r.id}`} href={r.url} target="_blank" rel="noreferrer">{r.name}<ArrowUpRight size={15}/></a>:<strong className="recommender-name">{r.name}</strong>}<p>{r.role}</p><span className="relation-tag">{RELATION_LABEL[r.relation]}</span></div></div><details><summary data-track-tag="recommendation-expand">Read full recommendation</summary><p>{r.full}</p><span>{r.date} · {RELATION_LABEL[r.relation]} · LinkedIn</span></details></article>)}</div></section>
   <section id="contact" className="contact-section"><p className="eyebrow">LET’S BUILD SOMETHING USEFUL</p><h2>Good ideas deserve<br/>great execution<span>.</span></h2><a data-track-tag="contact-email" data-track-cta="contact-email" className="contact-email" href={`mailto:${profile.email}`}>Let’s start a conversation <ArrowUpRight/></a><div className="contact-links"><a data-track-tag="contact-phone" data-track-cta="contact-phone" href={`tel:${profile.phone.replace(/\s/g,'')}`}><Phone size={18}/>{profile.phone}</a><a data-track-tag="contact-github" href={profile.github} target="_blank" rel="noreferrer"><Github size={18}/>GitHub</a><a data-track-tag="contact-linkedin" href={profile.linkedin} target="_blank" rel="noreferrer"><Linkedin size={18}/>LinkedIn</a><a data-track-tag="contact-twitter" href={profile.twitter} target="_blank" rel="noreferrer"><Twitter size={18}/>X</a><a data-track-tag="contact-instagram" href={profile.instagram} target="_blank" rel="noreferrer"><Instagram size={18}/>Instagram</a><a data-track-tag="contact-pdf" data-track-cta="contact-pdf" href="/resume-sample.pdf" target="_blank" rel="noreferrer"><FileText size={18}/>Résumé</a></div></section>
  </main>{!preview&&<Chat/>}<footer><span>© 2026 Alex Rivera</span><Link data-track-tag="footer-dashboards" href="/dashboards">Dashboards</Link><Link data-track-tag="footer-analytics" href="/analytics">Analytics</Link><Link data-track-tag="footer-privacy" href="/privacy">Privacy</Link><span>One mind. Two perspectives.</span><button data-track-tag="back-to-top" onClick={()=>window.scrollTo({top:0,behavior:still?'instant':'smooth'})}>Back to top ↑</button></footer>
 </div>
}
