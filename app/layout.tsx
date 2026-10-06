import type { Metadata } from 'next';
import { Space_Grotesk, Manrope, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import AnalyticsProvider from '@/components/analytics/AnalyticsProvider';
import { profile } from '@/content/portfolio';
const display=Space_Grotesk({variable:'--font-display',subsets:['latin']});
const body=Manrope({variable:'--font-body',subsets:['latin']});
const mono=IBM_Plex_Mono({variable:'--font-code',subsets:['latin'],weight:['400','500']});
export const metadata: Metadata = {title:'Alex Rivera, AI Full Stack Developer',description:'AI agents, retrieval systems, Python backends, and thoughtful interfaces. Explore the work of Alex Rivera, an AI Full Stack Developer in Austin.',metadataBase:new URL('https://portfolio-template.example.workers.dev'),
 // Shared by every route. No url, title or description here on purpose: a
 // child that sets none inherits this object whole, and /privacy would then
 // announce itself as the homepage. Title and description are filled per page
 // from its own metadata; canonical lives on each page for the same reason.
 // A page that sets its own openGraph replaces this one, images included, so
 // app/dashboards repeats the image. The square avatar is the one existing
 // image that crops cleanly into both a summary card and a link preview.
 openGraph:{type:'website',siteName:profile.name,locale:'en_IN',images:[{url:profile.avatar,width:720,height:720,alt:profile.name}]},
 twitter:{card:'summary'},
 // public/favicon.svg existed and nothing linked it, so browsers fell back to
 // requesting /favicon.ico, which does not exist.
 icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}<AnalyticsProvider/></body></html>}
