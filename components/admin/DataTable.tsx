'use client';
/**
 * The panel's table: a real table at >= sm, one card per row below it.
 *
 * That split is the valuable part of the port, and the bug it prevents is
 * real: `overflow-hidden` on a table wrapper *clips* rather than scrolls, so
 * the right-hand columns become physically unreachable on a phone. Either
 * scroll deliberately (the `overflow-x-auto` below) or stop pretending it is a
 * table. This does both, at the width where each is right.
 *
 * `renderRow` returns cells only, not the `<tr>`, so sorting and keys stay
 * this component's business.
 */
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import {
  ariaSort,
  useTableSort,
  type Sortable,
  type SortState,
} from './table-sort';

export interface DataColumn<T> {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  sortValue?: (row: T) => Sortable;
  descFirst?: boolean;
  /** Required when `label` is JSX, the sort button needs a readable name. */
  sortLabel?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  renderRow,
  renderCard,
  defaultSort,
  empty,
  emptyHint,
  maxHeightClass,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  renderRow: (row: T, i: number) => ReactNode;
  renderCard: (row: T, i: number) => ReactNode;
  defaultSort?: SortState;
  empty?: string;
  emptyHint?: string;
  maxHeightClass?: string;
}) {
  const { rows: sorted, sort, toggle } = useTableSort(
    rows,
    columns,
    defaultSort,
  );

  if (rows.length === 0) {
    return (
      // ui/empty, not a zero row: "no rows" and "the request failed" must not
      // render the same way.
      <Empty className="border border-dashed py-8">
        <EmptyTitle className="text-sm">
          {empty ?? 'Nothing recorded yet'}
        </EmptyTitle>
        {emptyHint ? (
          <EmptyDescription className="text-xs">{emptyHint}</EmptyDescription>
        ) : null}
      </Empty>
    );
  }

  return (
    <>
      <div
        className={cn(
          'hidden overflow-x-auto rounded-lg border sm:block',
          maxHeightClass && `${maxHeightClass} overflow-y-auto`,
        )}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  aria-sort={ariaSort(sort, col.key)}
                  className={cn(
                    'text-[11px] tracking-wide uppercase',
                    col.align === 'right' && 'text-right',
                    col.className,
                  )}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      aria-label={`Sort by ${col.sortLabel ?? col.key}`}
                    >
                      {col.label}
                      <span aria-hidden="true" className="text-[9px]">
                        {sort?.key === col.key
                          ? sort.dir === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row, i) => (
              <TableRow key={rowKey(row, i)}>{renderRow(row, i)}</TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 sm:hidden">
        {sorted.map((row, i) => (
          <li key={rowKey(row, i)} className="rounded-lg border p-3 text-xs">
            {renderCard(row, i)}
          </li>
        ))}
      </ul>
    </>
  );
}

/** A right-aligned numeric cell. Monospace so columns of digits line up. */
export function NumCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell
      className={cn('text-right font-mono tabular-nums', className)}
    >
      {children}
    </TableCell>
  );
}

export { TableCell };
