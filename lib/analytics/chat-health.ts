/**
 * The one server-side chat counter, in its own namespace.
 *
 * Everything about *what people ask* is captured client-side (see chat.ts) for
 * a reason that is structural: Chat.tsx answers locally when `/api/chat` fails,
 * so a server-only capture would miss exactly the case most worth knowing
 * about. One writer is one rule.
 *
 * But the client provably cannot know whether `PYTHON_CHAT_URL` responded. So
 * this records that, and nothing else: day, request count, and the three
 * outcomes. **No question text ever reaches this table.** It is deliberately
 * NOT joined to the client `chat_*` events and is rendered in its own
 * "Backend health" card, so nothing can double-count.
 */

import { after } from 'next/server';
import { getDb, ensureSchema } from './db';
import { istDayKey } from './time';

export interface ChatHealthTick {
  configured: boolean;
  ok: boolean;
  failed: boolean;
  /** The guard short-circuited before the backend was consulted. */
  guarded: boolean;
}

/**
 * Fire-and-forget. Never awaited by the route, never changes the response,
 * and a no-op when there is no database.
 */
export function recordChatHealth(tick: ChatHealthTick): void {
  const db = getDb();
  if (!db) return;

  const write = async () => {
    try {
      await ensureSchema(db);
      await db
        .prepare(
          `INSERT INTO chat_health
             (day, requests, backend_configured, backend_ok, backend_fail,
              guard_short_circuit)
           VALUES (?1, 1, ?2, ?3, ?4, ?5)
           ON CONFLICT(day) DO UPDATE SET
             requests            = chat_health.requests + 1,
             backend_configured  = chat_health.backend_configured + ?2,
             backend_ok          = chat_health.backend_ok + ?3,
             backend_fail        = chat_health.backend_fail + ?4,
             guard_short_circuit = chat_health.guard_short_circuit + ?5`,
        )
        .bind(
          istDayKey(Date.now()),
          tick.configured ? 1 : 0,
          tick.ok ? 1 : 0,
          tick.failed ? 1 : 0,
          tick.guarded ? 1 : 0,
        )
        .run();
    } catch (error) {
      console.error('[analytics] chat health write failed', error);
    }
  };

  // after() is genuine ctx.waitUntil under vinext, so the visitor waits for
  // nothing, but it throws outside a request scope, hence the fallback.
  try {
    after(write);
  } catch {
    void write();
  }
}
