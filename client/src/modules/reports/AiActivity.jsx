// "AI features" section of the Reports page (Misbah): how much the AI Assistant and AI Recommendation
// are used, and the question log so admins can review the answers (FR-AI-08, FR-AI-09).
// Data: GET /api/reports/ai?from&to&feature&search&page
import { useEffect, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Bot, ChevronLeft, ChevronRight, MessageSquareText, Search, Sparkles, Users, Wand2 } from 'lucide-react';
import api from '../../api/client';
import {
  Button, DotPill, ErrorBox, Input, NativeSelect, NativeSelectOption, SectionTitle, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, TableSkeleton,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { Tile, Panel, Empty } from './parts';
import { barData, barOptions, doughnutData, doughnutOptions, useChartTheme } from './charts';
import { fmtDate } from './format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (p, unit) => (unit === 'month'
  ? `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`
  : `${Number(p.slice(8, 10))} ${MONTHS[Number(p.slice(5, 7)) - 1]}`);
const time = (v) => String(v).slice(11, 16);

function FeaturePill({ feature, source }) {
  if (feature === 'Assistant') return <DotPill tone="brand">Assistant</DotPill>;
  return <DotPill tone={source === 'ai' ? 'lime' : 'neutral'}>{source === 'rules' ? 'Recommend · rules' : 'Recommend · AI'}</DotPill>;
}

export default function AiActivity({ range }) {
  const t = useChartTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feature, setFeature] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  // The page number belongs to one period + filter; changing either starts again at page 1.
  const filterKey = `${range[0]}|${range[1]}|${feature}|${query}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (n) => setPaging({ key: filterKey, page: n });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ from: range[0], to: range[1], page: String(page) });
    if (feature) q.set('feature', feature);
    if (query) q.set('search', query);
    api.get(`/reports/ai?${q}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, feature, query, page]);

  if (!data) {
    return (
      <>
        <SectionTitle>AI features</SectionTitle>
        <ErrorBox error={error} />
        {!error && <TableSkeleton rows={3} />}
      </>
    );
  }

  const pages = Math.max(1, Math.ceil(data.matching / data.pageSize));
  const first = data.matching ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = Math.min(data.page * data.pageSize, data.matching);
  const rec = data.recommendationSource;

  return (
    <>
      <SectionTitle>AI features</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile value={data.total} label="AI requests" color="navy" icon={Sparkles} note="Assistant and recommendation together" />
        <Tile value={data.byFeature.Assistant} label="Assistant questions" color="blue" icon={Bot} />
        <Tile value={data.byFeature.Recommendation} label="Recommendations" color="green" icon={Wand2} note={`${rec.ai} ranked by AI, ${rec.rules} by rules`} />
        <Tile value={data.activeUsers} label="People using AI" color="amber" icon={Users} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={`AI requests per ${data.timeline.unit}`} icon={Sparkles} description="Both AI features, from the chat log">
          {data.total === 0 ? (
            <Empty icon={Sparkles}>Nobody used the AI features in this period.</Empty>
          ) : (
            <div className="h-64">
              <Bar
                aria-label={`Bar chart of AI requests per ${data.timeline.unit}`}
                options={barOptions(t, { unit: 'request' })}
                data={barData(t, data.timeline.points.map((p) => label(p.period, data.timeline.unit)), data.timeline.points.map((p) => p.times), { color: t.series[1] })}
              />
            </div>
          )}
        </Panel>
        <Panel title="How recommendations were ranked" icon={Wand2} description="By Claude, or by keyword rules when the AI was off or slow">
          {data.byFeature.Recommendation === 0 ? (
            <Empty icon={Wand2}>No recommendations in this period.</Empty>
          ) : (
            <div className="space-y-4">
              <div className="relative mx-auto h-44 max-w-44">
                <Doughnut
                  aria-label="Ring chart of recommendations ranked by AI and by rules"
                  options={doughnutOptions(t)}
                  data={doughnutData(t, [{ label: 'Ranked by AI', value: rec.ai, tone: 'brand' }, { label: 'Rule-based', value: rec.rules, tone: 'neutral' }])}
                />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl font-medium tabular-nums">{Math.round((rec.ai / data.byFeature.Recommendation) * 100)}%</span>
                  <span className="text-muted-foreground text-xs">by AI</span>
                </div>
              </div>
              <div className="flex justify-center gap-2">
                <DotPill tone="brand">AI {rec.ai}</DotPill>
                <DotPill tone="neutral">Rules {rec.rules}</DotPill>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        flush
        title="Question log"
        icon={MessageSquareText}
        count={data.matching}
        description="What people asked and what the AI answered. Logs are deleted after 90 days."
      >
        <form
          className="flex flex-wrap items-end gap-2 px-6 pb-4"
          onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
        >
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search questions, answers or people"
              placeholder="Search questions, answers or people"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="flex-1 sm:w-48 sm:flex-none">
              <NativeSelect aria-label="Feature" value={feature} onChange={(e) => setFeature(e.target.value)}>
                <NativeSelectOption value="">All features</NativeSelectOption>
                <NativeSelectOption value="Assistant">Assistant</NativeSelectOption>
                <NativeSelectOption value="Recommendation">Recommendation</NativeSelectOption>
              </NativeSelect>
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </div>
        </form>
        <ErrorBox error={error} />
        {data.items.length === 0 ? (
          <Empty icon={MessageSquareText}>{query || feature ? 'Nothing matches this search.' : 'No AI questions in this period.'}</Empty>
        ) : (
          <div className={cn('transition-opacity', loading && 'opacity-60')}>
            <Table>
              <TableHeader>
                <TableRow><TableHead>When</TableHead><TableHead>Person</TableHead><TableHead>Feature</TableHead><TableHead>Question or need</TableHead><TableHead>Answer</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.chat_id} className="align-top">
                    <TableCell className="whitespace-nowrap"><p>{fmtDate(row.created_at)}</p><p className="text-muted-foreground text-xs tabular-nums">{time(row.created_at)}</p></TableCell>
                    <TableCell className="whitespace-nowrap"><p className="font-medium">{row.user_name}</p><p className="text-muted-foreground text-xs">{row.role}</p></TableCell>
                    <TableCell><FeaturePill feature={row.feature} source={row.source} /></TableCell>
                    <TableCell className="max-w-72 min-w-56 whitespace-normal"><p className="line-clamp-3 text-sm" title={row.prompt}>{row.prompt}</p></TableCell>
                    <TableCell className="max-w-96 min-w-64 whitespace-normal"><p className="text-muted-foreground line-clamp-3 text-sm" title={row.answer}>{row.answer}</p></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data.matching > 0 && (
          <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
            <p className="text-muted-foreground text-xs">Showing {first} to {last} of {data.matching} {data.matching === 1 ? 'entry' : 'entries'}</p>
            <div className="flex gap-1.5">
              <Button size="icon-sm" variant="outline" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
              <Button size="icon-sm" variant="outline" aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
