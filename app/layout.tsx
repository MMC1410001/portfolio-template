import type { Metadata } from 'next';
import { Space_Grotesk, Manrope, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import AnalyticsProvider from '@/components/analytics/AnalyticsProvider';
const display=Space_Grotesk({variable:'--font-display',subsets:['latin']});
const body=Manrope({variable:'--font-body',subsets:['latin']});
const mono=IBM_Plex_Mono({variable:'--font-code',subsets:['latin'],weight:['400','500']});
export const metadata: Metadata = {title:'Alex Rivera, AI Full Stack Developer',description:'AI agents, retrieval systems, Python backends, and thoughtful interfaces. Explore the work of Alex Rivera, an AI Full Stack Developer in Austin.',metadataBase:new URL('https://portfolio-template.mmcexampledevportfolio.workers.dev')};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}<AnalyticsProvider/></body></html>}
