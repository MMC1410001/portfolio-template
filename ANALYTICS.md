# Analytics

First-party only. No Google Analytics, no Tag Manager, no Microsoft Clarity,
no advertising or social pixels, no third-party script of any kind. Everything
below is this repo's own code writing to this site's own database.

Ported from the admin panel in a private project (Lumen, React + Supabase),
with everything account-, payment- and domain-specific removed. Where this
version diverges, the reason is recorded, both here and at the point in the
code where it matters.

## The shape of it

```
browser                        worker                      d1
───────                        ──────                      ──
lib/analytics/queue.ts   ──►   app/api/track/route.ts  ──► events
  batched, 20 or 10s             validate, allowlist,       click_points
  sendBeacon on exit             hash the IP, geo from
                                 request.cf
lib/analytics/session.ts ──►   (same route, single row) ──► events
  one immediate `visit`

components/portfolio/    ──►   app/api/chat/route.ts   ──► chat_health
  Chat.tsx                       counters only, no text

/admin                   ──►   app/api/admin/analytics ──► reads everything
  client-fetched panels          one gate, action switch
```

Storage is a Cloudflare D1 database, named by `"d1"` in
`.openai/hosting.json`. With that key `null` there is no binding at all and
the whole system degrades to a no-op: ingest refuses politely, the dashboard
says "storage not configured". That was the committed state before this
feature and the site must keep working in it.

## Events

One vocabulary file, `lib/analytics/events.ts`, imported by **both** the
browser and the ingest route. The source system split it in two and its own
notes record the cost: a verb missing from the server's list was dropped
silently and looked exactly like broken code.

| verb | when | notable props |
| --- | --- | --- |
| `visit` | once per session, sent immediately | `reduced_motion` |
| `page_view` | on **leaving** a section | `from`, `to`, `terminal`, `doc_h` |
| `session_end` | pagehide / visibilitychange | `exit_section`, `resume_ms`, `immersive_ms`, `mode_changes`, `max_scroll_px` |
| `click` | capture-phase, delegated | `tag`, `selector`, `section`, `mode` |
| `dead_click` | click hit nothing interactive | `selector`, plus a coordinate |
| `rage_click` | 3+ clicks in 40px inside 700ms | `dead`, plus a coordinate |
| `scroll_depth` | 25/50/75/100%, once each | `depth`, `doc_h`, `section` |
| `cta_view` | tagged control 50% visible for 1s | `tag` |
| `mode_change` | résumé ↔ Experience | `from`, `to`, `trigger`, `dwell_ms`, `reduced` |
| `chat_open` / `chat_ask` / `chat_answer` / `chat_close` | see below | |
| `error` | the immersive chunk failed to load | `scope` |

Adding a verb is a one-file change. Everything new belongs in `props` rather
than a new column, so the schema does not move.

## Section dwell is measured on leaving, not entering

The site is one page, so "which page did they leave from" is meaningless and
the unit of engagement is the in-page section. `path` on a `page_view` row is
`/#work`, not a route.

The source system emits its page view on *entering* a path, carrying the dwell
on the *previous* one, then recovers it in SQL with a window function. Its own
notes admit the cost: **the last page of a session has no dwell measurement.**
On a single-page site the last section is the most interesting one. It is
where the visitor stopped, so that is the wrong thing to lose.

Emitting on leave fixes it for free. `duration_ms` belongs to the row that
names it (so average dwell is a plain `AVG … GROUP BY`, no window function),
`flushSectionDwell()` emits the terminal row from the exit hook so every
section entry produces exactly one row with a real dwell, and the exit section
is `props.terminal` rather than `row_number() … DESC`: which is robust to a
beacon batch arriving out of order.

### `/dashboards` is tracked, and has no sections

`AnalyticsProvider` sits in `app/layout.tsx`, so it mounts on every route, and
`UNTRACKED_PREFIXES` names only `/admin`. Clicks on the dashboards index and
on each `/dashboards/<id>` page are therefore recorded like any other, with
`path` as the real route rather than `/#section`.

What those routes do *not* have is section dwell: `SECTIONS` describes the
homepage's in-page anchors, and none of those ids exist in the DOM there. That
is correct rather than a gap, a dashboard page is one view, so "which section
did they leave from" has no meaning on it, and the question the cards were
built to answer is whether a visitor opens one at all, which is a click.

### Why `#northwind-erp` is different

