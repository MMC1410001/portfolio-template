/**
 * The gated read API: one route, one gate, an action switch.
 *
 * POST rather than GET, which is not arbitrary: vinext's router only considers
 * GET/HEAD for cacheable-response admission, so a POST cannot end up in a CDN
 * or a completed-response cache. An admin payload has no business being
 * cacheable.
 *
 * The `whoami` action exists to answer, in one request after a deploy, the two
 * things this repo cannot tell us: whether the D1 binding resolved under the
 * name we wrote, and what `request.cf` actually carries through OpenAI Sites.
 */

import { after } from 'next/server';
import { authorizeAdmin, notFound } from '@/lib/analytics/admin-auth';
import { getDbHandle, ensureSchema } from '@/lib/analytics/db';
import { readWindow } from '@/lib/analytics/time';
import { parseCidrList } from '@/lib/analytics/net';
import { sweepIfDue, sweep } from '@/lib/analytics/retention';
import {
  audience,
  campaigns,
  chatStats,
  clickMap,
  listSessions,
  overview,
  type QueryOptions,
} from '@/lib/analytics/queries';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' } as const;

type CfRequest = Request & { cf?: IncomingRequestCfProperties };

interface Body {
  action?: unknown;
  from?: unknown;
  to?: unknown;
  range?: unknown;
  excludeInternal?: unknown;
  kind?: unknown;
  device?: unknown;
  mode?: unknown;
  limit?: unknown;
}

export async function POST(request: Request) {
  const identity = await authorizeAdmin(request);
  if (!identity) return notFound();

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    /* an empty body is a valid overview request */
  }

  const action = typeof body.action === 'string' ? body.action : 'analytics';
  // The only audit trail there will be, and it is cheap.
  console.log(`[admin] ${action} by ${identity.who} (${identity.via})`);

  const handle = getDbHandle();

  if (action === 'whoami') {
    const cf = (request as CfRequest).cf;
    return Response.json(
      {
        identity,
        db: handle
          ? { resolved: true, binding: handle.binding, via: handle.via }
          : { resolved: false },
        // Which cf keys arrived, not their values, enough to answer whether
        // geo is available in production without logging visitor locations.
        cfKeys: cf ? Object.keys(cf).sort() : [],
        cfCountry:
          (typeof cf?.country === 'string' ? cf.country : null) ??
          request.headers.get('cf-ipcountry'),
        env: {
          adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').filter(Boolean)
            .length,
          hasToken: Boolean(process.env.ADMIN_TOKEN),
          hasIpSalt: Boolean(process.env.ANALYTICS_IP_SALT),
          internalCidrs: parseCidrList(process.env.ANALYTICS_INTERNAL_CIDRS)
            .length,
        },
      },
      { headers: HEADERS },
    );
  }

  // Reported as its own state, never as zeros: an empty panel and a missing
  // database look identical, and only one means nobody visited.
  if (!handle) {
    return Response.json(
      { error: 'storage_not_configured' },
      { status: 503, headers: HEADERS },
    );
  }

  const { db } = handle;
  await ensureSchema(db);

  const options: QueryOptions = {
    window: readWindow({ from: body.from, to: body.to, range: body.range }),
    // Defaults to excluding internal traffic, matching the panel's default.
    excludeInternal: body.excludeInternal !== false,
    cidrsActive: parseCidrList(process.env.ANALYTICS_INTERNAL_CIDRS).length,
    visitorsActive: (process.env.ANALYTICS_INTERNAL_VISITORS ?? '')
      .split(',')
      .filter((v) => v.trim())
      .length,
  };

  try {
    if (action === 'retention-sweep') {
      return Response.json(await sweep(db, Date.now()), { headers: HEADERS });
    }

    // Deterministic and free, and it never delays the dashboard.
    try {
      after(() => sweepIfDue(db, Date.now()));
    } catch {
      void sweepIfDue(db, Date.now());
    }

    switch (action) {
      case 'analytics':
        return Response.json(await overview(db, options), { headers: HEADERS });
      case 'audience':
        return Response.json(await audience(db, options), { headers: HEADERS });
      case 'campaigns':
        return Response.json(await campaigns(db, options), { headers: HEADERS });
      case 'chat':
        return Response.json(await chatStats(db, options), { headers: HEADERS });
      case 'click-map': {
        const kind =
          body.kind === 'dead' || body.kind === 'rage' ? body.kind : 'click';
        return Response.json(
          await clickMap(db, {
            ...options,
            kind,
            device: typeof body.device === 'string' ? body.device : null,
            mode: typeof body.mode === 'string' ? body.mode : null,
          }),
          { headers: HEADERS },
        );
      }
      case 'sessions':
        return Response.json(
          await listSessions(db, {
            ...options,
            limit: Number(body.limit) || 50,
          }),
          { headers: HEADERS },
        );
      default:
        return Response.json(
          { error: 'unknown_action' },
          { status: 400, headers: HEADERS },
        );
    }
  } catch (error) {
    // Surfaced, not zeroed. The panel must be able to say "this failed".
    console.error(`[admin] ${action} failed`, error);
    return Response.json(
      { error: 'query_failed', detail: String(error) },
      { status: 500, headers: HEADERS },
    );
  }
}
