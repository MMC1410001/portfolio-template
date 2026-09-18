/**
 * Column sorting, comparator and state, ported verbatim.
 *
 * The highest-fidelity port in the set, because it is pure logic that was
 * already debugged once. Split from the components so mixing exported
 * functions and components in one file cannot break Fast Refresh.
 */

import { useCallback, useMemo, useState } from 'react';

export type Sortable = string | number | boolean | null | undefined;
export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

const isBlank = (v: Sortable) => v === null || v === undefined || v === '';

/**
 * Compare two present values, ascending.
 *
 * Strings compare numeric-aware: `localeCompare(…, { numeric: true })` is what
 * orders `192.168.0.9` before `192.168.0.63` rather than after it because
 * "6" < "9", which matters here for the /24 prefixes in the sessions table.
 * `sensitivity: 'base'` keeps "alice" and "Alice" in one alphabet.
 */
export function compareValues(a: Sortable, b: Sortable): number {
  if (isBlank(a) && isBlank(b)) return 0;
  if (isBlank(a)) return 1;
  if (isBlank(b)) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(a) - Number(b);
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Compare with direction applied, and blanks pinned to the bottom either way.
 *
 * Its own function because the obvious implementation is wrong: negating a
 * whole ascending comparator for descending negates the blank rule along with
 * everything else, floating every empty cell to the top. A missing city is
 * absent, not "greater than" every city, so it belongs at the end of both
 * orders. The source system's first version multiplied by the direction factor
 * and did exactly that, caught by a test, not by reading.
 */
export function compareDirectional(
  a: Sortable,
  b: Sortable,
  dir: SortDir,
): number {
  if (isBlank(a) && isBlank(b)) return 0;
  if (isBlank(a)) return 1;
  if (isBlank(b)) return -1;
  return compareValues(a, b) * (dir === 'asc' ? 1 : -1);
}

export interface SortableColumn<T> {
  key: string;
  /** Omit to leave the column unsortable. */
  sortValue?: (row: T) => Sortable;
  /**
   * Start descending on first click. Right for counts and dates, "most" and
   * "newest" are what you actually want, and making the operator click twice
   * for it on every visit is a small tax on every visit.
   */
  descFirst?: boolean;
}

/**
 * Sort state plus the sorted rows.
 *
 * Clicking a header cycles through three states, not two: first direction,
 * opposite, then off. Off matters, the server's own order is meaningful
 * (every list comes back ranked) and without a way back you cannot return to
 * it short of reloading.
 */
export function useTableSort<T>(
  rows: T[],
  columns: SortableColumn<T>[],
  initial?: SortState,
) {
  const [sort, setSort] = useState<SortState | null>(initial ?? null);

  const byKey = useMemo(() => {
    const map = new Map<string, SortableColumn<T>>();
    for (const c of columns) map.set(c.key, c);
    return map;
  }, [columns]);

  const toggle = useCallback(
    (key: string) => {
      const col = byKey.get(key);
      if (!col?.sortValue) return;
      const firstDir: SortDir = col.descFirst ? 'desc' : 'asc';

      setSort((prev) => {
        if (prev?.key !== key) return { key, dir: firstDir };
        if (prev.dir === firstDir) {
          return { key, dir: firstDir === 'asc' ? 'desc' : 'asc' };
        }
        return null;
      });
    },
    [byKey],
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const get = byKey.get(sort.key)?.sortValue;
    if (!get) return rows;

    // Copy: sorting `rows` in place would mutate the caller's state array.
    // Array.prototype.sort is stable, so equal keys keep the server's order.
    return [...rows].sort((a, b) =>
      compareDirectional(get(a), get(b), sort.dir),
    );
  }, [rows, sort, byKey]);

  return { rows: sortedRows, sort, setSort, toggle, sortable: byKey };
}

/** `aria-sort` for a <th>, so the sort is announced rather than only drawn. */
export function ariaSort(
  sort: SortState | null,
  key: string,
): 'ascending' | 'descending' | 'none' {
  if (sort?.key !== key) return 'none';
  return sort.dir === 'asc' ? 'ascending' : 'descending';
}
