'use client';
/**
 * Click positions drawn over a live copy of the real page.
 *
 * ── Two passes, not one ────────────────────────────────────────────────────
 * Pass 1 accumulates additive greyscale radial gradients; pass 2 walks the
 * pixels and replaces the accumulated alpha with a colour from the ramp. One
 * pass with coloured blobs produces muddy overlaps where two warm areas meet,
 * and the muddiness reads as a third intensity that is not in the data.
 *
 * ── The backdrop is an iframe of the real page ─────────────────────────────
 * No `sandbox` attribute, deliberately: the panel reads `contentDocument` to
 * measure the page and to find section offsets, and `sandbox="allow-scripts"`
 * without `allow-same-origin` gives the frame an opaque origin, at which point
 * the app throws on its first sessionStorage access.
 *
 * The framed page freezes itself: no idle auto-reveal, no dark toggle, no
 * three.js download, no chat launcher, via isHeatmapPreview(). Without that
 * the backdrop mutates while it is being measured.
 *
 * ── What is new here versus the source system ──────────────────────────────
 * A mode toggle, because résumé and Experience mode are different layouts and
 * one merged heatmap over one of them is a lie about half the clicks.
 * A canvas downscale, because this page is 9,000-15,000px tall rather than
 * ~3,000 and `getImageData` on 1440×15000 RGBA is ~86MB.
 * A section ruler, because "y = 8,240px" is meaningless on a page this long.
 * A frame-blocked fallback, because whether the host serves
 * X-Frame-Options/frame-ancestors is not knowable from this repo, and if it
 * does, the coordinates are still the product; only the backdrop is lost.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SECTIONS, sectionLabel } from '@/lib/analytics/section-catalogue';
import type { ClickMap } from '@/lib/analytics/types';
import { heatColour, num, pixels } from './analytics-format';

const DEVICE_WIDTH = { mobile: 390, tablet: 834, desktop: 1440 } as const;
type Device = keyof typeof DEVICE_WIDTH;

/** The scrolling window the stage is viewed through. */
const PREVIEW_VIEWPORT_PX = 520;

/**
 * Height-to-width ratios used only until the frame reports its own height.
 *
 * Provisional and deliberately large: a 390px column of this résumé runs to
 * roughly 13,000px. The UI says when a fallback is in use rather than
 * pretending the number is measured.
 */
const FALLBACK_ASPECT = { mobile: 34, tablet: 16, desktop: 9 } as const;

/**
 * Above this, render at half resolution and CSS-stretch back.
 *
 * Heat blobs are soft radial gradients, so half resolution is visually
 * identical while quartering both the buffer and the getImageData pass.
 */
const MAX_CANVAS_PIXELS = 8_000_000;

/** y bands are absolute pixels in the query, so the renderer must agree. */
const Y_BAND_PX = 24;

const MEASURE_AT = [0, 600, 2000, 5000, 9000] as const;
/** Stop re-measuring once two reads agree this closely. */
const SETTLE_EPSILON_PX = 8;

