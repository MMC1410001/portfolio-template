'use client';
import { useCallback, useEffect, useState, useRef, lazy, Suspense, type CSSProperties } from 'react';
import Link from 'next/link';
import Chat from './ChatLauncher';
import RecommendationRail from './RecommendationRail';
import PinnedRail from './PinnedRail';
import More from './More';
import SiteNav, { type NavItems, type SiteNavHandle } from './SiteNav';
import { useHeatmapPreview } from '@/hooks/use-heatmap-preview';
import { useModeTracking } from '@/hooks/use-mode-tracking';
import { useChapterStack, flowScrollTop } from '@/hooks/use-chapter-stack';
// One promise for the warm-up and the lazy() import, so a chunk fetched on idle
// is the chunk the reveal renders. Cleared on failure so a later reveal retries.
let immersiveChunk:Promise<typeof import('./ImmersiveSystem')>|null=null;
const loadImmersive=()=>immersiveChunk??=import('./ImmersiveSystem').catch(error=>{immersiveChunk=null;throw error});
const ImmersiveSystem=lazy(loadImmersive);
import TransformBurst from './TransformBurst';
import SocialIcons from './SocialIcons';
import SceneBoundary, { type BoundaryScope } from './SceneBoundary';
import { queueEvent } from '@/lib/analytics/queue';
import { ArrowUpRight, ArrowDown, Phone, Code2 as Github, BriefcaseBusiness as Linkedin, AtSign as Twitter, Camera as Instagram, Sparkles, FileText, FileDown, X, Code2, ChevronRight } from 'lucide-react';
import { profile, projects, erpProject, experience, skills, certifications, certificationSource, learning, work, recommendations, recommendationSource, publishedAwards, awardSource } from '@/content/portfolio';
import { dashboards, numberWord } from '@/content/dashboards';
type Mode = 'resume' | 'transitioning' | 'immersive';
// `revealSeconds` is time on the page, not time spent idle. The reveal used to
// wait for ten seconds of no pointer, key or scroll events, which meant the
// visitor it was written for (someone reading and scrolling the résumé) never
// saw it, and it fired mainly for people who had stopped looking. Only a hidden
// tab pauses the clock now.
export const REVEAL_CONFIG = { revealSeconds: 3, behavior: 'auto' as 'auto' | 'invite' };
// Small derivatives of `profile.avatar` and `profile.photo*`, cut with sips
// from the files beside them in public/. The avatar is drawn at 62px and was
// downloading the 720px, 120KB original, which stays for og:image. The about
// portrait gains a 1200w step so a 3x phone stops at 1200 instead of the
// 948KB 1600w, and AVIF copies at a quarter of the JPEG weight.
const AVATAR_SET='/avatar-128.jpg 128w, /avatar-192.jpg 192w';
// Single-image AVIFs (ffmpeg + libsvtav1). The macOS-exported originals were tiled `grid`
// AVIFs, which Android Chrome decodes to an empty frame with no error and no JPEG fallback. Renamed -v2 so a day-cached broken copy is not reused.
const PHOTO_AVIF='/portrait-900-v2.avif 900w, /portrait-1200-v2.avif 1200w, /portrait-1600-v2.avif 1600w';
// The rendered width, not an estimate: 24px gutters under 700px and a 440px
// cap everywhere, which the old `92vw` overstated on every phone.
const PHOTO_SIZES='(max-width:488px) calc(100vw - 48px), 440px';
// One list for the header nav and the scroll-spy (both in SiteNav.tsx), in
// document order. The spy used to keep its own four ids, so scrolling through
// #dashboards or #awards left the highlight on whichever section came before.
const NAV:NavItems=[['work','Work'],['dashboards','Dashboards'],...(publishedAwards.length?[['awards','Awards'] as const]:[]),['about','About'],['notes','Learning'],['contact','Contact']];
export default function Portfolio() {
 const [mode,setMode]=useState<Mode>('resume');
 const [seconds,setSeconds]=useState(REVEAL_CONFIG.revealSeconds);
 const [autoplay,setAutoplay]=useState(true);
 const [reduced,setReduced]=useState(false);
 const [invite,setInvite]=useState(false);
 const transitionTimer=useRef<ReturnType<typeof setTimeout> | null>(null);
 const rootRef=useRef<HTMLDivElement>(null);
 const headerRef=useRef<HTMLElement>(null);
 // The nav owns the highlight (SiteNav.tsx); this only moves it on a click.
 const siteNav=useRef<SiteNavHandle>(null);
 const setActive=(id:string)=>siteNav.current?.select(id);
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
 // Freeze into the preview's mode once the preview flag resolves (it is false
 // on the first client paint, see useHeatmapPreview). Compared during render
 // rather than set from an effect: an effect is react-compiler's EffectSetState,
 // and it also painted one resume-mode frame before the frozen one.
 const previewKey=preview?frozenMode:'off';
 const [frozenFor,setFrozenFor]=useState('off');
 if(frozenFor!==previewKey){setFrozenFor(previewKey);if(preview){setAutoplay(false);setInvite(false);setMode(frozenMode);}}
 // useCallback so the countdown effect can name it as a dependency. `note` is
 // itself stable and `still` only moves with `reduced`/`preview`, which the
 // countdown already restarts on, so this adds no restarts of its own.
 const reveal=useCallback((trigger:'timer'|'manual'='manual')=>{note(trigger);setAutoplay(false);setInvite(false);if(still){setMode('immersive');return;}setMode('transitioning');transitionTimer.current=setTimeout(()=>setMode('immersive'),850);},[note,still]);
 // The Experience chunk never arrived (offline mid-session, or a hashed chunk a
 // redeploy removed). The boundary around the lazy import catches it, and this
 // puts the visitor back on the résumé, the page they came for, rather than a
 // dark, empty stage. `.dark` follows `immersive`, so it clears with the mode;
 // the pending timer must go too, or it flips the mode straight back. A later
 // click fails the same way at once: the browser caches a failed module fetch.
 function sceneFailed(scope:BoundaryScope){if(transitionTimer.current)clearTimeout(transitionTimer.current);setMode('resume');setAutoplay(false);setInvite(false);queueEvent('error',{props:{scope}});}
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
 },[autoplay,mode,reduced,preview,reveal]);
 // Fetch the Experience chunk and frame 0 while the visitor reads, so the 3s
 // auto-reveal does not start a download of its own: before this, lazy()
 // only asked for the chunk at the reveal, and the frames only after it
 // mounted. Same idle-with-a-ceiling as ChatLauncher. Skipped where nothing
 // will reveal by itself (reduced motion, the heatmap preview); a click there
 // loads it as before. `still` resolves after the first paint, and the change
 // cancels a warm-up scheduled before it did.
 useEffect(()=>{
  if(still)return;
  const warm=()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;loadImmersive().catch(()=>{/* the reveal retries, and the boundary handles a second failure */});const frame=new Image();frame.decoding='async';frame.src='/turntable/f-00.avif';};
  const idle='requestIdleCallback' in window;const id=idle?window.requestIdleCallback(warm,{timeout:2000}):window.setTimeout(warm,1200);
  return()=>{if(idle)window.cancelIdleCallback(id);else window.clearTimeout(id)};
 },[still]);
 // The sections sit in four `.chapter`s that stick and stack (globals.css), and
 // `still` turns all of that off, so the heatmap preview sees plain flow.
 useChapterStack(rootRef,!still);
 // Scrolled to where the section lives in the flow, not where a stuck chapter
 // happens to paint it (see flowScrollTop).
 function navigate(id:string){setActive(id);const el=document.getElementById(id);const root=rootRef.current;if(!el)return;if(still||!root)el.scrollIntoView({behavior:'instant',block:'start'});else window.scrollTo({top:flowScrollTop(root,el),behavior:'smooth'});}
 // Every in-page link into a chapter, the nav and "#northwind-erp" from the
 // products list included, for the same reason. Delegated so a new `#` link
 // needs nothing. replaceState keeps the router's history.state, a pushState
 // without it is a full reload on the next Back in an App Router.
 useEffect(()=>{
  const root=rootRef.current;
  if(!root||still)return;
  const jump=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const id=(event.target as Element).closest('a[href^="#"]')?.getAttribute('href')?.slice(1);
   const el=id?document.getElementById(id):null;
   if(!id||!el||!el.closest('.chapter'))return;
   event.preventDefault();window.scrollTo({top:flowScrollTop(root,el),behavior:'smooth'});history.replaceState(history.state,'',`#${id}`);
  };
  root.addEventListener('click',jump);
  return()=>root.removeEventListener('click',jump);
 },[still]);
 // The header slides away while scrolling down and returns on the way up.
 // An attribute through a ref, not state: this fires on every scrolled frame.
 // `:focus-within` in the CSS keeps it in view for a keyboard user.
 useEffect(()=>{
  const header=headerRef.current;
  if(!header||still)return;
  let last=window.scrollY,frame=0;
  const update=()=>{frame=0;const y=window.scrollY;if(Math.abs(y-last)<8)return;header.toggleAttribute('data-hidden',y>last&&y>120);last=y;};
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  addEventListener('scroll',onScroll,{passive:true});
  return()=>{removeEventListener('scroll',onScroll);cancelAnimationFrame(frame);header.removeAttribute('data-hidden');};
 },[still]);
 return <div ref={rootRef} className={`portfolio ${immersive?'immersive':''} ${mode==='transitioning'?'transforming':''} ${still?'still':''}`}>
  <a href="#main" className="skip-link">Skip to content</a>
  {mode==='transitioning'&&!preview&&<TransformBurst/>}
  {immersive&&!preview&&<div className="transform-afterglow" aria-hidden="true"/>}
  <header ref={headerRef} className="site-header"><a data-track-tag="nav-home" className="wordmark" href="#main" aria-label={`${profile.fullName} home`} title={profile.fullName}>MMC<i>.</i></a>
   <SiteNav ref={siteNav} items={NAV} still={still}/>
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
     <h1 id="hero-title"><span className="resume-title">Alex <br/>Rivera<span className="name-dot">.</span></span><span className="immersive-title">Human ideas. <br/><span>Intelligent</span><br/>experiences<span className="name-dot">.</span></span></h1>
     <div className="intro-identity"><span className="intro-avatar" aria-hidden="true">{/* oxlint-disable-next-line nextjs/no-img-element -- vinext has no next/image; the avatar is already sized and served static */}
