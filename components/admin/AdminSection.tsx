'use client';
/**
 * A titled panel region, and the scroll-spy anchor for the nav.
 *
 * `scroll-mt-2` rather than the source system's `scroll-mt-[68px]`:
 * app/globals.css already sets a global `html { scroll-padding-top: 100px }`
 * that Lumen did not have, so the larger offset would double up and leave
 * a heading stranded a third of the way down the viewport.
 */
import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';

export function AdminSection({
  id,
  title,
  blurb,
  actions,
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id={`${id}-heading`}
            className="font-heading text-lg leading-tight"
          >
            {title}
          </h2>
          {blurb ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
          ) : null}
        </div>
        {actions}
      </div>
      <Separator className="my-3" />
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * What a panel renders when its own request failed.
 *
 * Deliberately not a zeroed panel: an empty funnel and a broken endpoint look
 * identical, and only one of them means nobody visited.
 */
export function PanelError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-xs font-medium text-destructive">
        This panel could not load.
      </p>
      <p className="mt-1 font-mono text-[11px] break-words text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
