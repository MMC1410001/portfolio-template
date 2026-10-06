'use client';
/** The recommendations, on the shared pinned rail (see PinnedRail.tsx). */
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { recommendations, RELATION_LABEL } from '@/content/portfolio';
import PinnedRail from './PinnedRail';

export default function RecommendationRail({still,children}:{still:boolean;children:ReactNode}) {
 return <PinnedRail still={still} label="Recommendations" trackClass="recommendation-rail" counter heading={children}>{recommendations.map(r=><article key={r.id}><span className="quote-mark" aria-hidden="true">“</span><blockquote>{r.quote}</blockquote><div className="quote-person"><span className="avatar">{r.name.split(' ').map(w=>w[0]).join('')}</span><div>{r.url?<a data-track-tag={`recommendation-${r.id}`} href={r.url} target="_blank" rel="noreferrer">{r.name}<ArrowUpRight size={15}/></a>:<strong className="recommender-name">{r.name}</strong>}<p>{r.role}</p><span className="relation-tag">{RELATION_LABEL[r.relation]}</span></div></div><details><summary data-track-tag="recommendation-expand">Read full recommendation</summary><p>{r.full}</p><span>{r.date} · {RELATION_LABEL[r.relation]} · LinkedIn</span></details></article>)}</PinnedRail>;
}
