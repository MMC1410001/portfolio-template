/**
 * `next/server` for `npm run test:units`, mapped in by tests/ts-hooks.mjs.
 *
 * There is no `next` package in this repo; vinext shims the import at build
 * time. The routes use exactly one export, after(), which under vinext is
 * ctx.waitUntil. Here it starts the task at once and keeps the promise, so a
 * test can await drainAfter() before reading what the task wrote, and before
 * closing the database it wrote to.
 */
const pending: Promise<unknown>[] = [];

export function after(task: (() => unknown) | Promise<unknown>): void {
  pending.push(Promise.resolve().then(() => (typeof task === 'function' ? task() : task)));
}

/** Wait for every after() task started so far. */
export async function drainAfter(): Promise<void> {
  while (pending.length) await Promise.allSettled(pending.splice(0));
}
