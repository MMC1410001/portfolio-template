'use client';
/**
 * Which panel section is currently on screen, for the nav highlight.
 *
 * Two behaviours ported from the source system because both were bugs there
 * first:
 *
 * `pickActiveEntry`: take the TOPMOST intersecting entry, not the last one in
 * the callback's array. Setting the active id for every intersecting entry
 * means the last entry wins, which is the *lower* section rather than the one
 * being read.
 *
 * `edgeSectionId`: at the very top and very bottom of the scroll range, snap
 * to the first and last section. A short final panel may never occupy the
 * observer's band at all, so without this the highlight sticks on the
 * second-to-last section however far you scroll.
 *
 * Note this uses a *top-weighted* band (`-15% 0px -70%`), unlike the dwell
 * observer in lib/analytics/sections.ts which uses a centre band. Different
 * questions: a highlight should follow the heading you have just passed, while
 * a dwell measurement should credit whichever section fills the screen.
 */
import { useEffect, useState } from 'react';

export function pickActiveEntry(
  entries: IntersectionObserverEntry[],
): string | null {
  const visible = entries
    .filter((e) => e.isIntersecting)
    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
  return visible[0]?.target.id ?? null;
}

export function edgeSectionId(
  ids: readonly string[],
  scrollY: number,
  viewportH: number,
  docH: number,
): string | null {
  if (ids.length === 0) return null;
  if (scrollY <= 4) return ids[0];
  if (scrollY + viewportH >= docH - 4) return ids[ids.length - 1];
  return null;
}

/**
 * Keyed on the ids' *contents*, not the array's identity. Callers pass
 * ADMIN_SECTION_IDS, a module constant, but an inline `.map(...)` is the
 * natural thing to write and it rebuilt the observer on every render, so the
 * effect no longer depends on the caller getting that right.
 */
export function useAdminSectionNav(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('\n');

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const watched = key ? key.split('\n') : [];

    const observer = new IntersectionObserver(
      (entries) => {
        const edge = edgeSectionId(
          watched,
          window.scrollY,
          window.innerHeight,
          document.documentElement.scrollHeight,
        );
        const picked = edge ?? pickActiveEntry(entries);
        if (picked) setActive(picked);
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );

    for (const id of watched) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    /**
     * The snap, on scroll as well. The observer only calls back when a
     * section crosses its band, and reaching the very bottom of the page past
     * a short last panel crosses nothing, so the edge rule above never ran at
     * the one moment it exists for. rAF-throttled: one check per frame however
     * many scroll events arrive, and passive, since it never cancels one.
     */
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const edge = edgeSectionId(
          watched,
          window.scrollY,
          window.innerHeight,
          document.documentElement.scrollHeight,
        );
        if (edge) setActive(edge);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [key]);

  return active;
}
