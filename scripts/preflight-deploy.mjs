/**
 * Refuse to deploy a configuration that would come up broken.
 *
 *   npm run deploy   ->   this, then build, then wrangler deploy
 *
 * ── Why a preflight rather than letting wrangler fail ──────────────────────
 * Most of what can go wrong here does NOT fail the deploy. It deploys fine and
 * the site comes up *looking* correct:
 *
 *   - a placeholder `database_id` deploys, and every analytics write is then
 *     refused at runtime while the public pages serve normally
 *   - a missing ANALYTICS_IP_SALT deploys, and ingest refuses every write with
 *     one console line nobody is watching
 *   - TRUST_PLATFORM_AUTH_HEADER left set on a host that does not strip the
 *     header deploys, and hands the dashboard to anyone who reads the contact
 *     section
 *
 * A silent half-working deploy is worse than a failed one, so these are
 * checked before anything is uploaded.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER_DB_ID = '00000000-0000-4000-8000-000000000000';

const problems = [];
const warnings = [];

/* ── 1. wrangler.jsonc must name a real database ─────────────────────────── */

let wrangler = '';
try {
  wrangler = readFileSync(resolve(ROOT, 'wrangler.jsonc'), 'utf8');
} catch {
  problems.push(
    'wrangler.jsonc is missing. It declares the Worker name, the D1 binding ' +
      'and the compatibility date.',
  );
}

if (wrangler.includes(PLACEHOLDER_DB_ID)) {
  problems.push(
    'wrangler.jsonc still has the placeholder database_id.\n' +
      '      Run:  wrangler d1 create portfolio-analytics\n' +
      '      then paste the returned database_id into wrangler.jsonc.\n' +
      '      Deploying as-is would serve the site with analytics that refuse ' +
      'every write.',
  );
}

if (!/"binding"\s*:\s*"ANALYTICS_DB"/.test(wrangler)) {
  problems.push(
    'wrangler.jsonc does not declare a D1 binding named ANALYTICS_DB. ' +
      'lib/analytics/db.ts looks it up by that exact name.',
  );
}

/* ── 2. Secrets that must exist on the remote Worker ─────────────────────── */

/**
 * `wrangler secret list` is the only way to know, and it needs auth. A
 * failure here is reported as a warning rather than a block: it usually means
 * "not logged in yet", and refusing to deploy over an unrelated auth problem
 * would be its own annoyance.
 */
let remoteSecrets = null;
try {
  const raw = execFileSync(
    'npx',
    ['--no-install', 'wrangler', 'secret', 'list', '--config', 'wrangler.jsonc'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  remoteSecrets = new Set(
    (JSON.parse(raw) ?? []).map((entry) => entry.name ?? ''),
  );
} catch {
  warnings.push(
    'Could not read the Worker\'s secret list (not logged in, or the Worker ' +
      'does not exist yet). Skipping the secret check, verify by hand that ' +
      'ANALYTICS_IP_SALT and ADMIN_TOKEN are set.',
  );
}

if (remoteSecrets) {
  for (const name of ['ANALYTICS_IP_SALT', 'ADMIN_TOKEN']) {
    if (!remoteSecrets.has(name)) {
      problems.push(
        `${name} is not set on the Worker.  wrangler secret put ${name}\n` +
          (name === 'ANALYTICS_IP_SALT'
            ? '      Without it /api/track refuses every write: an unsalted ' +
              'hash of the IPv4 space is trivially reversible, so ingest ' +
              'degrades loudly rather than storing a weak identifier.'
            : '      Without it /admin has no way in at all, since the email ' +
              'allowlist is inert unless TRUST_PLATFORM_AUTH_HEADER is set.'),
      );
    }
  }
}

/* ── 3. The header-trust flag must not be set for a Cloudflare origin ────── */

/**
 * Checked because this one is a privilege escalation rather than an outage.
 * `TRUST_PLATFORM_AUTH_HEADER` tells the admin gate to believe an
 * `oai-authenticated-user-email` request header, which is only safe behind an
 * ingress that strips inbound copies. Cloudflare does not, and the
 * allowlisted address is printed on the site's own contact section.
 */
if (/"TRUST_PLATFORM_AUTH_HEADER"/.test(wrangler)) {
  problems.push(
    'wrangler.jsonc sets TRUST_PLATFORM_AUTH_HEADER. On a Cloudflare origin ' +
      'nothing strips inbound oai-authenticated-user-* headers, so this makes ' +
      'the admin dashboard readable by anyone who sends the owner\'s email, ' +
      'which the site publishes in its contact section. Remove it.',
  );
}

if (remoteSecrets?.has('TRUST_PLATFORM_AUTH_HEADER')) {
  problems.push(
    'TRUST_PLATFORM_AUTH_HEADER is set as a Worker secret. See above, ' +
      'remove it with:  wrangler secret delete TRUST_PLATFORM_AUTH_HEADER',
  );
}

/* ── 4. The résumé PDF must not carry a quarantinable export ─────────────── */

/**
 * Gmail was flagging the résumé downloaded from this site as a virus.
 *
 * Two properties of the export were doing it: the headless-Chrome fingerprint
 * the printer leaves in the document info dictionary (`/Creator
 * HeadlessChrome/...`, `/Producer Skia/PDF`), and a link annotation pointing
 * at a `*.workers.dev` host. Both were fixed at the source, the portfolio
 * entry is plain text in the HTML now, and the export carries authored
 * metadata, and both come back for free the next time the résumé is
 * re-exported from that HTML.
 *
 * This deploys perfectly and the file downloads fine from here. The failure
 * happens in a recruiter's inbox, weeks later, and nobody reports it. So it is
 * checked before anything is uploaded, like everything else in this file.
 */

let resume = '';
try {
  resume = readFileSync(resolve(ROOT, 'public/resume-sample.pdf'), 'latin1');
} catch {
  problems.push(
    'public/resume-sample.pdf is missing. The résumé download and the ' +
      "chatbot's résumé answer both link to it.",
  );
}

const fingerprint = /\/(?:Creator|Producer)\s*\(([^)]*(?:HeadlessChrome|Skia)[^)]*)\)/.exec(resume);
if (fingerprint) {
  problems.push(
    'public/resume-sample.pdf carries the headless-Chrome export ' +
      `fingerprint:\n        ${fingerprint[1]}\n` +
      '      Gmail quarantines the download as a virus on the strength of it. ' +
      "Set the document's own /Creator and /Producer when you export, or strip " +
      'them from this copy, and re-check with:\n' +
      '        strings public/resume-sample.pdf | grep -i "HeadlessChrome\\|Skia"',
  );
}

if (/\/URI\s*\([^)]*workers\.dev[^)]*\)/.test(resume)) {
  problems.push(
    'public/resume-sample.pdf links the site URL as a *.workers.dev ' +
      'link annotation. That was the other half of the Gmail virus flag. Drop ' +
      'the <a href> around the portfolio entry in the HTML source and leave the ' +
      'URL as text, then re-export. See scripts/resume-url.mjs.',
  );
}

/* ── report ──────────────────────────────────────────────────────────────── */

for (const warning of warnings) {
  process.stdout.write(`  warn  ${warning}\n`);
}

if (problems.length > 0) {
  process.stderr.write(
    `\nDeploy blocked by ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n\n`,
  );
  for (const problem of problems) {
    process.stderr.write(`  x  ${problem}\n\n`);
  }
  process.stderr.write(
    'See wrangler.jsonc for the first-deploy checklist.\n\n',
  );
  process.exit(1);
}

process.stdout.write('  ok    preflight passed\n');
