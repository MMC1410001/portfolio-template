import type { Metadata } from 'next';
import Portfolio from '@/components/portfolio/Portfolio';
import { profile } from '@/content/portfolio';
// A plain object, so `/` stays statically rendered. The canonical sits here
// rather than in the root layout, where every child without its own would
// inherit it and point at the homepage. og:url likewise: a link preview with
// no url falls back to whatever address was shared, query string included.
// Setting openGraph here replaces the layout's whole, so it repeats the rest.
export const metadata: Metadata = {alternates:{canonical:'/'},openGraph:{type:'website',siteName:profile.name,locale:'en_IN',url:'/',images:[{url:profile.avatar,width:720,height:720,alt:profile.name}]}};
export default function Home() { return <Portfolio />; }
