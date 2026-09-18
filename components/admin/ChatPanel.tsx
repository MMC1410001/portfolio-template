'use client';
/**
 * The chatbot panel, new here; the source system had no equivalent.
 *
 * The headline is **coverage gap**: the share of answers that came back "Not
 * documented". It is the one number on the whole dashboard that produces a
 * to-do list, because every unmatched question with text is a row to add to
 * content/faq.ts.
 *
 * Backend health is a separate card on purpose. It is written server-side by
 * /api/chat, which is the only thing that knows whether the Python service
 * answered; everything else here is captured in the browser, because Chat.tsx
 * answers locally on failure and a server-only capture would miss exactly that
 * case. Two writers, two namespaces, nothing double-counted.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChatStats } from '@/lib/analytics/types';
import { DataTable, NumCell, TableCell } from './DataTable';
import { Breakdown } from './Breakdown';
import { StatTile } from './StatTile';
import { num, pct, ratio } from './analytics-format';

const dailyConfig = {
  asked: { label: 'Asked', color: 'var(--chart-1)' },
  unmatched: { label: 'Not documented', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function ChatPanel({ data }: { data: ChatStats }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Coverage gap"
          value={`${data.coverageGapPct}%`}
          note="Answers the guide could not document, the to-do list"
          tone={data.coverageGapPct > 25 ? 'warn' : 'default'}
        />
        <StatTile
          label="Questions asked"
          value={num(data.asked)}
          note={`${num(data.opened)} opened the panel`}
        />
        <StatTile
          label="Opened, asked nothing"
          value={pct(ratio(data.abandoned, data.opened))}
          note="Read the greeting and left"
        />
        <StatTile
          label="Answered offline"
          value={`${data.offlinePct}%`}
          note="The browser answered because the request failed"
          tone={data.offlinePct > 5 ? 'warn' : 'default'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Guard hits"
          value={`${data.guardHitPct}%`}
          note="Off-topic, abusive, or probing for secrets"
        />
        <StatTile
          label="Median answer time"
          value={`${num(data.medianLatencyMs)}ms`}
          note="As the visitor experienced it"
        />
        <StatTile
          label="Answers served"
          value={num(data.answered)}
        />
        <StatTile
          label="Text kept for"
          value={`${data.questionTextRetentionDays} days`}
          note={`Counts and rates keep ${data.meta.retentionDays} days`}
          tone="muted"
        />
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">
            Questions per day
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <ChartContainer
            config={dailyConfig}
            className="aspect-auto h-48 w-full"
          >
            <BarChart data={data.daily} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.25} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(v: string) => v.slice(5)}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={28}
                fontSize={11}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* Rounded data-ends anchored to the baseline, and a 2px gap
                  between the two series so adjacent fills stay separate. */}
              <Bar
                dataKey="asked"
                name="Asked"
                fill="var(--color-asked)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="unmatched"
                name="Not documented"
                fill="var(--color-unmatched)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">
            Questions the guide could not answer
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Each of these is a candidate entry for{' '}
            <code className="font-mono">content/faq.ts</code>. Text is
            normalised and screened before storage: anything containing an
            email, a long number or a link is dropped whole rather than
            scrubbed, so some rows here will be blank by design.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.unmatchedQuestions}
            rowKey={(r, i) => `${r.question}-${i}`}
            defaultSort={{ key: 'asks', dir: 'desc' }}
            columns={[
              {
                key: 'question',
                label: 'Question',
                sortValue: (r) => r.question,
              },
              {
                key: 'asks',
                label: 'Times asked',
                align: 'right',
                sortValue: (r) => r.asks,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell>{r.question || '(text withheld)'}</TableCell>
                <NumCell>{num(r.asks)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p>{r.question || '(text withheld)'}</p>
                <p className="mt-0.5 text-muted-foreground">
                  asked {num(r.asks)}×
                </p>
              </>
            )}
            empty="Nothing unanswered"
            emptyHint="Either good coverage, or not enough questions yet."
          />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Top questions</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.topQuestions}
            rowKey={(r, i) => `${r.question}-${i}`}
            defaultSort={{ key: 'asks', dir: 'desc' }}
            columns={[
              {
                key: 'question',
                label: 'Question',
                sortValue: (r) => r.question,
              },
              {
                key: 'asks',
                label: 'Times asked',
                align: 'right',
                sortValue: (r) => r.asks,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell>{r.question || '(text withheld)'}</TableCell>
                <NumCell>{num(r.asks)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p>{r.question || '(text withheld)'}</p>
                <p className="mt-0.5 text-muted-foreground">
                  asked {num(r.asks)}×
                </p>
              </>
            )}
            empty="No questions yet"
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Breakdown title="Answer sources" rows={data.sources} />
        <Breakdown
          title="Request failures"
          rows={data.failures}
          empty="No failed requests."
        />
        <Breakdown
          title="Text withheld, by reason"
          rows={data.rejections}
          empty="No question text was withheld."
        />
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Backend health</CardTitle>
          <p className="text-xs text-muted-foreground">
            Counted server-side, with no question text. Separate from the
            numbers above so the two can never double-count. Zero rows means
            the optional Python service is not configured, which is the default.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.backend}
            rowKey={(r) => r.day}
            defaultSort={{ key: 'day', dir: 'desc' }}
            columns={[
              { key: 'day', label: 'Day', sortValue: (r) => r.day },
              {
                key: 'requests',
                label: 'Requests',
                align: 'right',
                sortValue: (r) => r.requests,
                descFirst: true,
              },
              {
                key: 'ok',
                label: 'Backend OK',
                align: 'right',
                sortValue: (r) => r.backendOk,
                descFirst: true,
              },
              {
                key: 'fail',
                label: 'Backend failed',
                align: 'right',
                sortValue: (r) => r.backendFail,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell className="font-mono text-xs">{r.day}</TableCell>
                <NumCell>{num(r.requests)}</NumCell>
                <NumCell>{num(r.backendOk)}</NumCell>
                <NumCell
                  className={r.backendFail > 0 ? 'text-destructive' : ''}
                >
                  {num(r.backendFail)}
                </NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-mono">{r.day}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {num(r.requests)} requests · {num(r.backendOk)} ok ·{' '}
                  {num(r.backendFail)} failed
                </p>
              </>
            )}
            empty="No server-side chat requests recorded"
            emptyHint="The built-in guide answers without a backend."
          />
        </CardContent>
      </Card>
    </>
  );
}