It is nested *inside* `<section id="work">`. A flat observer would hold two
sections active at once and their dwells would sum to more than the session.
It is marked `level: 'block'` in `lib/analytics/section-catalogue.ts` and
watched by the CTA observer instead, so it reports an impression, "this was
genuinely seen", with no overlapping dwell.

`#additional-projects` was a second such block and is gone: its cards were all
products, so they moved into `#products`. It left `SECTIONS`: a block that can
never be reached again shows in the section funnel as a permanent zero, which
reads as "nobody got this far" rather than "this no longer exists", but it
kept a label in `RETIRED_LABELS`, because events live 180 days and those rows
would otherwise re-render as a raw id. It is deliberately **not** in
`SECTION_IDS`: the block is out of the DOM, so a new row naming it is forged,
not late.

## Tagging

`data-track-tag="<area>-<object>"`, lowercase and hyphenated, validated by
`normaliseTag()`. `data-track-cta="…"` marks something worth an *impression*
that has no click name of its own.

There is no GTM here, so the name lives in the DOM and the capture-phase
listener reads it on the first pass: no dataLayer, no second writer, no
`enrichLastEvent` for ordinary clicks. `trackTag()` survives for gestures that
are not DOM clicks (a `Select` changing value, a pause toggle).

**The queue-order rule still applies.** `enrichLastEvent()` names the tail of
the queue and refuses anything that is not a `click`, so `clicks.ts` queues
`rage_click` **before** the click row, never after. Reverse them and any
`trackTag()` for the same gesture writes a second, synthetic row.

Lumen's notes record that its `src/` contained **zero** tag attributes, so
its impression denominator was permanently empty and its CTA funnel never
worked. The 56 attributes across `Portfolio.tsx`, `Chat.tsx`,
`ImmersiveSystem.tsx`, `SocialIcons.tsx` and the two `components/dashboards/`
entry points exist so that is not repeated. Conversion tags are listed in
`CONVERSION_TAGS` and interpolated into the session CTE from there, so
renaming one cannot silently empty a funnel step.

The dashboard-card tags interpolate a dashboard id, `dashboard-card-`,
`dashboard-index-`, `dashboard-prev-` and `dashboard-next-` plus the id from
`content/dashboards.ts`: which puts them within nine characters of
`MAX_TAG_LEN`. Past that limit `normaliseTag()` returns null rather than
truncating, so one long id would drop a whole card's clicks with no error at
either end. `tests/dashboards.test.ts` asserts every combination survives
normalisation, because adding an entry with a wordy id is otherwise a silent
hole in the click data.

## The heatmap preview freeze

`/admin` renders the real page in an iframe so the click map has something to
sit on. `Portfolio.tsx` mutates itself, so all of this is suppressed when
`isHeatmapPreview()` is true:

- the 10-second auto-reveal, and the countdown text
- `.dark` on `<html>`
- the scroll-driven turntable, which resolves to a single still frame
- **the chat launcher**. It is `position: fixed`, so inside the CSS-scaled
  stage it paints at a fixed offset *within the stage* and appears as a stray
  element under the heatmap
- all recording, via `trackingSuppressed()`

`isHeatmapPreview()` requires **three** conditions: `?embed=true`, AND
`?preview=heatmap`, AND a parent frame on our own origin. Being framed is
something any page on the internet can arrange, so it is not evidence of
anything on its own; reading `window.parent.location.origin` throws
cross-origin, which is the signal we want. The `catch` returns **false**. Do
not relax this to two conditions.

**The freeze is post-hydration, by design.** `useHeatmapPreview()` returns
`false` from `getServerSnapshot`, because the alternatives are a hydration
mismatch or making `/` dynamic for every visitor to serve an admin-only
feature. So the server-rendered HTML still contains the launcher for one
frame. It does not affect measurement, `.chat-launcher` is `position: fixed`
and never contributes to `scrollHeight`, and nothing is measured before
`onLoad`. **Verifying the visual freeze needs a browser and is a manual
check:** open `/admin`, watch the heatmap stage for 15 seconds, and confirm the
page behind it does not switch to Experience mode.

## Chat questions

Captured **client-side**, and that is structural rather than a preference:
`Chat.tsx` answers locally whenever `/api/chat` fails, so a server-only
capture would miss precisely the case most worth knowing about. One writer,
one rule.

