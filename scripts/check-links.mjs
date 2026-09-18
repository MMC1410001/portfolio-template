/**
 * Check that every external link in content/portfolio.ts is reachable by a
 * stranger.
 *
 *   npm run check:links
 *
 * ── The bug this exists to catch ───────────────────────────────────────────
 * A Google Doc linked from the portfolio was set to "Restricted", so a visitor
 * clicking "Additional study notes" got a sign-in wall. Nothing in the repo
 * could detect it: the URL is well-formed, the build passes, the chatbot
 * answers about it happily. The only symptom is a recruiter hitting a login
 * page, and they do not file bug reports.
 *
 * ── Why this is host-aware instead of "non-200 means broken" ───────────────
 * That naive rule was measured against the real link set and produced **9
 * false positives out of 25**, which is worse than no check at all, a gate
 * that cries wolf gets disabled, and then the real breakage ships.
 *
 * What the measurements showed:
 *
 *   udemy.com, ude.my   403 behind Cloudflare's "Just a moment..." challenge.
 *   meridian.example        403 with cf-mitigated: challenge, to every user agent.
 *                       A REAL certificate and a deliberately FAKE one both
 *                       return 403 with ~5.8 KB, so fetching cannot tell a
 *                       valid certificate from an invented one. Unverifiable.
 *
 *   coursera.org        200 for both a real and a fake verification code, 
 *                       the page is client-rendered, so the server says
 *                       nothing about validity. Unverifiable.
 *
 *   linkedin.com        HTTP 999, LinkedIn's anti-scraping response, and
 *                       inconsistently: one profile returned 200 and two
 *                       returned 999 in the same run. Unverifiable.
 *
 *   x.com               200 for a real handle and for an invented one, with
 *                       only the byte count differing, the profile is
 *                       client-rendered. Unverifiable.
 *
 *   instagram.com       200 for a real handle and for an invented one, both
 *                       are the same login wall. Unverifiable.
 *
 *   docs.google.com     Genuinely verifiable. A restricted doc returns 401;
 *                       a public one returns 200 with the editor's DOM
 *                       markers. This is the host that actually broke.
 *
 * So links fall into two buckets. **Verifiable** hosts are fetched and can
 * fail the run. **Unverifiable** hosts get their URL *shape* checked, a
 * typo'd certificate id is still catchable, and are reported as unverified
 * rather than quietly passed. Reporting them as "ok" would be a lie, and it is
 * the lie that matters: it would imply the certificate links had been checked.
 *
 * ── One trap worth recording ───────────────────────────────────────────────
 * Do NOT classify a Google Doc by searching its body for "Sign in". Public
 * docs contain that string too, in Google's own header. The first version of
 * this check did exactly that and reported two public documents as restricted.
 * Status code plus editor DOM markers is the reliable signal.
 */

const SOURCE = 'content/portfolio.ts';

/** A real browser UA. Several of these hosts serve nothing useful without one. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIMEOUT_MS = 25_000;
const ATTEMPTS = 3;
/** Polite, and enough to avoid tripping the rate limiting that made LinkedIn flap. */
const CONCURRENCY = 4;

/**
 * Hosts that cannot be verified by fetching, with the shape their URLs must
 * have. `null` means there is nothing structural worth asserting.
 */
