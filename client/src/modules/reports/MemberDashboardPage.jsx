// Owner: Misbah. Route: /dashboard (members' home page, registered in src/routes.jsx).
// Member Dashboard (SRS 3.1.1, screen 2): active borrowings with due dates, open requests,
// latest notifications and today's AI allowance. Data: GET /api/reports/me (own data only).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, Bell, BellRing, Bot, CalendarClock, ClipboardList, Hourglass, PackageOpen, RefreshCw, Sparkles, Wand2, Wrench,
} from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, CardLink, ErrorBox, Page, Progress, Skeleton, StatCard, StatusBadge, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { Panel, Empty } from './parts';
import { fmtDate, plural } from './format';

function DueBadge({ daysLeft }) {
  if (daysLeft < 0) return <Badge variant="danger">{plural(-daysLeft, 'day')} late</Badge>;
  if (daysLeft === 0) return <Badge variant="warning">Due today</Badge>;
  if (daysLeft === 1) return <Badge variant="warning">Due tomorrow</Badge>;
  return <Badge variant="success">{daysLeft} days left</Badge>;
}

function Borrowed({ items }) {
  if (!items.length) {
    return (
      <Empty icon={PackageOpen}>
        You have nothing borrowed right now. Find a laptop, projector or camera in the catalogue.
      </Empty>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="hidden md:table-cell">Where it came from</TableHead>
          <TableHead>Due back</TableHead>
          <TableHead className="hidden sm:table-cell" />
          <TableHead className="text-right"><span className="hidden sm:inline">Problem?</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((b) => (
          <TableRow key={b.borrow_id}>
            <TableCell>
              <Link to={`/assets/${b.asset_id}`} className="font-medium hover:underline">{b.asset_name}</Link>
              <p className="text-muted-foreground font-mono text-xs">{b.asset_tag}</p>
              <p className="text-muted-foreground text-xs md:hidden">{b.location}</p>
            </TableCell>
            <TableCell className="text-muted-foreground hidden md:table-cell">{b.location}</TableCell>
            <TableCell className="whitespace-nowrap">
              {fmtDate(b.due_date)}
              <div className="mt-1 sm:hidden"><DueBadge daysLeft={b.days_left} /></div>
            </TableCell>
            <TableCell className="hidden sm:table-cell"><DueBadge daysLeft={b.days_left} /></TableCell>
            <TableCell className="text-right">
              <Button asChild size="sm" variant="ghost">
                <Link to="/report-problem" aria-label={`Report a problem with ${b.asset_name}`}><Wrench /><span className="hidden sm:inline">Report</span></Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OpenRequests({ items }) {
  if (!items.length) return <Empty icon={ClipboardList}>No open requests. Requests waiting for approval and approved bookings appear here.</Empty>;
  return (
    <ul className="divide-border -mt-1 divide-y">
      {items.map((r) => (
        <li key={r.request_id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{r.asset_name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {fmtDate(r.start_date)}{r.end_date !== r.start_date && <> to {fmtDate(r.end_date)}</>} · {r.purpose}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge status={r.status} />
            {r.status === 'Approved' && <span className="text-muted-foreground text-[0.7rem]">Collect on {fmtDate(r.start_date)}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Notifications({ items }) {
  if (!items.length) return <Empty icon={Bell}>No notifications yet.</Empty>;
  return (
    <ul className="-mt-1 space-y-1">
      {items.map((n) => (
        <li key={n.notification_id} className={cn('flex gap-3 rounded-2xl px-3 py-2.5', !n.is_read && 'bg-primary/8')}>
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-muted-foreground/40' : 'bg-highlight shadow-[0_0_10px] shadow-highlight')} />
          <div className="min-w-0">
            <p className={cn('text-sm', !n.is_read && 'font-medium')}>{n.message}</p>
            <p className="text-muted-foreground text-xs">{fmtDate(n.created_at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AiHelper({ ai }) {
  const pct = ai.limit ? Math.round((ai.used / ai.limit) * 100) : 0;
  return (
    <div className="flex h-full flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        Ask about any asset in plain words, or describe what you need and get the best matches for your dates.
      </p>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Used today</span>
          <span><span className="font-display text-2xl font-medium tabular-nums">{ai.used}</span><span className="text-muted-foreground"> / {ai.limit}</span></span>
        </div>
        <Progress value={pct} aria-label={`${ai.used} of ${ai.limit} AI requests used today`} />
        <p className="text-muted-foreground text-xs">{plural(ai.remaining, 'request')} left today</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild variant="brand" size="sm"><Link to="/ai/assistant"><Bot /> Ask the assistant</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/ai/recommend"><Wand2 /> Get a recommendation</Link></Button>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 rounded-3xl lg:col-span-2" /><Skeleton className="h-72 rounded-3xl" /></div>
    </div>
  );
}

export default function MemberDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get('/reports/me'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <Page
      title="Welcome back,"
      accent={firstName}
      description="Your borrowed assets, requests and latest updates in one place."
      actions={
        <>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
          <Button asChild variant="brand">
            <Link to="/assets">Browse assets <ArrowUpRight /></Link>
          </Button>
        </>
      }
    >
      <ErrorBox error={error} />
      {!data && loading && <Loading />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Borrowed now"
              value={data.borrowed.length}
              icon={PackageOpen}
              tone={data.overdue ? 'danger' : 'brand'}
              alert={data.overdue > 0}
              note={data.overdue ? `${plural(data.overdue, 'item')} overdue. Please return ${data.overdue === 1 ? 'it' : 'them'}.` : `${plural(data.totalBorrowings, 'borrowing')} so far`}
            />
            <StatCard label="Due within a day" value={data.dueSoon} icon={CalendarClock} tone="warning" note={data.dueSoon ? 'Bring them back on time' : 'Nothing due soon'} />
            <StatCard label="Open requests" value={data.openRequests.length} icon={Hourglass} tone="info" to="/my-requests" note={`${data.pending} waiting, ${data.approvedUpcoming} approved`} />
            <StatCard label="Unread notifications" value={data.unread} icon={BellRing} tone="lime" to="/notifications" note={data.rejectedRecently ? `${plural(data.rejectedRecently, 'request')} rejected this month` : 'You are up to date'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel flush className="lg:col-span-2" title="Borrowed now" icon={PackageOpen} count={data.borrowed.length} description="Return each asset by its due date to the place it came from">
              <Borrowed items={data.borrowed} />
            </Panel>
            <Panel title="AI helper" icon={Sparkles} description="50 AI requests a day">
              <AiHelper ai={data.ai} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="My open requests" icon={ClipboardList} count={data.openRequests.length} action={<CardLink to="/my-requests" label="Open my requests" />}>
              <OpenRequests items={data.openRequests} />
            </Panel>
            <Panel title="Latest notifications" icon={Bell} count={data.unread ? `${data.unread} new` : undefined} action={<CardLink to="/notifications" label="Open notifications" />}>
              <Notifications items={data.notifications} />
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}