`/api/chat` writes one thing the client cannot know, whether the optional
Python service answered, as day counters with **no question text**, in its own
table, rendered in its own card. Nothing double-counts.

### The text policy

`normaliseQuestion()` refuses, in order: anything matching `/@|%40|\d{7,}/`,
anything containing a URL, anything over 120 characters, anything under 3.
Refused text is dropped **whole**, never edited, a partly-redacted question
still reads like a real one and nobody would notice what it had been.

**Rejecting the text never rejects the event.** The row still carries
`q_len`, the answer source and the rejection reason, so volume, guard-hit rate
and the offline-fallback rate survive intact, and `count(rejected='pii')`
becomes a privacy metric of its own.

The headline number is **coverage gap**, the share of answers that came back
`Not documented`. Every unmatched question with text is a row to add to
`content/faq.ts`.

**Guard hits** are the answers that never reached the answer set at all, and
there are three sources of them: `Safety boundary` (a credential or a request
for private material), `Portfolio guide` (abuse, a jailbreak attempt, or an
off-topic question) and `Out of scope` (personal information, caste,
religion, marital status, disability, gender, which gets a boundary rather
than the `Not documented` text, because that text invites the asker to contact
Alex directly and no recruiter should be nudged toward those questions).

The list is duplicated by necessity: `GUARD_SOURCES` in
`lib/analytics/queries.ts` matches them in SQL, and `scripts/seed-analytics-demo.ts`
carries its own copy so `/analytics` shows the same buckets. A source missing
from either is counted as a real answer, which understates the guard-hit rate
and leaves an unexplained slice in the source distribution. Adding a guard tier
to `content/faq.ts` means editing both.

`Chat.tsx` seeds the conversation with `source: 'Answers from the portfolio'`,
which is *not* one of `content/faq.ts`'s real sources. The panel excludes it
explicitly, or the source distribution gains a phantom bucket equal to the
number of sessions that opened the panel.

## Privacy

**No visitor IP address is stored.** The server sees it and keeps a salted
SHA-256 (for the rate-limit bucket and distinct-visitor counts) plus a `/24`
or `/48` prefix. `ANALYTICS_IP_SALT` is required: with it unset the route
refuses to write and logs why, because an unsalted hash of the IPv4 space is
trivially reversed and degrading loudly beats degrading quietly.

The prefix is kept for exactly one reason. It is the only thing that makes it
possible to retro-fit an office CIDR to the internal list later. Because
`is_internal` is computed at write time, **adding a CIDR does not reclassify
history**; a manual `UPDATE … WHERE ip_prefix IN (…)` is the documented way to
backfill, and is an admin action rather than something to discover later.

Retention: question text 30 days, click positions 30 days, everything else 180
days, backend counters 365. Question text expires via `json_remove` so the
counts and rates outlive the words. `app/privacy/page.tsx` states all of this
to visitors and carries a working opt-out. **If a field is added to the event
log, that page changes in the same commit.**

## SQLite is not Postgres

The source system's aggregation was one 600-line Postgres function. D1 has no
equivalent, so `lib/analytics/queries.ts` issues one `db.batch()` per action, 
still a single transaction, so each panel reads a consistent snapshot.

| Postgres | here | why |
| --- | --- | --- |
| `percentile_cont` | a `ROW_NUMBER` window | no ordered-set aggregates |
| `generate_series` | a recursive CTE | doesn't exist |
| `FULL OUTER JOIN` | key set + two `LEFT JOIN`s | designed out rather than bet on |
| `~*` regex | TypeScript | **D1 registers no REGEXP at all** |
| `jsonb ->>` | `json_extract`, guarded by `json_valid` | one malformed row would otherwise kill a statement |
| `array_agg(ORDER BY)` | `lastNonNull()`, a lexical-prefix trick | see `sql.ts` |
| `inet` / `<<=` | CIDR matching in TypeScript | no type, no operator |
| `DELETE … LIMIT` | `WHERE id IN (SELECT … LIMIT n)` | not guaranteed compiled in |

Moving referrer bucketing to TypeScript is an improvement, not a compromise:
the rules are unit-testable and the raw host list ships beside the buckets, so
an unexpected referrer is visible rather than swept into "referral".

**Bound parameters are capped at 100 per query**, which is why rows are
inserted with `json_each(?1)`: a 50-event batch across 32 columns would be
1,600 placeholders.

## Timezone