export function ClickHeatmap({
  data,
  device,
  kind,
  mode,
  loading,
  error,
  onDevice,
  onKind,
  onMode,
  onRefresh,
}: {
  data: ClickMap | null;
  device: Device;
  kind: 'click' | 'dead' | 'rage';
  mode: 'resume' | 'immersive';
  loading: boolean;
  error: string | null;
  onDevice: (d: Device) => void;
  onKind: (k: 'click' | 'dead' | 'rage') => void;
  onMode: (m: 'resume' | 'immersive') => void;
  onRefresh: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [mounted, setMounted] = useState(false);
  const [hidePage, setHidePage] = useState(false);
  /**
   * Measurement, tagged with the layout it belongs to.
   *
   * Device band and mode both change the page's height and its section
   * offsets, so a stale measurement must not survive a switch. Comparing a
   * derived key during render is React's own reset pattern and avoids a
   * setState inside an effect, which the compiler rule rejects, and which
   * would also paint one frame with the previous layout's height.
   */
  const layoutKey = `${device}-${mode}`;
  const [measurement, setMeasurement] = useState<{
    key: string;
    height: number | null;
    blocked: boolean;
    tops: { id: string; top: number }[];
  }>({ key: layoutKey, height: null, blocked: false, tops: [] });

  const current =
    measurement.key === layoutKey
      ? measurement
      : { key: layoutKey, height: null, blocked: false, tops: [] };

  const frameHeight = current.height;
  const frameBlocked = current.blocked;
  const sectionTops = current.tops;

  const deviceWidth = DEVICE_WIDTH[device];
  const measured = frameHeight !== null;
  const height = frameHeight ?? deviceWidth * FALLBACK_ASPECT[device];
  const scale = PREVIEW_VIEWPORT_PX / deviceWidth;

  /** Mount the frame only once the panel is near the viewport. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver !== 'function') {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  /**
   * Measure the framed document's own height.
   *
   * Held in a ref rather than returned from the load handler: React discards
   * whatever an event handler returns, so a cleanup returned from onLoad would
   * never be called, a real bug the source system documents.
   */
  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      doc = null;
    }
    // contentDocument null after load means the host refused to be framed.
    if (!doc) {
      setMeasurement({ key: layoutKey, height: null, blocked: true, tops: [] });
      return;
    }

    const next = Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight ?? 0,
    );

    // Section offsets, read from the frame's own layout. This is what turns
    // "y = 8,240px" into "8,240px, around the certifications".
    const tops: { id: string; top: number }[] = [];
    for (const section of SECTIONS) {
      const el = doc.getElementById(section.id);
      if (el instanceof HTMLElement) {
        tops.push({ id: section.id, top: el.offsetTop });
      }
    }

    setMeasurement((prev) => {
      const key = layoutKey;
      // Settle latch: stop moving once two reads agree, or a lazily loaded
      // image at 9s would shift every already-painted blob.
      const settled =
        prev.key === key &&
        prev.height !== null &&
        Math.abs(prev.height - next) <= SETTLE_EPSILON_PX;
      return {
        key,
        height: settled ? prev.height : next > 0 ? next : prev.height,
        blocked: false,
        tops,
      };
    });
    // Depends on the layout it is measuring, so a switch cannot file a new
    // measurement under the previous device band or mode.
  }, [layoutKey]);

  const onLoad = useCallback(() => {
    clearTimers();
    // A ResizeObserver on the frame's own documentElement is strictly better
    // than timers, but the timer ladder stays as a fallback: this page has two
    // very large images and three webfonts, so height keeps changing for
    // several seconds after load.
    for (const delay of MEASURE_AT) {
      timersRef.current.push(setTimeout(measure, delay));
    }
    try {
      const doc = frameRef.current?.contentDocument;
      const win = frameRef.current?.contentWindow;
      if (doc && win && 'ResizeObserver' in win) {
        const Observer = (
          win as unknown as { ResizeObserver: typeof ResizeObserver }
        ).ResizeObserver;
        const ro = new Observer(() => measure());
        ro.observe(doc.documentElement);
      }
    } catch {
      /* cross-origin, or no ResizeObserver, the timers cover it */
    }
  }, [clearTimers, measure]);

  useEffect(() => clearTimers, [clearTimers]);

  /** Paint. Two passes. See the header. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const pixelScale =
      deviceWidth * height > MAX_CANVAS_PIXELS ? 0.5 : 1;
    const w = Math.max(1, Math.round(deviceWidth * pixelScale));
    const h = Math.max(1, Math.round(height * pixelScale));
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (data.cells.length === 0 || data.maxN === 0) return;

    const radius = Math.max(10, Math.round(w / 28));
    const pixelMode = data.medianDocH > 0;

    // Pass 1, additive greyscale.
    for (const cell of data.cells) {
      const cx = ((cell.x + 0.5) / 40) * w;
      const cy = pixelMode
        ? cell.y * Y_BAND_PX * pixelScale
        : ((cell.y + 0.5) / 200) * h;
      const alpha = Math.min(1, 0.15 + (cell.n / data.maxN) * 0.85);

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pass 2, map accumulated alpha through the ramp.
    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (a === 0) continue;
      const [r, g, b] = heatColour(a / 255);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      // Capped below opaque so the page behind stays readable.
      px[i + 3] = Math.round(Math.min(235, 60 + a * 0.75));
    }
    ctx.putImageData(image, 0, 0);
  }, [data, deviceWidth, height]);

  const pixelMode = (data?.medianDocH ?? 0) > 0;
  const heightDrift =
    measured && data && data.medianDocH > 0
      ? Math.abs(height - data.medianDocH) / data.medianDocH > 0.2
      : false;
  const deepest = data?.cells.reduce(
    (m, c) => Math.max(m, pixelMode ? c.y * Y_BAND_PX : (c.y / 200) * height),
    0,
  );
  const beyondPreview = (deepest ?? 0) > height + Y_BAND_PX;

  const densest = (data?.cells ?? []).slice(0, 6).map((cell) => {
    const y = pixelMode ? cell.y * Y_BAND_PX : (cell.y / 200) * height;
    const nearest = sectionTops
      .filter((s) => s.top <= y)
      .sort((a, b) => b.top - a.top)[0];
    return {
      x: Math.round((cell.x / 40) * 100),
      y,
      n: cell.n,
      section: nearest?.id ?? null,
    };
  });

  const src =
    `/?embed=true&preview=heatmap` +
    (mode === 'immersive' ? '&preview_mode=immersive' : '');

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">Click heatmap</CardTitle>
        <p className="text-xs text-muted-foreground">
          Positions are stored as a fraction of the page, with the height they
          were a fraction of, so a click is placed at its real depth rather
          than at whatever height this preview happens to be.
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={[device]}
            onValueChange={(v: string[]) => v[0] && onDevice(v[0] as Device)}
            variant="outline"
            size="sm"
            aria-label="Device width"
          >
            <ToggleGroupItem value="mobile">Mobile</ToggleGroupItem>
            <ToggleGroupItem value="tablet">Tablet</ToggleGroupItem>
            <ToggleGroupItem value="desktop">Desktop</ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            value={[kind]}
            onValueChange={(v: string[]) =>
              v[0] && onKind(v[0] as 'click' | 'dead' | 'rage')
            }
            variant="outline"
            size="sm"
            aria-label="Click kind"
          >
            <ToggleGroupItem value="click">Clicks</ToggleGroupItem>
            <ToggleGroupItem value="dead">Dead</ToggleGroupItem>
            <ToggleGroupItem value="rage">Rage</ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            value={[mode]}
            onValueChange={(v: string[]) =>
              v[0] && onMode(v[0] as 'resume' | 'immersive')
            }
            variant="outline"
            size="sm"
            aria-label="Layout"
          >
            <ToggleGroupItem value="resume">Résumé</ToggleGroupItem>
            <ToggleGroupItem value="immersive">Experience</ToggleGroupItem>
          </ToggleGroup>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setHidePage((v) => !v)}
          >
            {hidePage ? 'Show page' : 'Hide page'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="outline">
              {num(data?.total ?? 0)} {kind} positions
            </Badge>
            <Badge variant="outline">
              {measured
                ? `page ${pixels(height)}`
                : `estimated ${pixels(height)}`}
            </Badge>
            {data && data.medianDocH > 0 ? (
              <Badge variant="outline">
                visitors saw {pixels(data.medianDocH)}
              </Badge>
            ) : null}
            {heightDrift ? (
              <Badge variant="destructive">
                preview differs from what visitors saw by more than 20%
              </Badge>
            ) : null}
            {beyondPreview ? (
              <Badge variant="destructive">
                some clicks are deeper than this preview renders
              </Badge>
            ) : null}
            {data && data.unclassified > 0 ? (
              <Badge variant="outline">
                {num(data.unclassified)} without a device band
              </Badge>
            ) : null}
            {data && data.otherModeShare > 20 ? (
              <Badge variant="destructive">
                {data.otherModeShare}% of these clicks came from the other
                layout
              </Badge>
            ) : null}
            {!pixelMode && (data?.total ?? 0) > 0 ? (
              <Badge variant="outline">
                depth estimated, no page height recorded
              </Badge>
            ) : null}
          </div>
        )}

        {frameBlocked ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-muted-foreground">
            The page refused to load in a frame, so the heatmap is drawn over a
            blank stage. The positions are unaffected, only the backdrop is
            missing. This is a host header (X-Frame-Options or a frame-ancestors
            policy) and cannot be changed from this repo.
          </p>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row">
          <div
            ref={stageRef}
            className="relative shrink-0 overflow-y-auto rounded-lg border bg-muted"
            style={{ width: PREVIEW_VIEWPORT_PX, height: PREVIEW_VIEWPORT_PX }}
          >
            <div
              className="relative origin-top-left"
              style={{
                width: deviceWidth,
                height,
                transform: `scale(${scale})`,
              }}
            >
              {mounted && !hidePage && !frameBlocked ? (
                <iframe
                  ref={frameRef}
                  src={src}
                  onLoad={onLoad}
                  title="Page preview"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 border-0 opacity-60"
                  style={{ width: deviceWidth, height }}
                />
              ) : null}
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0"
                style={{ width: deviceWidth, height }}
              />
              {/* The ruler. Absolute depths are unreadable without it. */}
              {sectionTops.map((s) => (
                <div
                  key={s.id}
                  className="pointer-events-none absolute left-0 border-t border-dashed border-foreground/25"
                  style={{ top: s.top, width: deviceWidth }}
                >
                  <span className="ml-1 bg-background/80 px-1 text-[9px] text-muted-foreground">
                    {sectionLabel(s.id)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Densest spots
            </p>
            {densest.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No positions recorded for this combination yet.
              </p>
            ) : (
              <ol className="mt-1 flex flex-col gap-1 text-xs">
                {densest.map((spot, i) => (
                  <li
                    key={`${spot.x}-${spot.y}-${i}`}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="truncate text-muted-foreground">
                      {spot.section ? sectionLabel(spot.section) : 'above the first section'}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {spot.x}% / {pixels(spot.y)}
                      <span className="ml-2">{num(spot.n)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <p className="mt-4 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Scale
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-2 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1]
                    .map((t) => {
                      const [r, g, b] = heatColour(t);
                      return `rgb(${r},${g},${b}) ${t * 100}%`;
                    })
                    .join(', ')})`,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
              <span>1</span>
              <span>{num(Math.max(1, Math.round((data?.maxN ?? 1) / 2)))}</span>
              <span>{num(data?.maxN ?? 1)}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Clicks in one 24px band. Colour is relative to the busiest band in
              this view, so two views are not comparable by colour alone.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export type { Device };
