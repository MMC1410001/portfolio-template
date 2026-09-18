'use client';
/**
 * One number, its label, and optionally what qualifies it.
 *
 * `note` is not decoration. Several figures here mean something other than
 * what their name suggests, "shallow" is not the bounce rate a reader
 * expects, "new visitors" depends on a 180-day horizon, and the qualifier is
 * what stops the number being quoted without it.
 */
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatTile({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: 'default' | 'muted' | 'warn';
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p
          className={cn(
            'mt-1 font-mono text-2xl leading-tight tabular-nums',
            tone === 'muted' && 'text-muted-foreground',
            tone === 'warn' && 'text-destructive',
          )}
        >
          {value}
        </p>
        {note ? (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