Day buckets are pinned to Asia/Kolkata, which has no DST, so the offset is a
constant `+19800` seconds and no timezone database is needed.

Never use SQL's `'localtime'` modifier: it resolves against the server's zone,
which is UTC on a Worker, and reproduces the source system's bug where
everything between 00:00 and 05:30 IST counted against the previous day.

**The index rule:** the window filter is always on the raw integer column, and
the IST expression appears only in `SELECT` / `GROUP BY`. In a `WHERE` clause
it defeats every index and re-opens the boundary problem from the other side.

`Today` and `Yesterday` are IST calendar days; `7d` / `30d` / `90d` are
rolling. Changing the latter would silently move every number an operator has
already seen.

## Numbers that do not mean what they look like

- **"Saw one section only"** is not the classic bounce rate. On a one-page site
  every session has exactly one page view, so the familiar metric would be
  100%. The tile says so.
- **New vs returning** is bounded by the 180-day retention horizon: a visitor
  last seen before that counts as new. The panel reports the horizon beside it.
- **Scroll reach** divides by every session that *started*, not by sessions
  that reported a milestone. Scoping to reporters puts every depth near 100%
  and says the opposite of the truth.
- **A rate with no denominator is `null`, not `0`.** `ratio()` returns null on
  a zero base and `pct()` renders `, `, because 0% claims the control was shown
  and ignored.
- **Location is a regional hint.** Mobile carriers route whole states through
  one city. Local development has no geo at all (the dev runtime stubs the
  request), so the panel reports availability from the data rather than
  assuming it.
- **Heatmap colour is relative to the busiest band in the current view**, so
  two views are not comparable by colour alone.

## Internal traffic

Two env vars, `ANALYTICS_INTERNAL_CIDRS` and `ANALYTICS_INTERNAL_VISITORS`, 
plus a per-browser opt-out.

Prefixes broader than `/16` (v4) or `/32` (v6) are **skipped with a warning,
not applied**: a stray `/0` would mark every visitor internal and zero the
panel, and the failure presents as "no traffic" rather than as an error.

Filtering is a **whole-session** verdict, not per-event. The source system
measured its own office leaving by three different ISPs across three
consecutive requests; an event-level filter leaves every internal session
partly counted, which produces a plausible number that is wrong.

The per-browser opt-out (`pfInternal` in localStorage, on `/privacy` and in the
panel) is a genuine improvement on the source system, which could only filter
by CIDR and never quite managed it.

## Migrations, and the honest state of them

Two conventions are in play and it is **not knowable from this repo** which
one the host honours:

- `migrations/`: the standard wrangler D1 convention.
  `@cloudflare/vite-plugin` defaults `migrations_dir` to `"migrations"` and
  rewrites the path into `dist/server/wrangler.json`.
- `drizzle/`: what `@openai/sites-vite-plugin` copies into
  `dist/.openai/drizzle/`. It only *copies*; nothing in `node_modules` reveals
  what the control plane then does with it.

`scripts/emit-migration.mjs` writes both from one source, so they cannot
disagree. **Neither is authoritative:** `ensureSchema()` in
`lib/analytics/db.ts` applies the same statements at runtime, memoised per
isolate. Every statement is `IF NOT EXISTS`, so "applied twice" and "never
applied" are both harmless.

After v1, `ALTER TABLE … ADD COLUMN` has no `IF NOT EXISTS` in SQLite, so
additive changes are **not** blindly re-runnable, bump `SCHEMA_VERSION` and
gate the new statements on it rather than appending to the flat v1 list.

## The admin gate, and why the email allowlist is off by default

`authorizeAdmin` has two paths. Only one of them is safe without help from the
host.

`ADMIN_TOKEN` (a secret compared in constant time) needs nothing in front of
it. The `oai-authenticated-user-email` header needs an ingress that strips
inbound copies, and **whether that happens is a property of the host, not of
this code**. So the header path is gated behind `TRUST_PLATFORM_AUTH_HEADER`,
default off.

This was found while migrating off OpenAI Sites, and it was exploitable rather
than theoretical:

- the original comment claimed `@openai/sites-vite-plugin` strips inbound
  `oai-authenticated-user-*`. It does, in `configureServer`, the **dev-server
  middleware**. There is nothing equivalent in the production Worker bundle;
  on Sites the stripping is OpenAI's ingress, outside this repo.