const UNVERIFIABLE = [
  {
    host: 'www.udemy.com',
    why: 'Cloudflare challenge, a fake certificate id returns the same 403',
    shape: /^https:\/\/www\.udemy\.com\/certificate\/UC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/,
  },
  {
    host: 'ude.my',
    why: 'Cloudflare challenge, same as udemy.com',
    shape: /^https:\/\/ude\.my\/UC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  },
  {
    host: 'meridian.example',
    why: 'Cloudflare challenge, 403 with cf-mitigated: challenge to any client',
    shape: /^https:\/\/smart\.stream\/?$/,
  },
  {
    host: 'coursera.org',
    why: 'client-rendered, a fake verification code also returns 200',
    shape: /^https:\/\/coursera\.org\/verify\/[A-Z0-9]{8,20}$/,
  },
  {
    host: 'x.com',
    why: 'client-rendered, an invented handle also returns 200',
    // X handles are 1-15 of [A-Za-z0-9_]; anything else is a typo, not a profile.
    shape: /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/,
  },
  {
    host: 'www.instagram.com',
    why: 'login wall, an invented handle returns the same 200',
    // Instagram handles are 1-30 of [A-Za-z0-9._]; the trailing slash is canonical.
    shape: /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/,
  },
  {
    host: 'www.linkedin.com',
    why: 'HTTP 999 anti-scraping, and inconsistent between runs',
    // Sub-paths allowed. The first version ended the pattern at the profile
    // slug and rejected `certificationSource`, which is a real LinkedIn URL:
    // `/in/<slug>/details/certifications/`. A shape check that fails valid
    // input is the false-positive problem this script was written to avoid.
    shape: /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)*\/?$/,
  },
];

const unverifiableFor = (url) => {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  return UNVERIFIABLE.find((entry) => entry.host === host) ?? null;
};

/* ─────────────────────────── extraction ─────────────────────────── */

/**
 * Import the content module and walk the real values.
 *
 * ── Why not a regex over the source ────────────────────────────────────────
 * The first version matched `href:'https://…'` and `notesHref:'…'`, and missed
 * five links, a quarter of them, including the two that matter most.
 *
 *   `github:` and `linkedin:` on `profile` are different field names, so the
 *   site's own GitHub and LinkedIn links went unchecked.
 *
 *   `url:` on the two recommendations, likewise.
 *
 *   Worse, the three project-guide links are **template literals**, 
 *   `` href:`${profile.github}/mcp-rag-server#readme` ``: so no pattern
 *   looking for a quoted `https://` can ever see them. Those point at
 *   repositories that could be renamed or made private, which is exactly the
 *   silent breakage this script exists to catch.
 *
 * Importing evaluates the interpolation and yields whatever field names exist
 * today or are added later, so the check cannot drift from the content. This
 * is why the npm script runs it with the type-stripping loader.
 */
async function collectLinks() {
  const content = await import('../content/portfolio.ts');
  const found = new Map();

  const record = (url, path) => {
    const existing = found.get(url);
    if (existing) existing.fields.add(path);
    else found.set(url, { url, fields: new Set([path]) });
  };

  /** Depth-first, tracking the path so a failure names something findable. */
  const walk = (value, path) => {
    if (typeof value === 'string') {
      if (/^https?:\/\//.test(value)) record(value, path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        // Prefer the entry's own id over a bare index, `certifications[4]`
        // stops being right the moment the array is reordered.
        const label =
          item && typeof item === 'object' && 'id' in item
            ? String(item.id)
            : String(i);
        walk(item, `${path}[${label}]`);
      });
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    }
  };

  for (const [name, exported] of Object.entries(content)) walk(exported, name);
  return [...found.values()];
}

/* ─────────────────────────── fetching ─────────────────────────── */

async function fetchOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
    });
    // Read at most a slice: one of these documents is 22 MB, and the markers
    // that matter are in the first few hundred KB of markup.
    const body = (await response.text()).slice(0, 400_000);
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retried, because one document returned no response at all on its first
 * attempt and 200 on its second. A transient timeout that blocks a deploy is
 * exactly the flakiness that gets a check switched off.
 */
async function fetchWithRetries(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await fetchOnce(url);
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1_200 * attempt));
      }
    }
  }
  return { status: 0, body: '', error: lastError };
}

/* ─────────────────────────── classification ─────────────────────────── */

const DOC_MARKERS = ['kix-appview', 'editor-container', 'docs-title-input'];

