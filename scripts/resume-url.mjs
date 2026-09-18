// Rewrite the site URL inside public/resume-sample.pdf.
//
//   node scripts/resume-url.mjs                       # report the URL(s) the PDF links to
//   node scripts/resume-url.mjs https://new.example   # rewrite them, in place
//
// ── Why this exists ────────────────────────────────────────────────────────
// The résumé's HTML source does not live in this repo, so the only copy of a
// link is the one baked into the PDF. When a profile URL changes, every résumé
// already in a recruiter's inbox keeps pointing at the old one, and so does
// this file, until someone re-exports it. This makes the repo's copy correct
// in one command.
//
// ── The site URL is deliberately NOT a link any more ───────────────────────
// It used to be, and this script existed mainly to rewrite it. Gmail was
// quarantining the downloaded résumé as a virus, and the two things it was
// reacting to were the headless-Chrome export fingerprint (`/Creator
// HeadlessChrome/...`, `/Producer Skia/PDF`) and a link annotation pointing at
// a `*.workers.dev` host. Both are now gone at the source: the portfolio entry
// is plain text in the HTML, and the export carries authored metadata.
//
// So this script no longer has a site link to rewrite, and it says so rather
// than reporting success. A changed site URL now needs a genuine re-export, 
// the URL lives in a compressed, Identity-H encoded content stream, which is
// not something to byte-patch. `scripts/preflight-deploy.mjs` blocks a deploy
// that reintroduces either fingerprint, because both come back for free on the
// next export from HTML and the failure lands in someone else's inbox.
//
// ── Why the padding ────────────────────────────────────────────────────────
// A PDF's cross-reference table stores a byte offset for every object. Shift
// any byte and every later offset is wrong, most readers recover, some render
// a blank page, and the failure shows up in someone else's PDF viewer rather
// than here. So the replacement is written **byte-length-preserving**: the new
// URL plus enough trailing spaces (legal whitespace inside a dictionary) to
// occupy exactly the old string's bytes. That caps this script at URLs no
// longer than the one already in the file, which is the direction it is for.
// A longer URL needs a genuine re-print, and the script says so rather than
// silently corrupting the offsets.
import { readFileSync, writeFileSync } from 'node:fs';

const PDF = new URL('../public/resume-sample.pdf', import.meta.url);
const next = process.argv[2];

const pdf = readFileSync(PDF);
// Link annotations are stored uncompressed in this file, so a byte scan finds
// them. `[^)]` is safe here: a URL cannot contain an unescaped ')'.
const URI = /\/URI\s*\(([^)]*)\)/g;
const found = [...pdf.toString('latin1').matchAll(URI)];
if (!found.length) {
 console.error('No /URI link annotations found, the PDF may be compressed differently. Re-print it instead.');
 process.exit(1);
}
if (!next) {
 for (const [, url] of found) console.log(url);
 console.log(`\n${found.length} link(s). Pass a replacement URL to rewrite them.`);
 process.exit(0);
}
try { new URL(next); } catch { console.error(`Not a URL: ${next}`); process.exit(1); }

let text = pdf.toString('latin1');
let changed = 0;
text = text.replace(URI, (whole, url) => {
 if (!url.includes('workers.dev') && !url.startsWith(next)) return whole; // leave GitHub, LinkedIn, mailto alone
 const replacement = `/URI (${next})`;
 if (replacement.length > whole.length) {
  console.error(`Cannot fit ${next} (${replacement.length}b) into ${whole.length}b without moving every later byte.\nThe new URL must be no longer than the old one. Re-print the résumé instead.`);
  process.exit(1);
 }
 changed++;
 return replacement.padEnd(whole.length, ' ');
});
if (!changed) { console.log('Nothing to rewrite, the site URL is plain text in this PDF, by design.\nA changed site URL needs a re-export from the HTML source; see the header of this file.'); process.exit(0); }
const out = Buffer.from(text, 'latin1');
if (out.length !== pdf.length) { console.error('Refusing to write: byte length changed.'); process.exit(1); }
writeFileSync(PDF, out);
console.log(`Rewrote ${changed} link(s) to ${next}. Verify with: node scripts/resume-url.mjs`);