- it also claimed allowlist membership rather than mere presence was a
  backstop "if a production ingress ever fails to strip". It is not.
  `content/portfolio.ts` prints the owner's email in the contact section, and
  that address is in `ADMIN_EMAILS`: the value being checked is published on
  the homepage.

Verified by serving the built Worker with `ADMIN_EMAILS` set and sending the
header by hand: `{"identity":{"via":"platform",...}}`, HTTP 200, whole
dashboard. With the flag unset it is now 404, and with it set the Sites
behaviour is unchanged. Both directions have regression tests.

Consequences to remember:

- **On OpenAI Sites, set `TRUST_PLATFORM_AUTH_HEADER=1`** or `/admin` is
  token-only there.
- **On Cloudflare, never set it.** `scripts/preflight-deploy.mjs` blocks a
  deploy that does.
- `ADMIN_EMAILS` without the flag is inert. The gate logs one warning saying
  so, because config that looks like protection and is not is how someone
  concludes the panel is protected.

## The public showcase at `/analytics`

`/admin` is private and stays private. It renders verbatim chatbot questions
and a per-visit table carrying city, ASN organisation and a network prefix, 
at this site's traffic that combination identifies individuals, and the ASN is
frequently an employer rather than an ISP. Publishing it would also contradict
`/privacy`, which visitors read on the understanding that the operator is the
only audience.

So `/analytics` is a **public copy running on synthetic data**. It imports the
same panel components (no second set of "demo" panels to drift) and feeds
them a committed dataset from `content/analytics-demo.json`. The page is
static, has no credential path, and makes no database call, so there is no
flag that could be flipped to expose real rows.

Regenerate with `npm run seed:demo`. What that script does is the point:

1. opens an in-memory SQLite through `scripts/d1-sqlite.ts`, a D1-shaped
   facade over `node:sqlite` (build-time only, it imports a Node module and
   must never be reachable from `app/`, `lib/` or `components/`);
2. applies the **real** `SCHEMA_STATEMENTS`;
3. generates synthetic events and pushes each through the **real**
   `validateEvent` → `buildRows` → `writeBatch`, asserting nothing was
   dropped, so the generator cannot invent data the live endpoint would
   refuse;
4. runs the **real** `overview`, `audience`, `campaigns`, `chatStats`,
   `clickMap` and `listSessions`;
5. validates ~90 assertions and refuses to write if any panel would be empty
   or internally incoherent.

That last step earned its place several times over. It caught a 90-day window
showing zero returning visitors (correct, `audience()` looks for activity
*before* the window, so a range covering all of history has none; the fix was
to generate 120 days and offer 90), a coverage gap of zero (`'Not documented
yet'` where the query matches `'Not documented'` exactly), CTAs clicked in
sessions with no impression, and a median session duration of 30s/40s/20s
across three nested windows, which a stationary generator cannot produce, and
which turned out to be `sessionsOn(day)` sitting in a loop condition and
re-rolling the PRNG on every iteration.

Two properties worth preserving:

- **Determinism.** A seeded PRNG plus a pinned `generatedAt`, so re-running
  with an unchanged `ANCHOR`/`SEED` produces a byte-identical file. Verified by
  hash. Without the pin, `meta()`'s `Date.now()` rewrote 132 lines per run.
- **A fixed anchor, not `Date.now()`.** The range presets are labelled
  "7/30/90 days ending 9 September 2026" rather than "last 7 days", because a
  relative label would be false the day after generation.

The session list is stored once rather than per range: all three windows end on
the same anchor, so `listSessions`' newest rows are byte-identical across them
and storing three copies cost 40 KB of the page's bundle. The generator asserts
they match before deduplicating.

Verified after building: `Portfolio-*.js` contains no recharts and no demo
data, so the showcase costs the homepage nothing.

## Retention has no cron

There is nowhere to attach one: vinext's worker entry exports only `fetch`,
and the generated `wrangler.json` has empty `triggers`. So the sweep is
opportunistic, on every admin read (behind `after()`, so it never delays the
dashboard), on roughly 1 ingest in 500, and via the `retention-sweep` action.
It claims the slot by writing its timestamp *before* deleting anything, so two
concurrent requests cannot both sweep.

Because all three are pull-based, none of them fires in a quiet month. At ~20
sessions a day the ingest trigger has roughly an 11% chance of firing on any
given day (a mean gap of over a week) so click coordinates and question text,
both promised gone in 30 days on `/privacy`, were actually being deleted
somewhere around day 39. With no traffic at all, never.

