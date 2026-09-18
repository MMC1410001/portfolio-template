import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

/**
 * The build config. Cloudflare Workers is the deploy target; OpenAI Sites is
 * supported while `.openai/hosting.json` is present.
 *
 * ── Why the Sites plugin is conditional ────────────────────────────────────
 * `@openai/sites-vite-plugin` **fails the build** when `.openai/hosting.json`
 * is missing, and this file used to `import` that JSON statically, so the
 * repo could not build at all without it, and could effectively only be
 * deployed by OpenAI's pipeline.
 *
 * The file's presence is now the switch, with no flag to remember:
 *
 *   `.openai/hosting.json` present -> sites() runs, Sites deploys still work
 *   file deleted                   -> plugin skipped, pure Cloudflare
 *
 * Read at runtime rather than imported, because a static `import` of a file
 * that may not exist is a build error, not a graceful absence.
 *
 * ── Where bindings come from now ───────────────────────────────────────────
 * `wrangler.jsonc`, via the plugin's default config discovery. Previously they
 * were inline here, with the D1 binding *name* taken from hosting.json and the
 * database id a placeholder that OpenAI substituted at deploy time. Declaring
 * them in the wrangler config means `wrangler dev`, `wrangler deploy` and
 * `wrangler d1 migrations apply` all read one source.
 *
 * hosting.json is still consulted for one thing: a mismatch check. If it names
 * a different D1 binding than wrangler.jsonc, the two hosts would disagree
 * about which database the app talks to, silently, and only in production.
 */

const ROOT = import.meta.dirname;
const HOSTING_PATH = resolve(ROOT, '.openai/hosting.json');
const WRANGLER_PATH = resolve(ROOT, 'wrangler.jsonc');

/** The D1 binding name declared in wrangler.jsonc, or null. */
function wranglerD1Binding(): string | null {
  try {
    const text = readFileSync(WRANGLER_PATH, 'utf8');
    // A line-comment-tolerant read. Enough for a binding name, pulling in a
    // JSONC parser to check one string would be the wrong trade.
    const match = /"binding"\s*:\s*"([^"]+)"/.exec(text);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Warn (rather than fail) when the two hosts disagree.
 *
 * Not fatal because someone mid-migration may legitimately have both files
 * with different bindings for a moment. Loud because the failure it prevents
 * is invisible: the app resolves a binding by name, so the wrong one means
 * "storage not configured" on one host and working analytics on the other.
 */
function checkBindingAgreement(): void {
  if (!existsSync(HOSTING_PATH)) return;
  try {
    const hosting = JSON.parse(readFileSync(HOSTING_PATH, 'utf8')) as {
      d1?: string | null;
    };
    const fromWrangler = wranglerD1Binding();
    if (hosting.d1 && fromWrangler && hosting.d1 !== fromWrangler) {
      console.warn(
        `[config] .openai/hosting.json names D1 binding "${hosting.d1}" but ` +
          `wrangler.jsonc names "${fromWrangler}". The two deploy targets ` +
          `would talk to different databases. Make them match, or delete ` +
          `.openai/hosting.json to drop the Sites target.`,
      );
    }
  } catch {
    /* an unreadable hosting.json is the sites plugin's problem to report */
  }
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  checkBindingAgreement();

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  // Imported only when its config file exists, so the module is not even
  // loaded once the Sites target is dropped.
  const sitesPlugin = existsSync(HOSTING_PATH)
    ? (await import('@openai/sites-vite-plugin')).sites()
    : null;

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      ...(sitesPlugin ? [sitesPlugin] : []),
      cloudflare({
        // Bindings, name, compat date and the D1 database now come from
        // wrangler.jsonc rather than an inline object.
        configPath: './wrangler.jsonc',
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      }),
    ],
  };
});
