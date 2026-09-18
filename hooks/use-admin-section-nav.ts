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

export function useAdminSectionNav(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const edge = edgeSectionId(
          ids,
          window.scrollY,
          window.innerHeight,
          document.documentElement.scrollHeight,
        );
        const picked = edge ?? pickActiveEntry(entries);
        if (picked) setActive(picked);
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
