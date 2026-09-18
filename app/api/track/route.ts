/**
 * The public ingest endpoint.
 *
 * Unauthenticated by design (anonymous visitors are the whole point) so
 * everything in the body is treated as hostile and validated in payload.ts.
 *
 * ── Always 200 ─────────────────────────────────────────────────────────────
 * Every failure path returns HTTP 200 with `{ ok: false, reason }`. Stricter
 * than the source system, which returned 400 for a bad session id or an
 * unknown verb: on a portfolio, a red 400 in a visitor's devtools network
 * panel is itself a defect, and the client cannot act on the status anyway.
 * The one exception is an oversized body, which mirrors /api/chat's 413.
 *
 * ── No CORS, deliberately ──────────────────────────────────────────────────
 * Lumen needed `Access-Control-Allow-Origin: *` because the browser called
 * a different origin (Supabase). This route is same-origin, so omitting CORS
 * entirely is a free abuse control and there is no OPTIONS handler to write.
 * The `sec-fetch-site` check is a second line on the same idea.
 */

import { after } from 'next/server';
import { getDb, ensureSchema } from '@/lib/analytics/db';
import {
  MAX_BODY_BYTES,
  UUID_RE,
  readEvents,
  sanitiseAttribution,
  validateEvent,
  type TrackBody,
  type ValidatedEvent,
} from '@/lib/analytics/payload';
import { classifyUserAgent } from '@/lib/analytics/user-agent';
import {
  clientIp,
  hashIp,
  ipPrefix,
  matchesAnyCidr,
  parseCidrList,
} from '@/lib/analytics/net';
import { buildRows, chargeBudget, writeBatch } from '@/lib/analytics/ingest';
import { sweepIfDue } from '@/lib/analytics/retention';

export const dynamic = 'force-dynamic';

function ok(written: number): Response {
  return Response.json(
    { ok: true, written },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

function refused(reason: string): Response {
  return Response.json(
    { ok: false, reason },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/** Parsed once per isolate. This is a constant for the life of the deploy. */
let cidrs: ReturnType<typeof parseCidrList> | null = null;
let warnedNoSalt = false;

type CfRequest = Request & { cf?: IncomingRequestCfProperties };

export async function POST(request: Request) {
  try {
    // A cross-site POST has no legitimate reason to hit this route.
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      return refused('cross_site');
    }

    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return Response.json({ error: 'Payload too large.' }, { status: 413 });
    }
    // The header is advisory, so the read is checked too, the same two-stage
    // guard app/api/chat/route.ts already uses.
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return Response.json({ error: 'Payload too large.' }, { status: 413 });
    }

    let body: TrackBody;
    try {
      // Never request.json(): sendBeacon posts text/plain, and json() is
      // content-type sensitive in some runtimes and gives no byte cap.
      body = JSON.parse(text) as TrackBody;
    } catch {
      return refused('bad_json');
    }

    const sessionId =
      typeof body.session_id === 'string' && UUID_RE.test(body.session_id)
        ? body.session_id
        : null;
    if (!sessionId) return refused('bad_session_id');

    const incoming = readEvents(body);
    const events = incoming
      .map(validateEvent)
      .filter((e): e is ValidatedEvent => e !== null);
    if (events.length === 0) return refused('no_events');

    const db = getDb();
    // A first-class state, not an error: the site served with no database at
    // all until this feature landed, and must keep doing so.
    if (!db) return refused('storage_not_configured');

    const salt = process.env.ANALYTICS_IP_SALT;
    if (!salt) {
      if (!warnedNoSalt) {
        warnedNoSalt = true;
        console.warn(
          '[analytics] ANALYTICS_IP_SALT is unset, refusing to ingest. ' +
            'An unsalted hash of the IPv4 space is trivially reversed, so ' +
            'this degrades loudly rather than storing a weak identifier.',
        );
      }
      return refused('no_salt');
    }

    const { ip } = clientIp(request);
    // No address means no budget, and no budget means no write. This is what
    // bounds the abuse surface. See chargeBudget's note on the residual.
    if (!ip) return refused('no_client_ip');

    const ipHash = await hashIp(ip, salt);

    await ensureSchema(db);

    // Charged per event, before any work, exactly as the source system does.
    const budget = await chargeBudget(db, ipHash, events.length, Date.now());
    if (!budget.allowed) return refused('rate_limited');

    cidrs ??= parseCidrList(process.env.ANALYTICS_INTERNAL_CIDRS);
    const attribution = sanitiseAttribution(body.attribution);
    const visitorId = attribution?.visitor_id ?? null;

    const internalVisitors = (process.env.ANALYTICS_INTERNAL_VISITORS ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    const isInternal =
      matchesAnyCidr(ip, cidrs) ||
      (visitorId !== null && internalVisitors.includes(visitorId));

    // Free on a Worker: no provider call, no token, no rate limit, no cache.
    // Lumen needed a two-provider chain and a cache table because Supabase
    // Edge is handed nothing but a country code.
    const cf = (request as CfRequest).cf;
    const geo = {
      country:
        (typeof cf?.country === 'string' ? cf.country : null) ??
        request.headers.get('cf-ipcountry'),
      region: typeof cf?.region === 'string' ? cf.region : null,
      city: typeof cf?.city === 'string' ? cf.city : null,
      asnOrg: typeof cf?.asOrganization === 'string' ? cf.asOrganization : null,
    };

    const { eventRows, pointRows } = buildRows(events, {
      sessionId,
      visitorId,
      ua: classifyUserAgent(request.headers.get('user-agent')),
      ipHash,
      ipPrefix: ipPrefix(ip),
      isInternal,
      geo,
      attribution,
      now: Date.now(),
    });

    await writeBatch(db, eventRows, pointRows);

    // Retention still has to happen if nobody opens the dashboard for a month.
    // after() is genuine ctx.waitUntil under vinext, so the visitor waits for
    // nothing, but it throws outside a request scope, hence the guard.
    if (Math.random() < 0.002) {
      try {
        after(() => sweepIfDue(db, Date.now()));
      } catch {
        void sweepIfDue(db, Date.now());
      }
    }

    return ok(eventRows.length);
  } catch (error) {
    // Swallowed on purpose. Instrumentation must never surface an error to a
    // visitor, and there is nothing they could do about it.
    console.error('[analytics] ingest failed', error);
    return refused('error');
  }
}
