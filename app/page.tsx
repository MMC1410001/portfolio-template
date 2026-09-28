import type { Metadata } from 'next';
import Portfolio from '@/components/portfolio/Portfolio';
// A plain object, so `/` stays statically rendered. The canonical sits here
// rather than in the root layout, where every child without its own would
// inherit it and point at the homepage.
export const metadata: Metadata = {alternates:{canonical:'/'}};
export default function Home() { return <Portfolio />; }
