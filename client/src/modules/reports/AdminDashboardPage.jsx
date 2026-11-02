// Owner: Misbah. Route: /admin (registered in src/routes.jsx - do not rename this file or its export).
// Admin Dashboard (FR-RP-01, FR-RP-02, FR-BR-05, SRS 2.2): asset counts per status, what needs attention,
// most-used assets, a maintenance summary, overdue items and pending requests (approve or reject in place).
// Data: GET /api/reports/summary, plus GET /api/reports/usage and /maintenance for the last five weeks
// (trend line, weekday heatmap, top assets, maintenance; the page still works if those calls fail).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  ArrowLeftRight, ArrowUpRight, BellRing, CalendarDays, CheckCircle2, ChevronRight, MoreHorizontal, PartyPopper, RefreshCw, Trophy,
  TrendingUp, Wrench,
} from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, AvatarFallback, Badge, BarStrip, Button, CardLink, DotPill, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  ErrorBox, Heatmap, Page, Skeleton, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui';
import { initials } from '../../components/Layout';
import { cn } from '@/lib/utils';
import { Panel, Empty } from './parts';
import { lineData, lineOptions, useChartTheme } from './charts';
import { fmtDate, fmtMoney, plural, todayISO } from './format';
import QuickDecision from './QuickDecision';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKS = 5;

// Status segments for the bar strip, brightest first.
const STATUS_STRIP = [
  { status: 'Available', label: 'Available', shade: 'var(--chart-1)' },
  { status: 'Borrowed', label: 'Borrowed', shade: 'oklch(0.7 0.2 293)' },
  { status: 'Reserved', label: 'Reserved', shade: 'oklch(0.8 0.1 293)' },
  { status: 'Under Maintenance', label: 'Maintenance', shade: 'oklch(0.5 0.16 293)' },
  { status: 'Retired', label: 'Retired', shade: 'oklch(0.45 0.02 286)' },
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Monday of the week WEEKS-1 weeks ago, so the heatmap shows WEEKS full rows ending this week.
function heatmapStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * (WEEKS - 1));
  return d;
}

function buildActivity(usage, start) {
  const byDay = Object.fromEntries((usage?.timeline.unit === 'day' ? usage.timeline.points : []).map((p) => [p.period, p.times]));
  const today = todayISO();
  const rows = Array.from({ length: WEEKS }, (_, w) => {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + 7 * w);
    const cells = WEEKDAYS.map((_, d) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + d);
      const key = iso(day);
      return key > today ? null : byDay[key] ?? 0;
    });
    return { label: shortDate(weekStart), start: weekStart, cells };
  });
  const points = usage?.timeline.unit === 'day' ? usage.timeline.points : [];
  const values = points.map((p) => p.times);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return {
    rows,
    labels: points.map((p) => shortDate(new Date(`${p.period}T00:00:00`))),
    values,
    average: values.map(() => Math.round(avg * 100) / 100),
    total: usage?.totalBorrowings ?? 0,
  };
}

function greetingName(name = '') {
  const [first, ...rest] = name.split(' ');
  return { first, rest: rest.join(' ') };
}

function Person({ name, sub }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9">
        <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary dark:text-[oklch(0.82_0.12_293)]">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        {sub && <p className="text-muted-foreground max-w-56 truncate text-xs">{sub}</p>}
      </div>
    </div>
  );
}

