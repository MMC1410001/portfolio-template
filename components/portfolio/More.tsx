'use client';
/**
 * Phone-only "Read more". The text is always in the DOM and the toggle is
 * always rendered; app/globals.css clamps or hides it, and shows the button,
 * only under 701px, so wide layouts and the server render are unchanged.
 *
 * - `clamp`: a paragraph cut to three lines.
 * - `hide`: a block (a product's sub-list) folded away behind a labelled button.
 */
import { useState, type ReactNode } from 'react';

type Props={kind:'clamp'|'hide';className?:string;label?:string;children:ReactNode};

export default function More({kind,className='',label='Read more',children}:Props) {
 const [open,setOpen]=useState(false);
 const body=kind==='clamp'?<p className={`more-${kind} ${className}`} data-open={open||undefined}>{children}</p>:<div className={`more-${kind} ${className}`} data-open={open||undefined}>{children}</div>;
 return <>{body}<button type="button" className="more-toggle" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{open?'Show less':label}</button></>;
}