`.github/workflows/retention.yml` closes that: one authenticated `POST` a day
at 02:00 IST, on a schedule that does not depend on anyone visiting the site.
It calls the `retention-sweep` action, which runs `sweep` rather than
`sweepIfDue`: unconditional by design, since a cron that skipped because an
ingest request had claimed the day would defeat the point.

Setup is one secret and one optional variable under **Settings → Secrets and
variables → Actions**: `ADMIN_TOKEN` (matching the deployed site) and
`SITE_URL` (only if the domain changes from the `metadataBase` default). The run
summary prints the row counts, so a month of sweeps is readable without opening
logs, and the job warns when `events` comes back at exactly 5,000. That means
`MAX_DELETES_PER_SWEEP` was hit and a backlog is draining at 5,000 rows a day.

One limitation worth knowing: **GitHub disables scheduled workflows in public
repositories after roughly 60 days without commit activity.** It emails first,
`workflow_dispatch` runs the job by hand, and any push re-arms it, but on a
portfolio that can sit untouched for two months, this is a real failure mode
rather than a theoretical one. A hosted pinger has no such rule at the cost of
putting `ADMIN_TOKEN` in a third-party service.

## Rate limiting, and what it does not do

A D1 counter, charged **per event before any work**, 120 per address per
minute. An in-memory `Map` is not a limiter on Workers: isolates are created
and destroyed per burst, and two requests from one address routinely land in
different ones.

Stated plainly: **an attacker still forces one D1 write per request**, because
the counter must be written to be read. No edge rate limit is reachable, 
`hosting.json` expresses only `d1` and `r2`. What bounds the damage is the
32KB body cap, the 50-event batch cap, and the hard rule that no `ip_hash`
means no write at all.

## Access

`/admin` is gated by `authorizeAdmin()`: one implementation, three callers
(the page, the read API, the session route). Two mechanisms:

1. The platform-injected `oai-authenticated-user-email` header, checked for
   **allowlist membership, not presence**. That is what holds if an ingress
   ever fails to strip a forged header, and it stops the local simulated user
   from being an admin unless deliberately allowlisted.
2. `ADMIN_TOKEN`, as a Bearer header or the `pa_admin` cookie.

Failure is **404, not 401**. A 401 on a public portfolio advertises that an
admin API exists and invites a token grind.

The cookie is `Path=/`: narrower was tried and is wrong, because it has to
reach both the page (whose gate runs before any markup) and the API, and one
cookie cannot name two paths.

## Running it

```sh
npm run dev            # the site, plus a local Miniflare D1
npm run test:units     # 35 pure-logic checks, no server needed
npm run test:analytics # 62 checks against a live dev server
npm test               # all three suites
npm run emit:migration # regenerate migrations/ and drizzle/ from schema.ts
```

`.env.local` needs `ANALYTICS_IP_SALT` for ingest to write at all, and
`ADMIN_TOKEN` (32+ chars) to reach `/admin`. Inspect the local database
directly with:

```sh
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
```

The `whoami` admin action reports whether the D1 binding resolved and which
`request.cf` keys actually arrived, the fastest way to answer both platform
unknowns after a deploy.

## Known unknowns

Ranked, and none of them are guesses dressed as facts:

1. **Whether the host applies either migration folder.** Mitigated: the
   runtime bootstrap is authoritative and platform-independent.
2. **Whether the production D1 binding is named `ANALYTICS_DB`.** `getDbHandle()`
   looks it up by name and falls back to scanning `env` for anything that
   quacks like a D1Database; `whoami` reports which path was taken.
3. **Whether `request.cf` carries city and region through the host.** There is
   a fallback ladder to `cf-ipcountry`, and geo availability is reported from
   the data rather than assumed.
4. **Whether the host serves frame-blocking headers.** If it does, the heatmap
   iframe is permanently blank; the canvas then draws over a blank stage and
   says why. The coordinates were always the product.
5. **Canvas memory on iOS Safari** at desktop width against a 15,000px page.
   Mitigated by a half-resolution render above 8M pixels; vertical tiling is
   the escape hatch if that is still too much.
6. **Section observer tuning** (`-40%` band, 600ms settle, 800ms minimum
   dwell) is reasoned but not yet calibrated against real scrolling.
