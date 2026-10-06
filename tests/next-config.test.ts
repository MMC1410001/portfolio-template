/**
 * The two silent failures next.config.ts documents, pinned.
 *
 * Both deploy cleanly and break only in production: drop '/' from SOURCES and
 * the homepage loses every security header while every other route keeps
 * them (vinext's `/:path*` does not match the bare root); drop
 * accounts.google.com from one CSP directive and Google sign-in on /admin dies
 * on the Worker while `npm run dev`, which sends no CSP, keeps working.
 *
 * `headers()` reads NODE_ENV when it is called, not at import, so the variable
 * is set for the call and restored after it.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';

type Rule = { source: string; headers: { key: string; value: string }[] };

async function productionRules(): Promise<Rule[]> {
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    const { default: config } = await import('../next.config');
    assert.ok(config.headers, 'next.config.ts no longer exports headers()');
    return (await config.headers()) as Rule[];
  } finally {
    if(prev === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prev;
  }
}

const header = (rule: Rule | undefined, key: string) => rule?.headers.find((h) => h.key.toLowerCase() === key)?.value;

test("the header rules name both '/' and '/:path*', or the homepage loses every header", async () => {
  const sources = (await productionRules()).map((r) => r.source);
  assert.ok(sources.includes('/'), "SOURCES lacks '/': vinext's '/:path*' does not match the bare root, so / would ship with no security headers");
  assert.ok(sources.includes('/:path*'), "SOURCES lacks '/:path*': every route but / would ship with no security headers");
});

test("the rule for '/' carries the CSP in production", async () => {
  const root = (await productionRules()).find((r) => r.source === '/');
  assert.ok(header(root, 'content-security-policy'), "the '/' rule has no Content-Security-Policy in production");
});

test('the production CSP allows accounts.google.com in script-src, connect-src and frame-src', async () => {
  for(const rule of await productionRules()){
    const csp = header(rule, 'content-security-policy');
    assert.ok(csp, `no CSP on '${rule.source}'`);
    const directives = new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
    for(const name of ['script-src', 'connect-src', 'frame-src']){
      assert.ok(directives.get(name)?.includes('https://accounts.google.com'),
        `${name} on '${rule.source}' lacks https://accounts.google.com: Google sign-in on /admin would break on the deployed Worker only`);
    }
  }
});
