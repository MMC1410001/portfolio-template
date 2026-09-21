# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev            # vinext dev server on http://localhost:3000
npm run typecheck      # tsc --noEmit, the real gate
npm run build          # prebuild (knowledge sync) + vinext build -> dist/
npm run start          # wrangler dev --config dist/server/wrangler.json (build first)
npm test               # units + chat + analytics
npm run test:units     # pure-logic checks, no server needed
npm run test:chat      # needs `npm run dev` in another terminal
npm run test:analytics # ditto, plus ADMIN_TOKEN set
npm run emit:migration # regenerate migrations/ and drizzle/ from schema.ts
npm run seed:demo      # regenerate content/analytics-demo.json for /analytics
npm run preflight      # check a deploy would not come up half-broken
npm run deploy         # preflight + build + wrangler deploy
npm run db:migrate     # apply migrations/ to the remote D1 (--remote)
npm run check:links    # every external link in content/portfolio.ts, anonymously
npm run lint           # oxlint. See the warning below
```

Python (optional FastAPI service):

```sh
python3 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
.venv/bin/python -m unittest tests.test_backend.PortfolioGuideTests.test_auth   # single test
```

`tests/chat.mjs` and `tests/analytics.mjs` have no case filter, they replay everything against a
live server and throw on the first mismatch. Point them elsewhere with `TEST_BASE_URL`. To exercise
a single question, curl `/api/chat` directly.

`npm run test:units` runs `node --experimental-strip-types` with a 20-line resolver hook
(`tests/ts-hooks.mjs`) mapping extensionless and `@/` imports onto real files. That is why
`lib/analytics/normalise.ts`, `lib/analytics/section-catalogue.ts`,
`components/admin/analytics-format.ts` and `components/admin/table-sort.ts` are forbidden from
referencing the DOM, a bare Node process has to be able to import them.

Run `node scripts/sync-knowledge.mjs` after editing `content/*.ts` if you are testing FastAPI
without a full build.

### `npm run lint` does not pass, and never did

`oxlint` reports a dozen pre-existing errors in `components/ui/*` (generated shadcn output) and
`hooks/use-mobile.ts`: `react-compiler`, `jsx-a11y/prefer-tag-over-role`,
`restrict-template-expressions`. A clean lint is not a gate you can hold new work to. **Lint the
paths you touched:**

```sh
npx oxlint lib/analytics components/admin
```

`react/react-compiler` is set to error and is strict about two things worth knowing before you fight
it: `setState` inside an effect, and any impure call (`Date.now`, `performance.now`) lexically
inside a component body, even in a nested handler it cannot prove is event-only. The established
answers here are `useSyncExternalStore` for anything read from storage, a media query or the clock
(`hooks/use-stored.ts`, `hooks/use-ist-today.ts`), and "compare a derived key during render" for a
reset (`ClickHeatmap`).

### Do not run `npm run format` casually

`oxfmt` defaults to `--write` and disagrees with this codebase's hand-authored style. It would
rewrite **every** file outside `components/ui/`: `Portfolio.tsx`, `faq.ts`, `route.ts`, the README,
even `chat-cases.json`. Check first with `npx oxfmt --list-different`, and prefer formatting only a
path you actually authored.

## Architecture

### This is not Next.js

There is no `next` package in `node_modules`. The framework is **vinext** (`vinext@1.0.0-beta.9`), a
Next.js App Router reimplementation on Vite. `next/*` imports (`next/font/google`, `Metadata`)
resolve through vinext shims, and `next-env.d.ts` pulls types from `vinext/types`.

- **`vite.config.ts` is the real build config**, `vinext()` + `sites()` + `cloudflare()` plugins.
- **`next.config.ts` carries the security response headers**, and is no longer inert. vinext resolves
  `config.headers()` and applies the matched rules in `server/config-headers.js`, so this is the only
  place that can set a header on the HTML documents as well as the API routes. Its matcher does not
  treat `/:path*` as covering the bare root, so the rule list names both `/` and `/:path*`. Drop the
  first and the homepage silently loses every header while the other routes keep them. The CSP is
  production-only because a `connect-src 'self'` would break Vite's HMR websocket in dev.
- `.next/` holds only vinext-generated route typings; it is not a Next build. `.vinext/` is the dev
  cache and downloaded Google Font files.

Adding a route regenerates `.next/types/routes.d.ts`, so `npm run typecheck` is the gate on route changes.

### Deploy target: Cloudflare Workers

`npm run build` emits `dist/server/` (Worker bundle + a generated
`wrangler.json`) and `dist/client/` (static assets). `npm run deploy` runs a
preflight, builds, and `wrangler deploy`s that output. `npm run db:migrate`
applies `migrations/` to the remote D1.

**`wrangler.jsonc` at the repo root is the source of truth** for the Worker
name, compatibility date, the `nodejs_compat` flag and the `ANALYTICS_DB` D1
binding. `@cloudflare/vite-plugin` reads it via `configPath` and rewrites the
paths into `dist/server/wrangler.json`; every `wrangler` subcommand reads the
same file. Bindings used to be declared inline in `vite.config.ts` with the
name taken from `.openai/hosting.json`.

**`database_id` is a placeholder until you create the database.** Local
`wrangler dev` and `vite dev` ignore it (Miniflare keys its SQLite off the
binding name), so a wrong value fails only at deploy, which is why
`scripts/preflight-deploy.mjs` blocks on it. That script also blocks a missing
`ANALYTICS_IP_SALT`/`ADMIN_TOKEN` and a set `TRUST_PLATFORM_AUTH_HEADER`,
because each of those *deploys successfully* and then misbehaves quietly.

Setting `"d1"` to `null` in `.openai/hosting.json`, or removing the binding
from `wrangler.jsonc`, removes the database entirely, which the analytics code
treats as a valid degraded state (ingest refuses politely, the dashboard says
"storage not configured") rather than an error.

#### OpenAI Sites is still supported, by the presence of one file

`.openai/hosting.json` is the switch, and there is no flag to remember:

- **present**, `vite.config.ts` loads `@openai/sites-vite-plugin`, so Sites
  deploys keep working. It is read at runtime, not `import`ed, because a static
  import of a file that may not exist is a build error rather than a graceful
  absence.
- **deleted**, the plugin is skipped and the repo is pure Cloudflare.

If it names a different D1 binding than `wrangler.jsonc`, the build warns: the
two hosts would otherwise talk to different databases, silently, in production
only.

**On Sites you must set `TRUST_PLATFORM_AUTH_HEADER=1`** in the runtime config,
or `/admin` falls back to token-only there. See the Analytics section.

### Routes

`app/page.tsx` → `components/portfolio/Portfolio.tsx` is the entire public site. `#hero`, `#work`,
`#northwind-erp`, `#about`, `#skills`, `#certifications`, `#notes`, `#products`, `#recommendations`
and `#contact` are in-page anchors, not routes. `#additional-projects` was folded into `#products`
and survives only in `RETIRED_LABELS` in `lib/analytics/section-catalogue.ts`, so historical event
rows still render with a name. Alongside it:

| Route | What |
| --- | --- |
| `POST /api/chat` | the chatbot |
| `POST /api/track` | analytics ingest, public and unauthenticated by design |
| `POST /api/admin/analytics` | the gated read API, one action switch |
| `POST /api/admin/session` | admin token → cookie |
| `/admin` | the dashboard (dynamic) |
| `/privacy` | the disclosure, with a working opt-out |
| `/analytics` | public showcase of the dashboard, on synthetic data (static) |

`/` must stay **statically rendered**. Several choices in the analytics code exist only to protect
that, notably reading the heatmap preview flag from `window.location` rather than via
`useSearchParams()` or the server `searchParams` prop, either of which would make the public
homepage dynamic to serve an admin-only feature.

`Portfolio.tsx` runs a mode machine (`'resume' | 'transitioning' | 'immersive'`) that reveals the
3D view when the visitor clicks **Experience mode** or has been on the page for
`REVEAL_CONFIG.revealSeconds` (3s): time on the page, not idle time, so reading and scrolling do
not postpone it; only a hidden tab pauses the clock.
Two side effects matter when touching it:

- it toggles `.dark` on `<html>` for the lifetime of immersive mode, which is the **only** thing that
  activates dark mode on this site (there is no theme toggle and no `next-themes`);
- the 850ms `'transitioning'` state mounts `TransformBurst.tsx`: the flash, shockwave, aura column
  and lightning arcs of the reveal. It is *mounted* rather than class-toggled because that is what
  restarts its animations on a second reveal, and it is skipped entirely under `still` (reduced
  motion or heatmap preview);
- `prefers-reduced-motion` skips the transition and disables autoplay.

`ImmersiveSystem.tsx` → `FigureTurntable.tsx` are `lazy()`-loaded, so neither the rig nor the
772KB of frames it pulls touches the initial bundle. **The immersive view is a scroll-driven photo
turntable, not a 3D scene**, three.js, `@react-three/fiber` and `SystemScene.tsx` are gone, and
with them the quality select, the pause button and the WebGL2 probe: a sequence that only moves
when the visitor scrolls has no running animation to pause and no GPU to fall back from.

- `public/turntable/f-00..21.avif` are 22 stills of one seated pose around a full circle, cut out
  and normalised by `scripts/turntable-frames.swift` (macOS-only: Vision for the matte and the
  person measurement, ImageIO for AVIF; source sheet in `assets/`). **Never hand-edit them**, 
  re-run the script, whose header carries the exact invocation and the reasoning. Frame
  *registration* is the whole game: frames are scaled by the subject's upper-body height and
  anchored on the body-pose neck joint, because normalising the whole silhouette instead makes the
  figure grow and shrink (a rear view's silhouette is mostly chair, a front view's mostly desk).
- Scroll is wired with GSAP ScrollTrigger. On wide viewports `.system-stage` is `position:sticky`
  inside `.stage-column` and `.stage-runway` supplies a viewport of scroll distance, so the turn
  completes while the figure is held in view; narrow viewports have no runway and the turn fills
  the figure's pass through the viewport instead. `FigureTurntable` picks the range by *measuring*
  the runway, and `LIGHT_QUERY`'s 1050px matches the CSS breakpoint on purpose, the frame count
  is an effect dependency, so a resize across the boundary rebuilds the trigger.
- Reduced motion and the heatmap preview resolve to frame 0 and register nothing.

### Content is generated into Python, one source of truth

```
content/portfolio.ts  ──> content/faq.ts ──> scripts/sync-knowledge.mjs ──> backend/knowledge.json
    (facts)                (answers +        (prebuild hook, transpiles      (read by FastAPI)
                            regex guards)     both via the TS compiler API)
```

`content/faq.ts` derives most of its `answers` array *from* `content/portfolio.ts` (certifications,
products and their sub-products, private work, ERP workflows), so most content edits belong in
`portfolio.ts` alone. A `work` entry answers for itself only if it carries both `aliases` and a
`description`; sub-product answers are emitted **before** their parent's, because the first pattern
match wins and `halcyon`/`halcyon` belong to the parent. **Never hand-edit `backend/knowledge.json`**. It is regenerated by `prebuild`.

The four regex guards (`sensitive`, `abuse`, `unknown`, `offTopic`) are authored as strings in
`content/faq.ts` and re-executed in Python via `knowledge.json`. Changing a guard therefore needs a
sync + both test suites. `answerQuestion()` evaluates them in a fixed order, 
sensitive → abuse → unknown → offTopic → greeting → pattern match → "not documented", and that
order is load-bearing: `sensitive` must win over `abuse` so a credentials question gets the safety
boundary rather than the generic deflection.

### Chat answers degrade in four tiers

1. **Browser**, `Chat.tsx` calls `/api/chat`, and on *any* failure (non-OK, 8.5s timeout) runs
   `answerQuestion()` locally and labels the source `'Offline · from the portfolio'`. The chatbot
   works with the Worker down. It also means some questions never reach the server.
2. **Worker**, `app/api/chat/route.ts` computes `answerQuestion()` first, then only consults the
   Python service when a documented answer already matched (`source === 'From the portfolio'`).
   Any backend error is swallowed and the local answer is returned.
3. **NVIDIA NIM, from the Worker itself** (`lib/chat/nim.ts`). Set `NIM_API_KEY` and the Worker
   asks a model which documented answer fits, with no second deployment. It is consulted for
   exactly the opposite class of question to the FastAPI tier: **only the ones no pattern
   matched** (`Answer.unmatched`). The union of both was tried and `npm run test:chat` failed
   inside one run, the model preferred the company answer over the experience answer for "What did
   he do at Northwind?", and both are approved prose, so nothing was false and the reply was simply
   worse. The patterns in `content/faq.ts` are tuned against `tests/chat-cases.json`; a model
   overruling a match it did not need to make can only regress. Defaults to `openai/gpt-oss-20b`
   (~1s); most other models on `integrate.api.nvidia.com` 404 per-account or cold start past the
   6s timeout, so confirm a `NIM_MODEL` override against your own key.
4. **FastAPI + Gemini**, `backend/main.py`. Optional, and it needs a Python host of its own.
   Gemini receives the approved answer set as data and may only return an `answer_id`; the served
   prose is always looked up from that set.

The id-only rule in tiers 3 and 4 is a safety invariant, not an optimization: **the model never
authors portfolio prose.** Preserve it in both. `Answer.unmatched` in `content/faq.ts` exists
only to keep tier 3 honest: `guard.unknown` (salary, CTC) and the final no-match fallback both
answer with the source `'Not documented'`, so the source string cannot tell a refusal from a
miss, and only the miss may reach a model. `/chat` also enforces an optional bearer token (`CHAT_BACKEND_TOKEN`), a
`CHAT_RATE_LIMIT`-req/60s in-memory limit, and a 1-hour answer cache.

**Both ends of `/api/chat` are rate limited, and they share one env var.** The Worker charges
`CHAT_RATE_LIMIT` (default 20) requests per minute per visitor against the same `ingest_budget`
table `/api/track` uses, under a `chat:` bucket prefix, every accepted request is one
`chat_health` D1 write, and before this the endpoint was an unauthenticated, unmetered write
amplifier sharing a quota with analytics ingest. `npm run test:chat` replays 75 cases in a burst
and trips the default, so `.env.local` sets `CHAT_RATE_LIMIT=1000` for the dev server; production
leaves it unset.

The Python side still refuses to trust `X-Forwarded-For`, but keying on `request.client.host`
alone was worse than conservative, behind the Worker that is a Cloudflare egress address, so every
visitor shared one bucket and fifteen questions from one person locked the AI path for everyone.
The Worker now forwards `X-Client-Bucket`, the salted hash it already computed, and `main.py`
honours it **only when `CHAT_BACKEND_TOKEN` is set**, matching the token is what proves the
request came from the Worker, so a direct caller cannot choose its own bucket.

`tests/chat-cases.json` is shared: `tests/chat.mjs` replays it over HTTP, and
`test_answer_contract` replays the same pairs through Python's `faq()`. Both must agree, which is
what keeps the two implementations of the same logic in step.

## Conventions

- **Style is deliberately dense**: one line per JSX element, no space after `if`, minimal
  whitespace. Match the surrounding file rather than the formatter (see the `npm run format` warning
  above). `components/ui/` is generated shadcn output and is conventionally formatted.
- **oxlint, not ESLint; oxfmt, not Prettier.** `typescript/no-explicit-any` and
  `typescript/no-deprecated` are errors, `typeAware` is on, and `correctness` is escalated to error.
- shadcn is configured with `style: "base-nova"`: the primitives are backed by **`@base-ui/react`,
  not Radix**. 60 components are vendored in `components/ui/`; `chart.tsx`, `table.tsx`,
  `sidebar.tsx`, `tabs.tsx` and most others are currently unused. `recharts@3.8.0` is installed and
  unused.
- **Tailwind v4, CSS-first.** There is no `tailwind.config.*`. Tokens live in `app/globals.css`:
  `@theme inline` maps `--color-*` / `--font-*`, then `:root` and `.dark` define the palettes.
  Beyond the tokens, the portfolio's styling is hand-written BEM-ish CSS (`.portfolio`,
  `.project-card`, `.chat-panel`) over a second local token set (`--ink`, `--sub`, `--line`,
  `--surface`, `--panel`, `--signal`) that flips under `.portfolio.immersive`.
- Path alias `@/*` resolves to the repo root.
- Env: only `NEXT_PUBLIC_*` vars are inlined into client bundles. Production values come from the
  Sites runtime config, not the repo (`dist/server/wrangler.json` ships `"vars": {}`). FastAPI does
  **not** load `.env` itself, export those or set them in the host's secret store.
- **External links rot silently.** `npm run check:links` imports `content/portfolio.ts` and fetches
  every URL anonymously. It is a deploy gate. It is host-aware on purpose: a naive "non-200 is
  broken" rule produced 9 false positives out of 25, because Udemy and `ude.my` sit behind a
  Cloudflare challenge (a *fake* certificate id returns the same 403 as a real one), Coursera is
  client-rendered (a fake code also returns 200), and LinkedIn answers 999 inconsistently. Those
  hosts get a URL-shape check and are reported as unverified rather than passed. Google Docs *is*
  verifiable (401 means Restricted) and it is the host that actually broke. Do not classify a
  Google Doc by looking for "Sign in" in the body; public docs contain that string too.
- Public content boundary: only publish what is safe for a public portfolio. `content/portfolio.ts`
  carries comments marking `privateWork` summaries as deliberately scope-limited; keep client data,
  credentials, internal URLs, source links, test artifacts, and security findings out of it.

## Analytics

There is a first-party analytics system with an admin dashboard at `/admin`. **Read ANALYTICS.md
before touching `lib/analytics/`, `components/admin/`, or the `data-track-*` attributes**, it
records the reasoning behind decisions that look arbitrary and are not: why section dwell is emitted
on *leaving* rather than entering, why the heatmap preview needs three conditions rather than two,
why no visitor IP is stored, and why the queue order in `clicks.ts` matters.

Two rules that are easy to break by accident:

- **`lib/analytics/events.ts` is imported by both the browser and the ingest route.** Adding a verb
  is deliberately a one-file change; splitting it is how a verb gets dropped silently and looks
  exactly like broken code.
- **If you add a field to the event log, update `app/privacy/page.tsx` in the same commit.** That
  page states what is collected and for how long. It is an obligation, not a nicety.
- **`/analytics` is public and must never touch the database.** It renders the same panels as
  `/admin` against `content/analytics-demo.json`. If it ever gains a `fetchAdmin` call it becomes a
  public page probing a gated API on every load. Change a query payload shape and re-run
  `npm run seed:demo`, or the showcase silently keeps the old shape.
- **`scripts/d1-sqlite.ts` imports `node:sqlite` and cannot run on a Worker.** It is `scripts/`-only.
  It lives outside `lib/analytics/` precisely so an import from application code looks wrong.
- **The `oai-authenticated-user-email` header is only honoured when
  `TRUST_PLATFORM_AUTH_HEADER` is set, and the default is off.** A request header is trustworthy
  only if something in front of the app strips inbound copies, and that is a property of the *host*.
  OpenAI Sites' ingress does it; a Cloudflare Worker does not. The comment in `admin-auth.ts` used to
  claim `@openai/sites-vite-plugin` stripped it. It does, but only in `configureServer`, the
  **dev-server middleware**, with no equivalent in the production bundle. It also claimed allowlist
  membership was a sufficient backstop; it is not, because `content/portfolio.ts` prints the owner's
  email in the contact section and that address is in `ADMIN_EMAILS`. Verified by serving the built
  Worker with `ADMIN_EMAILS` set and sending the header by hand: HTTP 200 and the full dashboard.
  There are regression tests for both directions in `tests/analytics.test.ts`.
- **The `pa_admin` cookie is a signed session, never `ADMIN_TOKEN` itself.** It carries
  `<expires-at>.<hmac>` (v1) or `<expires-at>.<email-b64url>.<hmac>` (v2) signed with the token over
  its own contents, so the deadline is enforced server-side rather than being an advisory
  `Max-Age`, rotating `ADMIN_TOKEN` invalidates every outstanding session, and the value in a
  browser jar is worth one session rather than everything. The email is *inside* the signed message,  beside it, the holder could rewrite it. Bearer stays a direct compare, that path is curl, the
  tests and the retention cron. This is why `authorizeAdmin` is **async**: it awaits WebCrypto, so
  every caller and `withEnv` in the tests awaits it too.
- **Google sign-in is what finally gives `ADMIN_EMAILS` teeth, and it is a different trust model
  from the header above.** `GOOGLE_CLIENT_ID` turns on a Google Identity Services button
  on `/admin`; the browser posts the resulting ID token to `/api/admin/session`, and
  `lib/analytics/google-auth.ts` verifies Google's RS256 signature against their JWKS with WebCrypto
  before the payload is read at all. Because the assertion is *signed*, the allowlist stops being a
  secret, which matters here specifically, since the owner's address is printed on the homepage.
  Three things are load-bearing and easy to drop:
  - **`aud` must be checked against our own client id.** Without it, an ID token minted for any
    other Google application verifies perfectly and names a real user. There is a test for exactly
    this (`a Google token minted for ANOTHER app is refused`).
  - **The allowlist is re-read on every request**, not trusted from issue time, so deleting an
    address from `ADMIN_EMAILS` ends that person's live session instead of waiting out 12 hours.
  - **`next.config.ts` must allow `accounts.google.com`** in `script-src`, `connect-src` and
    `frame-src`. The CSP is production-only, so omitting one leaves sign-in working in `npm run dev`
    and dead on the deployed Worker, with the only symptom in the browser console.
  - **The JWKS fetch must stay a plain `fetch(JWKS_URL)`.** A `cf: { cacheTtl: 3600 }` hint on it
    broke sign-in on the deployed Worker *and* in `vinext dev`, while every unit test passed, 
    the tests stub `fetch`, so the one line that failed was the one line they never execute.
    Removing the hint was the only functional change between the broken deploy and the working
    one. It needed an `as RequestInit` cast to compile, which was the warning: casting past a
    type error is how a runtime failure gets written in a file that typechecks.
  - **The variable is `GOOGLE_CLIENT_ID`, not `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.** The prefix is the
    obvious choice for a value the browser sees and the wrong one: it is inlined at build time in
    the *server* bundle too, so a runtime var on the Worker would never be read and setting it
    would appear to do nothing. Confirmed by grepping `dist/server/index.js` after a build with it
    unset, the identifier is gone, replaced by `""`. The value reaches the browser as a prop from
    the server component instead.

  There is no client secret and no callback route: GIS returns an ID token directly, which is all
  this app needs, since it never calls a Google API as the user. The token form stays below the
  button as break-glass, Google sign-in depends on a third-party script, a correct CSP and a
  matching origin, and each is a way to be locked out of your own dashboard.

## Before publishing

`npm run typecheck`, `npm test` and `npm run build` should all pass. `npm run lint` will not. See
the note above; lint the paths you touched instead.