function Hero({ data, updatedAt }) {
  const available = data.statusCounts.Available ?? 0;
  const pct = data.totalAssets ? Math.round((available / data.totalAssets) * 100) : 0;
  const items = STATUS_STRIP.map((s) => ({ label: s.label, value: data.statusCounts[s.status] ?? 0, shade: s.shade }));

  return (
    <div className="grid gap-10 py-2 lg:grid-cols-[minmax(17rem,0.8fr)_2.2fr] lg:gap-12">
      <div className="flex flex-col justify-between gap-6">
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">Total assets</p>
          <p className="font-display flex items-start gap-3 text-7xl leading-none font-medium tracking-tight tabular-nums">
            {data.totalAssets}
            <span className="text-success mt-1 text-sm font-normal tracking-normal">+{pct}% free</span>
          </p>
          <p className="text-muted-foreground text-sm">
            Available to borrow: <span className="text-foreground font-semibold">{available}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to="/admin/approvals">Approvals <ArrowUpRight /></Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/borrowing">Issue / Return <ArrowLeftRight /></Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More admin pages"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem asChild><Link to="/admin/assets">Manage assets</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/admin/maintenance">Maintenance</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/admin/users">Users</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-3">
        <BarStrip items={items} total={data.totalAssets} marker={`${data.activeBorrowings} out now`} />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>Assets by status</span>
          <span>{updatedAt ? `Live · updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'}</span>
        </div>
      </div>
    </div>
  );
}

function Attention({ data }) {
  const rows = [
    { label: 'Pending requests', area: 'Approvals', tone: 'warning', value: data.pendingRequests.length, to: '/admin/approvals' },
    { label: 'Overdue items', area: 'Borrowing', tone: 'danger', value: data.overdue.length, to: '/admin/borrowing' },
    { label: 'Due back today', area: 'Borrowing', tone: 'info', value: data.dueToday, to: '/admin/borrowing' },
    { label: 'Currently borrowed', area: 'Borrowing', tone: 'brand', value: data.activeBorrowings, to: '/admin/borrowing' },
    { label: 'Open maintenance', area: 'Repairs', tone: 'warning', value: data.openMaintenance, to: '/admin/maintenance' },
    { label: 'Active members', area: 'Users', tone: 'success', value: data.activeMembers, to: '/admin/users' },
  ];
  return (
    <ul className="-mx-2">
      {rows.map((r) => (
        <li key={r.label}>
          <Link to={r.to} className="group hover:bg-secondary/60 grid grid-cols-[1fr_auto_3rem_1rem] items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors">
            <span className="truncate text-sm font-medium">{r.label}</span>
            <DotPill tone={r.tone}>{r.area}</DotPill>
            <span className="font-display text-right text-lg font-medium tabular-nums">{r.value}</span>
            <ChevronRight className="text-muted-foreground group-hover:text-foreground size-4 transition-colors" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Trend({ activity }) {
  const t = useChartTheme();
  if (!activity.values.length) return <Empty icon={TrendingUp}>No usage data to chart yet.</Empty>;
  return (
    <div className="space-y-4">
      <div className="text-muted-foreground flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="bg-highlight size-2.5 rounded-[3px]" /> Borrowings</span>
        <span className="flex items-center gap-1.5"><span className="bg-muted-foreground/60 size-2.5 rounded-[3px]" /> Daily average</span>
        <span className="text-foreground ml-auto font-medium">{activity.total} in {WEEKS} weeks</span>
      </div>
      <div className="h-52">
        <Line
          aria-label="Line chart of borrowings per day over the last five weeks"
          data={lineData(t, activity.labels, [
            { label: 'Borrowings', values: activity.values },
            { label: 'Average', values: activity.average, dashed: true },
          ])}
          options={lineOptions(t)}
        />
      </div>
    </div>
  );
}

// Most-used assets in the last five weeks, with a bar for each relative to the top one.
function TopAssets({ usage }) {
  const top = (usage?.mostUsed ?? []).slice(0, 5);
  if (!top.length) return <Empty icon={Trophy}>No assets were borrowed in the last {WEEKS} weeks.</Empty>;
  const max = top[0].times || 1;
  return (
    <ol className="space-y-3.5">
      {top.map((a, i) => (
        <li key={a.asset_id} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3">
          <span className={cn('flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums', i < 3 ? 'bg-highlight text-highlight-foreground' : 'bg-secondary text-muted-foreground')}>
            {i + 1}
          </span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="text-muted-foreground shrink-0 text-xs">{a.category}</p>
            </div>
            <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
              <div className="from-primary h-full rounded-full bg-gradient-to-r to-[oklch(0.78_0.15_293)]" style={{ width: `${Math.max(6, (a.times / max) * 100)}%` }} />
            </div>
          </div>
          <span className="font-display w-8 text-right text-lg font-medium tabular-nums">{a.times}</span>
        </li>
      ))}
    </ol>
  );
}

// Maintenance summary: records reported in the last five weeks, plus everything still open now.
function MaintenanceSummary({ maint, openNow }) {
  if (!maint) return <Empty icon={Wrench}>The maintenance summary could not be loaded.</Empty>;
  const stats = [
    { label: 'Open now', value: openNow, tone: 'warning' },
    { label: 'Reported', value: maint.total, tone: 'brand' },
    { label: 'Repaired', value: maint.repaired, tone: 'success' },
    { label: 'Retired', value: maint.retired, tone: 'neutral' },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-secondary/60 rounded-2xl px-3.5 py-3">
            <DotPill tone={s.tone} className="bg-transparent px-0 py-0">{s.label}</DotPill>
            <p className="font-display mt-1.5 text-2xl font-medium tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-muted-foreground text-xs">Repair cost, last {WEEKS} weeks</p>
          <p className="font-display text-3xl font-medium tracking-tight tabular-nums">{fmtMoney(maint.totalCost)}</p>
        </div>
        {maint.byAsset[0]?.cost > 0 && (
          <p className="text-muted-foreground max-w-[55%] text-right text-xs">
            Highest: <span className="text-foreground font-medium">{maint.byAsset[0].name}</span> ({fmtMoney(maint.byAsset[0].cost)})
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_2.2fr]">
        <Skeleton className="h-52 rounded-3xl" />
        <Skeleton className="h-52 rounded-3xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-3xl" />)}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState(() => buildActivity(null, heatmapStart()));
  const [usage, setUsage] = useState(null);
  const [maint, setMaint] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = heatmapStart();
    const period = `from=${iso(start)}&to=${todayISO()}`;
    const usageCall = api.get(`/reports/usage?${period}`).catch(() => null);
    const maintCall = api.get(`/reports/maintenance?${period}`).catch(() => null);
    try {
      setData(await api.get('/reports/summary'));
      const [u, m] = await Promise.all([usageCall, maintCall]);
      setActivity(buildActivity(u, start));
      setUsage(u);
      setMaint(m);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { first, rest } = greetingName(user?.name);

  return (
    <Page
      title="Welcome back,"
      accent={[first, rest].filter(Boolean).join(' ')}
      actions={
        <>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
          <Button asChild variant="brand">
            <Link to="/admin/reports">View reports <ArrowUpRight /></Link>
          </Button>
        </>
      }
    >
      <ErrorBox error={error} />
      {!data && loading && <DashboardSkeleton />}

      {data && (
        <>
          <Hero data={data} updatedAt={updatedAt} />

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Panel title="Borrowing trend" icon={TrendingUp} action={<CardLink to="/admin/reports" label="Open reports" />}>
              <Trend activity={activity} />
            </Panel>
            <Panel title="Activity by day" icon={CalendarDays} action={<CardLink to="/admin/reports" label="Open reports" />}>
              <Heatmap
                columns={WEEKDAYS}
                rows={activity.rows}
                formatTitle={(row, i, v) => {
                  const d = new Date(row.start);
                  d.setDate(d.getDate() + i);
                  return `${fmtDate(iso(d))}: ${plural(v, 'borrowing')}`;
                }}
              />
            </Panel>
            <Panel title="Needs attention" icon={BellRing} className="lg:col-span-2 xl:col-span-1">
              <Attention data={data} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Most-used assets" icon={Trophy} description={`Times borrowed in the last ${WEEKS} weeks`} action={<CardLink to="/admin/reports" label="Open reports" />}>
              <TopAssets usage={usage} />
            </Panel>
            <Panel title="Maintenance" icon={Wrench} description="Problems reported and repair costs" action={<CardLink to="/admin/maintenance" label="Open maintenance" />}>
              <MaintenanceSummary maint={maint} openNow={data.openMaintenance} />
            </Panel>
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Panel
              flush
              title="Overdue items"
              count={data.overdue.length}
              description="Borrowed assets that should have come back"
              action={<Button asChild variant="secondary" size="sm"><Link to="/admin/borrowing">Record a return <ArrowUpRight /></Link></Button>}
            >
              {data.overdue.length === 0 ? (
                <Empty icon={PartyPopper}>Nothing is overdue. Every borrowed asset is on time.</Empty>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Member</TableHead><TableHead>Due</TableHead><TableHead>Late by</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.overdue.map((o) => (
                      <TableRow key={o.borrow_id}>
                        <TableCell><p className="font-medium">{o.asset_name}</p><p className="text-muted-foreground font-mono text-xs">{o.asset_tag}</p></TableCell>
                        <TableCell><Person name={o.user_name} sub={o.user_email} /></TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(o.due_date)}</TableCell>
                        <TableCell><Badge variant="danger">{plural(o.days_overdue, 'day')}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>

            <Panel
              flush
              title="Pending requests"
              count={data.pendingRequests.length}
              description="Approve or reject right here, or open Approvals"
              action={<Button asChild variant="secondary" size="sm"><Link to="/admin/approvals">Review <ArrowUpRight /></Link></Button>}
            >
              {data.pendingRequests.length === 0 ? (
                <Empty icon={CheckCircle2}>No requests are waiting for approval.</Empty>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Asset</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Decide</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.pendingRequests.map((r) => (
                      <TableRow key={r.request_id}>
                        <TableCell><Person name={r.user_name} sub={`Requested ${fmtDate(r.created_at)}`} /></TableCell>
                        <TableCell><p className="font-medium">{r.asset_name}</p><p className="text-muted-foreground max-w-48 truncate text-xs">{r.purpose}</p></TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(r.start_date)}{r.end_date !== r.start_date && <> to {fmtDate(r.end_date)}</>}</TableCell>
                        <TableCell><StatusBadge status="Pending" /></TableCell>
                        <TableCell className="text-right"><QuickDecision request={r} onDone={load} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}