<img src="/avatar-128.jpg" srcSet={AVATAR_SET} sizes="(max-width:700px) 54px, 62px" width={128} height={128} alt="" decoding="async"/></span><p className="intro-name">{immersive?'Hi, I’m Alex Rivera.':'Python. Interfaces. Applied AI.'}</p></div><p className="hero-description">{profile.summary}</p>
     <div className="hero-actions"><a data-track-tag="hero-explore-work" data-track-cta="hero-explore-work" className="primary-action" href="#work" onClick={()=>setActive('work')}>Explore my work <ArrowUpRight size={18}/></a><a data-track-tag="hero-email" className="text-action" href={`mailto:${profile.email}`}>Let’s talk <ArrowUpRight size={17}/></a></div>
     <p className="hero-availability"><span>{profile.availability}</span><span>{profile.openTo}</span><span>{profile.relocation}</span><a data-track-tag="resume-pdf-hero" data-track-cta="resume-pdf-hero" href="/resume-sample.pdf" target="_blank" rel="noreferrer"><FileText size={15}/> Résumé (PDF)</a></p>
     <div className="hero-socials"><span>{profile.location}</span><span className="separator"/><a data-track-tag="hero-github" href={profile.github} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14}/></a><a data-track-tag="hero-linkedin" href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={14}/></a><a data-track-tag="hero-twitter" href={profile.twitter} target="_blank" rel="noreferrer">X <ArrowUpRight size={14}/></a><a data-track-tag="hero-instagram" href={profile.instagram} target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={14}/></a></div>
    </div>
    <div className="resume-aside"><div className="aside-top"><Code2 size={19}/><span>THE SHORT VERSION</span></div><dl><div><dt>Focus</dt><dd>Full stack & applied AI</dd></div><div><dt>Building with</dt><dd>Python · React · FastAPI</dd></div><div><dt>Background</dt><dd>QA automation &rarr; full stack</dd></div><div><dt>Currently</dt><dd>{experience[0].role} at Northwind</dd></div><div className="aside-availability"><dt>Availability</dt><dd>{profile.availability}</dd></div><div><dt>Open to</dt><dd>{profile.openTo}</dd></div><div><dt>Relocation</dt><dd>{profile.relocation}</dd></div></dl><a data-track-tag="resume-pdf-aside" data-track-cta="resume-pdf-aside" href="/resume-sample.pdf" target="_blank" rel="noreferrer"><FileText size={16}/> Résumé (PDF)<ArrowUpRight size={16}/></a></div>
    <div className="stage-column">
    <div className="system-stage">{immersive&&!preview&&<SceneBoundary scope="immersive-chunk" onError={sceneFailed} fallback={null}><Suspense fallback={<div className="scene-loading">Connecting the stack…</div>}><ImmersiveSystem reduced={reduced} preview={preview}/></Suspense></SceneBoundary>}<div className="stage-caption"><span className="live-dot"/> THE CONNECTED STACK <span>EXPLORE ↓</span></div></div>
    {/* Not in a heatmap preview: the admin iframe is sized to the page, so a
        96vh runway grows the frame, which grows the runway, and the recorded
        clicks stop lining up. The preview never mounts the turntable anyway. */}
    {immersive&&!preview&&<div className="stage-runway" aria-hidden="true"/>}
    </div>
    <div className="hero-bottom"><span>{immersive?'A little curiosity goes a long way.':'There’s another side to this portfolio.'}</span>{immersive?<button data-track-tag="hero-scroll-explore" onClick={()=>navigate('work')}>SCROLL TO EXPLORE <ArrowDown size={16}/></button>:<div className="reveal-controls"><button data-track-tag="reveal-immersive" data-track-cta="reveal-immersive" className="reveal-link" onClick={()=>reveal('manual')}>See the other side <Sparkles size={16}/></button>{autoplay?<><span className="countdown">in {seconds}s</span><button data-track-tag="reveal-pause" className="pause-reveal" aria-label="Pause automatic reveal" onClick={()=>setAutoplay(false)}><X size={14}/></button></>:<span className="countdown">{invite?'Ready when you are':'Click to transform'}</span>}</div>}</div>
   </section>
   <section className="stack-strip" aria-label="Core technologies"><span>FROM INTERFACE TO INTELLIGENCE</span><div><span>React</span><i aria-hidden="true">✳</i><span>Python</span><i aria-hidden="true">✳</i><span>FastAPI</span><i aria-hidden="true">✳</i><span>MCP</span><i aria-hidden="true">✳</i><span>RAG</span><i aria-hidden="true">✳</i><span>TypeScript</span></div></section>
   <div className="chapter chapter-work">
   <section id="work" className="content-section"><div className="section-heading"><div><p className="eyebrow">SELECTED WORK</p><h2>Ideas, made tangible<span>.</span></h2></div><a data-track-tag="work-all-repos" className="text-action" href={profile.github} target="_blank" rel="noreferrer">All repositories <ArrowUpRight size={17}/></a></div>
    <article id={erpProject.id} data-track-cta="section-northwind-erp" className="erp-case-study" aria-labelledby="erp-project-title">
     <div className="erp-case-heading"><div><p className="eyebrow">{erpProject.category}</p><h3 id="erp-project-title">{erpProject.name}</h3></div><span className="erp-workflow-count">{erpProject.workflows.length} live workflows</span></div>
     <p className="erp-description">{erpProject.description}</p><div className="tag-list">{erpProject.stack.map(item=><span key={item}>{item}</span>)}</div>
     <details className="erp-details"><summary data-track-tag="erp-expand" data-track-cta="erp-expand">Explore the systems and my contributions</summary><div className="erp-workflows">{erpProject.workflows.map(workflow=><section key={workflow.id} aria-labelledby={`erp-${workflow.id}`}><span className="erp-contribution">{workflow.contribution}</span><h4 id={`erp-${workflow.id}`}>{workflow.name}</h4><p>{workflow.description}</p></section>)}</div></details>
    </article>
    <div className="project-grid">{projects.map((p,i)=><article className={`project-card project-${p.id}`} key={p.id} style={{'--i':i} as CSSProperties}><div className="project-visual"><div className="project-diagram"><span>{p.flow[0]}</span><ChevronRight/><strong>{p.flow[1]}</strong><ChevronRight/><span>{p.flow[2]}</span></div><span className="visual-kind">{p.kind}</span><Code2 className="visual-icon" size={22}/></div><div className="project-info"><p className="eyebrow">{p.category}</p><span className="project-scope">{p.kind}</span><a data-track-tag={`project-${p.id}`} className="project-title" href={p.href??`${profile.github}/${p.repo}`} target={p.href?undefined:'_blank'} rel={p.href?undefined:'noreferrer'}><h3>{p.name}</h3><ArrowUpRight/></a><p>{p.description}</p>{p.outcome&&<p className="project-outcome">{p.outcome}</p>}<div className="tag-list">{p.stack.map(s=><span key={s}>{s}</span>)}</div></div></article>)}</div>
   </section>
   <section id="dashboards" className="content-section dashboards-section"><PinnedRail still={still} label="Dashboards" trackClass="dashboard-rail" heading={<><div className="section-heading"><div><p className="eyebrow">OPERATIONAL VISIBILITY</p><h2>{numberWord(dashboards.length,true)} dashboards, and why <br/>each one exists<span>.</span></h2></div><Link data-track-tag="dashboards-view-all" data-track-cta="dashboards-view-all" className="text-action" href="/dashboards">All dashboards <ArrowUpRight size={17}/></Link></div>
    <More kind="clamp" className="section-intro">Built at Northwind so delivery status, quality, effort and objectives stopped living in spreadsheets. Each card opens a working rebuild on invented data. The layouts, the calculations and the controls are the originals; the people, clients and numbers are not.</More></>}>
    {dashboards.map(d=><Link key={d.id} data-track-tag={`dashboard-card-${d.id}`} data-track-cta={`dashboard-card-${d.id}`} className="dashboard-card" href={`/dashboards/${d.id}`}>
     <span className="dashboard-card-top"><span className="product-category">{d.client??'Internal'}</span><span className={`dashboard-status dashboard-status-${d.status}`}>{d.status}</span></span>
     <h3>{d.name}</h3><p className="dashboard-tagline">{d.tagline}</p>
     <span className="dashboard-metric">{d.metric}</span>
     <span className="dashboard-card-foot">Open dashboard <ArrowUpRight size={15}/></span>
    </Link>)}</PinnedRail>
   </section>
   {publishedAwards.length>0&&<section id="awards" className="content-section"><div className="section-heading"><div><p className="eyebrow">RECOGNITION</p><h2>Recognised for the <br/>work itself<span>.</span></h2></div><a data-track-tag="awards-linkedin" className="text-action" href={awardSource} target="_blank" rel="noreferrer">View on LinkedIn <ArrowUpRight size={17}/></a></div>
    <div className="award-grid">{publishedAwards.map(award=><article key={award.id} className="award-card"><span className="product-category">{award.category}</span><h3>{award.name}</h3><p className="award-date">{award.issued}</p><p className="award-citation">{award.citation}</p><span className="award-issuer">{award.issuer}</span></article>)}</div>
   </section>}
   </div>
   <div className="chapter chapter-about">
   <section id="about" className="content-section about-section"><div><p className="eyebrow">THE PERSON BEHIND THE CODE</p><h2>Curiosity builds. <br/>Rigor makes it last<span>.</span></h2><p>I’m Alex, a {experience[0].role} at {experience[0].company}, based in Austin. I connect Python backends, useful interfaces, and AI systems that can be evaluated.</p><p>My professional foundation is in quality engineering across FinTech and AI. That experience shapes how I build: understand the system, question the output, and make it reliable.</p><p>I came to software sideways, through a civil engineering degree, then Brookfield, then two and a half years automating tests before moving into development. Breaking software first is why I now build it to be verified.</p><div className="education"><span>EDUCATION</span><strong>PG Diploma in Advanced Computing</strong><p>Brookfield Institute · 2022</p><span>BE, Civil Engineering · 2021</span></div></div><figure className="about-portrait"><div className="portrait-frame">{/* oxlint-disable-next-line nextjs/no-img-element -- vinext has no next/image; srcSet already serves 900w to 1600w */}