async function classify(link) {
  const unverifiable = unverifiableFor(link.url);
  if (unverifiable) {
    const shapeOk = !unverifiable.shape || unverifiable.shape.test(link.url);
    return shapeOk
      ? { level: 'unverified', note: unverifiable.why }
      : {
          level: 'fail',
          note:
            `URL does not match the expected shape for ${unverifiable.host}. ` +
            `This host cannot be fetched (${unverifiable.why}), so the shape ` +
            `is the only check available, and a malformed id will 404 for ` +
            `every visitor.`,
        };
  }

  const { status, body } = await fetchWithRetries(link.url);

  if (status === 0) {
    // Not a failure. Unreachable from here is usually the network, and a
    // deploy should not be blocked by someone's flaky wifi or a CI runner
    // being rate limited.
    return { level: 'unreachable', note: `no response after ${ATTEMPTS} attempts` };
  }

  if (link.url.includes('docs.google.com')) {
    if (status === 401) {
      return {
        level: 'fail',
        note:
          'HTTP 401, the document is Restricted. A visitor gets a sign-in ' +
          'wall. Fix: Share -> General access -> "Anyone with the link", ' +
          'role Viewer.',
      };
    }
    // 403 is NOT treated as restricted. The real restricted document returned
    // 401; a 403 from Google is more often abuse/rate limiting, which a CI
    // runner sharing an IP with the world is far likelier to hit than a
    // developer's laptop. Failing a deploy on it would be the false positive
    // this script exists to avoid, so it warns and lets the deploy through.
    if (status === 403) {
      return {
        level: 'warn',
        note:
          'HTTP 403, most likely rate limiting rather than a permission ' +
          'problem (a Restricted document answers 401). Re-run, or open it ' +
          'in a private window to be sure.',
      };
    }
    if (status !== 200) {
      return { level: 'fail', note: `HTTP ${status}` };
    }
    // 200 alone is not enough: Google serves 200 for some interstitials.
    const hasDoc = DOC_MARKERS.some((marker) => body.includes(marker));
    return hasDoc
      ? { level: 'ok', note: 'public' }
      : {
          level: 'warn',
          note:
            '200 but no editor markup in the response. Possibly an ' +
            'interstitial rather than the document. Open it in a private ' +
            'window to confirm.',
        };
  }

  if (status >= 200 && status < 400) return { level: 'ok', note: `HTTP ${status}` };
  return { level: 'fail', note: `HTTP ${status}` };
}

/* ─────────────────────────── run ─────────────────────────── */

async function mapLimit(items, limit, worker) {
  const results = Array.from({ length: items.length });
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

const links = await collectLinks();
process.stdout.write(`Checking ${links.length} external links in ${SOURCE}\n\n`);

const verdicts = await mapLimit(links, CONCURRENCY, async (link) => ({
  link,
  ...(await classify(link)),
}));

const ICON = {
  ok: '  ok  ',
  unverified: ' skip ',
  unreachable: ' warn ',
  warn: ' warn ',
  fail: ' FAIL ',
};
const ORDER = ['fail', 'warn', 'unreachable', 'unverified', 'ok'];
verdicts.sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));

for (const verdict of verdicts) {
  const where = [...verdict.link.fields].join(', ');
  process.stdout.write(
    `${ICON[verdict.level]} ${where}\n         ${verdict.link.url}\n` +
      `         ${verdict.note}\n`,
  );
}

const counts = Object.fromEntries(
  ORDER.map((level) => [level, verdicts.filter((v) => v.level === level).length]),
);
process.stdout.write(
  `\n${counts.ok} ok, ${counts.unverified} unverifiable by design, ` +
    `${counts.unreachable} unreachable, ${counts.warn} suspicious, ` +
    `${counts.fail} failed\n`,
);

if (counts.fail > 0) {
  process.stderr.write(
    `\n${counts.fail} link(s) are broken for visitors. See above.\n`,
  );
  process.exit(1);
}

if (counts.unverified > 0) {
  process.stdout.write(
    `\nThe ${counts.unverified} skipped links sit behind bot protection and ` +
      `cannot be verified by fetching, only their URL shape was checked. ` +
      `Open them in a private window now and then.\n`,
  );
}
