/**
 * Generate the committed migration files from lib/analytics/schema.ts.
 *
 * Run by hand, output committed, the same "generator script + committed
 * output" pattern scripts/sync-knowledge.mjs already establishes, and for the
 * same reason: two copies of a schema that can drift is worse than one copy
 * plus a command.
 *
 *   node scripts/emit-migration.mjs
 *
 * ── Why two destinations ───────────────────────────────────────────────────
 * There are two conventions in play and it is not knowable from this repo
 * which one the OpenAI Sites control plane honours:
 *
 *   migrations/,  the standard wrangler D1 convention. @cloudflare/vite-plugin
 *                  defaults `migrations_dir` to "migrations" and rewrites the
 *                  path into dist/server/wrangler.json, so this is the folder
 *                  `wrangler d1 migrations apply` will look in.
 *   drizzle/,  what @openai/sites-vite-plugin copies into
 *                  dist/.openai/drizzle/ on every build. It only copies; it
 *                  never applies anything, and nothing in node_modules reveals
 *                  what the platform then does with it.
 *
 * Both are written from one source, so they cannot disagree. Neither is
 * authoritative: `ensureSchema()` in lib/analytics/db.ts is. Because every
 * statement is IF NOT EXISTS, "applied twice" and "never applied" are both
 * harmless.
 *
 * ── One file per schema version, never an edit to an applied one ──────────
 * `wrangler d1 migrations apply` records applied migrations by FILE NAME and
 * never re-reads one it has recorded. v2 (chat_quota) and v3
 * (trusted_networks) were first emitted by appending to 0001, which a
 * database that had already applied 0001 would therefore never see. So each
 * version now gets its own file, and 0001 is byte-for-byte the v1 body that
 * was applied.
 *
 * schema.ts is a flat list with no version grouping, so the grouping lives
 * here, in INTRODUCED_IN, keyed by the name of the object a statement creates
 * (or, for a statement that creates nothing, e.g. ALTER TABLE, its text with
 * whitespace collapsed). This script refuses to run when a statement is not
 * claimed by a version, or when the highest version here is not
 * SCHEMA_VERSION: silently filing a new table under an already-applied
 * version is exactly the failure this layout exists to prevent.
 *
 * To add a schema version: bump SCHEMA_VERSION in schema.ts, append its
 * statements there, add one entry below naming them, and run this script.
 * Never move a name between existing entries.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

/** version -> the migration file's tag, the drizzle `when`, and what it adds. */
const INTRODUCED_IN = [
  { version: 1, tag: '0001_init_analytics', when: 1757000000000, objects: [
    'analytics_meta',
    'events', 'events_created_idx', 'events_event_created_idx', 'events_session_order_idx',
    'events_visitor_created_idx', 'events_section_created_idx',
    'click_points', 'click_points_kind_idx', 'click_points_created_idx',
    'chat_health',
    'ingest_budget', 'ingest_budget_window_idx',
  ] },
  { version: 2, tag: '0002_chat_quota', when: 1790588634000, objects: ['chat_quota', 'chat_quota_window_idx'] },
  { version: 3, tag: '0003_trusted_networks', when: 1790590663000, objects: ['trusted_networks'] },
];

const root = new URL('..', import.meta.url);

// Same in-memory transpile trick as sync-knowledge.mjs, so the schema has
// exactly one definition and this script reads it rather than restating it.
const source = await readFile(new URL('lib/analytics/schema.ts', root), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

const { SCHEMA_STATEMENTS, SCHEMA_VERSION } = mod;

const keyOf = (s) =>
  /^\s*CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(s)?.[1] ??
  s.trim().replace(/\s+/g, ' ');

const versionOf = new Map();
for(const { version, objects } of INTRODUCED_IN) for(const o of objects) versionOf.set(o, version);

const fail = (msg) => { console.error(`emit-migration: ${msg}`); process.exit(1); };
const latest = INTRODUCED_IN.at(-1).version;
if(latest !== SCHEMA_VERSION) fail(`schema.ts is at SCHEMA_VERSION ${SCHEMA_VERSION} but INTRODUCED_IN ends at ${latest}. Add an entry for the new version.`);
const unclaimed = SCHEMA_STATEMENTS.map(keyOf).filter((k) => !versionOf.has(k));
if(unclaimed.length) fail(`no schema version claims: ${unclaimed.join(', ')}. List them under a NEW version in INTRODUCED_IN, never an existing one.`);
const present = new Set(SCHEMA_STATEMENTS.map(keyOf));
const withdrawn = [...versionOf.keys()].filter((k) => !present.has(k));
if(withdrawn.length) fail(`INTRODUCED_IN names objects schema.ts no longer creates: ${withdrawn.join(', ')}. An applied migration cannot be withdrawn.`);

const header = (version) => [
  `-- Generated by scripts/emit-migration.mjs. Do not edit by hand.`,
  `-- Source of truth: lib/analytics/schema.ts (SCHEMA_VERSION ${version}).`,
  `-- Authoritative application is ensureSchema() at runtime; this file is a`,
  `-- belt for whichever migration mechanism the platform honours.`,
  ``,
].join('\n');

await mkdir(new URL('migrations/', root), { recursive: true });
await mkdir(new URL('drizzle/meta/', root), { recursive: true });

for(const { version, tag } of INTRODUCED_IN) {
  const statements = SCHEMA_STATEMENTS.filter((s) => versionOf.get(keyOf(s)) === version);
  // Drizzle separates statements with this marker; wrangler is happy with plain
  // semicolons, and the marker is a comment either way, so one body serves both.
  const body = statements.map((s) => `${s.trim()};`).join('\n--> statement-breakpoint\n');
  const sql = `${header(version)}${body}\n`;
  await writeFile(new URL(`migrations/${tag}.sql`, root), sql);
  await writeFile(new URL(`drizzle/${tag}.sql`, root), sql);
  console.log(`Emitted ${statements.length} statements to migrations/${tag}.sql and drizzle/${tag}.sql.`);
}

await writeFile(
  new URL('drizzle/meta/_journal.json', root),
  `${JSON.stringify(
    {
      version: '7',
      dialect: 'sqlite',
      entries: INTRODUCED_IN.map(({ tag, when }, idx) => ({
        idx,
        version: '6',
        when,
        tag,
        breakpoints: true,
      })),
    },
    null,
    2,
  )}\n`,
);

console.log(`Schema v${SCHEMA_VERSION}, ${SCHEMA_STATEMENTS.length} statements in ${INTRODUCED_IN.length} files.`);