<picture><source type="image/avif" srcSet={PHOTO_AVIF} sizes={PHOTO_SIZES}/><img src={profile.photo} srcSet={`${profile.photo} 900w, /portrait-1200.jpg 1200w, ${profile.photoLarge} 1600w`} sizes={PHOTO_SIZES} width={900} height={1200} alt="Alex Morgan Rivera" loading="lazy" decoding="async"/></picture></div><figcaption><strong>{profile.fullName}</strong><span>{profile.role}</span></figcaption></figure><div className="experience-list"><p className="eyebrow">ENGINEERING EXPERIENCE</p>{experience.map(e=><article key={e.company}><span className="experience-date">{e.dates}</span><h3>{e.url?<a data-track-tag={`employer-${e.company.split(' ')[0].toLowerCase()}`} href={e.url} target="_blank" rel="noreferrer">{e.company}<ArrowUpRight size={16}/></a>:e.company}</h3>{e.about&&<p className="company-about">{e.about}</p>}<p className="role-label">{e.role}</p><p>{e.summary}</p></article>)}</div></section>
   <section id="skills" className="content-section skills-section" aria-labelledby="stack-heading"><div className="section-heading"><div><p className="eyebrow">MY TOOLKIT</p><h2 id="stack-heading">Across the stack<span>.</span></h2></div></div><div className="skills-grid">{skills.map((group,i)=><div key={group.name}><span className="skill-symbol">{['{ }','>_','✳','↗'][i]}</span><h3>{group.name}</h3><ul>{group.items.map(s=><li key={s}>{s}</li>)}</ul></div>)}</div></section>
   <section id="notes" className="content-section"><div className="section-heading"><div><p className="eyebrow">LEARNING IN THE OPEN</p><h2>Build. Understand. Document<span>.</span></h2></div><span className="section-note">Notes and guides</span></div><div className="learning-list">{learning.map(n=><a key={n.href} data-track-tag={`learning-${n.id}`} href={n.href} target="_blank" rel="noreferrer"><div className="note-icon"><FileText size={23}/></div><div><span className="eyebrow">{n.label}</span><h3>{n.title}</h3><p>{n.description}</p></div><ArrowUpRight/></a>)}</div></section>
   </div>
   <div className="chapter chapter-proof">
   <section id="products" className="content-section product-section"><div className="section-heading"><div><p className="eyebrow">PROFESSIONAL WORK</p><h2>What I built, and what I broke<span>.</span></h2></div></div><More kind="clamp" className="section-intro">Client and in-house products, split by what I actually did on each: development, or the quality and evaluation engineering I moved into development from.</More>
    <p className="eyebrow product-group-label">BUILT &amp; SHIPPED</p><div className="product-list">{work.filter(w=>w.group==='built').map(w=><article key={w.id}><span className="product-category">{w.category}</span><h3>{w.href?<a data-track-tag={`product-${w.id}`} href={w.href} target={w.href.startsWith('#')?undefined:'_blank'} rel={w.href.startsWith('#')?undefined:'noreferrer'}>{w.name}<ArrowUpRight size={17}/></a>:w.name}</h3><p>{w.role}</p>{w.items&&<More kind="hide" className="project-items" label={`Show ${w.items.length} ${(w.itemsLabel??'items').toLowerCase()}`}><p className="eyebrow">{w.itemsLabel}</p><ul>{w.items.map(item=><li key={item.id}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul></More>}{w.stack&&<div className="tag-list">{w.stack.map(item=><span key={item}>{item}</span>)}</div>}</article>)}</div>
    <p className="eyebrow product-group-label">QUALITY &amp; EVALUATION ENGINEERING</p><div className="product-list">{work.filter(w=>w.group==='quality').map(w=><article key={w.id}><span className="product-category">{w.category}</span><h3>{w.href?<a data-track-tag={`product-${w.id}`} href={w.href} target={w.href.startsWith('#')?undefined:'_blank'} rel={w.href.startsWith('#')?undefined:'noreferrer'}>{w.name}<ArrowUpRight size={17}/></a>:w.name}</h3><p>{w.role}</p>{w.items&&<More kind="hide" className="project-items" label={`Show ${w.items.length} ${(w.itemsLabel??'items').toLowerCase()}`}><p className="eyebrow">{w.itemsLabel}</p><ul>{w.items.map(item=><li key={item.id}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul></More>}{w.stack&&<div className="tag-list">{w.stack.map(item=><span key={item}>{item}</span>)}</div>}</article>)}</div></section>
   <section id="certifications" className="content-section certifications-section" aria-labelledby="certifications-heading">
    <div className="section-heading"><div><p className="eyebrow">CERTIFICATIONS</p><h2 id="certifications-heading">Learning, with credentials<span>.</span></h2></div><a data-track-tag="certs-linkedin" className="text-action" href={certificationSource} target="_blank" rel="noreferrer">View on LinkedIn <ArrowUpRight size={17}/></a></div>
    <p className="section-intro">Two examined credentials, and the self-directed courses behind the rest of the work.</p>
    <div className="certification-grid">{certifications.filter(c=>c.featured).map(certificate=><article key={certificate.id}><p className="eyebrow">{certificate.category}</p><h3>{certificate.name}</h3><p className="certificate-issuer">{certificate.issuer}</p>{certificate.issued&&<p className="certificate-date">Issued {certificate.issued}</p>}<div className="certificate-links"><a data-track-tag={`cert-${certificate.id}`} href={certificate.href} target="_blank" rel="noreferrer" aria-label={`${certificate.id==='istqb'?'View on LinkedIn':'View credential'}: ${certificate.name}`}>{certificate.id==='istqb'?'View on LinkedIn':'View credential'}<ArrowUpRight size={16}/></a>{certificate.notesHref&&<a data-track-tag={`cert-notes-${certificate.id}`} href={certificate.notesHref} target="_blank" rel="noreferrer" aria-label={`Read Alex's notes for ${certificate.name}`}>Read notes<ArrowUpRight size={16}/></a>}</div></article>)}</div>
    <details className="certification-more"><summary data-track-tag="certs-expand">{certifications.filter(c=>!c.featured).length} further courses completed</summary><ul className="certification-list">{certifications.filter(c=>!c.featured).map(certificate=><li key={certificate.id}><span className="certificate-name">{certificate.name}</span><span className="certificate-meta">{certificate.issuer}{certificate.issued?` · ${certificate.issued}`:''}</span><span className="certificate-links"><a data-track-tag={`cert-${certificate.id}`} href={certificate.href} target="_blank" rel="noreferrer" aria-label={`View credential: ${certificate.name}`}>Credential<ArrowUpRight size={14}/></a>{certificate.notesHref&&<a data-track-tag={`cert-notes-${certificate.id}`} href={certificate.notesHref} target="_blank" rel="noreferrer" aria-label={`Read Alex's notes for ${certificate.name}`}>Notes<ArrowUpRight size={14}/></a>}</span></li>)}</ul></details>
   </section>
   <section id="recommendations" className="content-section recommendations-section"><RecommendationRail still={still}><div className="section-heading"><div><p className="eyebrow">PEOPLE, NOT JUST PROJECTS</p><h2>Better work happens together<span>.</span></h2></div><a data-track-tag="recommendations-linkedin" className="text-action" href={recommendationSource} target="_blank" rel="noreferrer">View on LinkedIn <ArrowUpRight size={17}/></a></div><More kind="clamp" className="section-intro">{recommendations.length} recommendations on LinkedIn, from managers, colleagues who reported to Alex, and teammates across quality engineering and development. Scroll for the rest.</More></RecommendationRail></section>
   </div>
   <div className="chapter chapter-contact">
   <section id="contact" className="contact-section"><p className="eyebrow">LET’S BUILD SOMETHING USEFUL</p><h2>Good ideas deserve <br/>great execution<span>.</span></h2><a data-track-tag="contact-email" data-track-cta="contact-email" className="contact-email" href={`mailto:${profile.email}`}>Let’s start a conversation <ArrowUpRight/></a><div className="contact-links"><a data-track-tag="contact-phone" data-track-cta="contact-phone" href={`tel:${profile.phone.replace(/\s/g,'')}`}><Phone size={18}/>{profile.phone}</a><a data-track-tag="contact-github" href={profile.github} target="_blank" rel="noreferrer"><Github size={18}/>GitHub</a><a data-track-tag="contact-linkedin" href={profile.linkedin} target="_blank" rel="noreferrer"><Linkedin size={18}/>LinkedIn</a><a data-track-tag="contact-twitter" href={profile.twitter} target="_blank" rel="noreferrer"><Twitter size={18}/>X</a><a data-track-tag="contact-instagram" href={profile.instagram} target="_blank" rel="noreferrer"><Instagram size={18}/>Instagram</a><a data-track-tag="contact-pdf" data-track-cta="contact-pdf" href="/resume-sample.pdf" target="_blank" rel="noreferrer"><FileText size={18}/>Résumé</a></div></section>
   </div>
  </main>{!preview&&<Chat/>}<footer><span>© 2026 Alex Rivera</span><Link data-track-tag="footer-dashboards" href="/dashboards">Dashboards</Link><Link data-track-tag="footer-analytics" href="/analytics">Analytics</Link><Link data-track-tag="footer-privacy" href="/privacy">Privacy</Link><span>One mind. Two perspectives.</span><button data-track-tag="back-to-top" onClick={()=>window.scrollTo({top:0,behavior:still?'instant':'smooth'})}>Back to top ↑</button></footer>
 </div>
}
