// Owner: Hamza. Route: /admin/borrowing (registered in src/routes.jsx - do not rename this file or its export).
// Issue / Return (SRS screen 10, FR-BR-01 to FR-BR-06): hand over approved assets at the front desk, record
// returns with the date and condition (Damaged -> Maintenance), and follow up overdue loans.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlarmClock, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, CalendarDays, CheckCircle2, Clock,
  History, Mail, PackageCheck, PackageOpen, Phone, RefreshCw, ScanSearch, Undo2, Wrench,
} from 'lucide-react';
import api from '../../api/client';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Input, Label, Page, StatCard, StatusBadge, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { ConfirmDialog, Dates, Facts, Person, fmtDate, plural } from '../requests/parts';
import { todayISO } from '../reports/format';

const CONDITIONS = [
  { value: 'New', note: 'As new, no marks' },
  { value: 'Good', note: 'Normal wear' },
  { value: 'Fair', note: 'Works, visible wear' },
  { value: 'Damaged', note: 'Needs repair' },
];

function DueBadge({ daysLeft }) {
  if (daysLeft < 0) return <Badge variant="danger">{plural(-daysLeft, 'day')} late</Badge>;
  if (daysLeft === 0) return <Badge variant="warning">Due today</Badge>;
  if (daysLeft === 1) return <Badge variant="warning">Due tomorrow</Badge>;
  return <Badge variant="neutral">{daysLeft} days left</Badge>;
}

function Contact({ email, phone }) {
  return (
    <div className="flex gap-1.5">
      {email && (
        <Button asChild size="icon-sm" variant="secondary"><a href={`mailto:${email}`} aria-label={`Email ${email}`}><Mail /></a></Button>
      )}
      {phone && (
        <Button asChild size="icon-sm" variant="secondary"><a href={`tel:${phone}`} aria-label={`Call ${phone}`}><Phone /></a></Button>
      )}
    </div>
  );
}

function Shell({ loading, rows, empty, children }) {
  if (loading && !rows.length) return <Card className="py-4"><TableSkeleton /></Card>;
  if (!rows.length) return <Card>{empty}</Card>;
  return <Card className="overflow-hidden py-0"><Table>{children}</Table></Card>;
}

export default function IssueReturnPage() {
  const [data, setData] = useState({ toIssue: [], upcoming: [], active: [], overdue: [], returned: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('issue');
  const [issuing, setIssuing] = useState(null);
  const [returning, setReturning] = useState(null);
  const [ret, setRet] = useState({ condition: 'Good', date: todayISO(), notes: '' });
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [toIssue, upcoming, active, overdue, returned] = await Promise.all([
        api.get('/borrowing/to-issue'), api.get('/borrowing/upcoming'), api.get('/borrowing/active'),
        api.get('/borrowing/overdue'), api.get('/borrowing/returned?limit=30'),
      ]);
      setData({ toIssue, upcoming, active, overdue, returned });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function issue() {
    const { message } = await api.post('/borrowing/issue', { request_id: issuing.request_id });
    toast.success(message);
    load();
  }

  function openReturn(b) {
    setRet({ condition: b.asset_condition && b.asset_condition !== 'Damaged' ? b.asset_condition : 'Good', date: todayISO(), notes: '' });
    setReturning(b);
  }

  async function recordReturn() {
    const body = { return_condition: ret.condition, notes: ret.notes.trim() || undefined, ...(ret.date !== todayISO() ? { return_date: ret.date } : {}) };
    const { message, asset_status } = await api.patch(`/borrowing/${returning.borrow_id}/return`, body);
    if (asset_status === 'Under Maintenance') toast.warning(message); else toast.success(message);
    load();
  }

  async function runCheck() {
    setChecking(true);
    try {
      const { marked } = await api.post('/borrowing/check-overdue');
      toast.success(marked ? `${plural(marked, 'loan')} marked overdue and the borrowers were notified` : 'No new overdue loans');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  }

  const ready = data.toIssue.filter((r) => !r.missed);
  const dueToday = data.active.filter((b) => b.days_left === 0).length;
  const issuedOn = returning ? String(returning.issued_at).slice(0, 10) : '';
  const damaged = ret.condition === 'Damaged';

  return (
    <Page
      title="Issue"
      accent="& return"
      description="Hand over approved assets at the front desk and record them when they come back."
      actions={
        <>
          <Button variant="outline" onClick={runCheck} disabled={checking}><ScanSearch className={checking ? 'animate-pulse' : undefined} /> Check overdue</Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
        </>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ready to hand over" value={ready.length} icon={ArrowUpFromLine} tone="brand" note={`${data.upcoming.length} more coming up`} />
        <StatCard label="On loan" value={data.active.length} icon={PackageOpen} tone="info" note={`${dueToday} due back today`} />
        <StatCard label="Overdue" value={data.overdue.length} icon={AlarmClock} tone="danger" alert={data.overdue.length > 0} note={data.overdue.length ? 'Borrowers have been notified' : 'Everything is on time'} />
        <StatCard label="Returned lately" value={data.returned.length} icon={PackageCheck} tone="lime" note={`${data.returned.filter((r) => r.return_condition === 'Damaged').length} came back damaged`} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="issue">To issue <span className="text-muted-foreground text-xs tabular-nums">{data.toIssue.length}</span></TabsTrigger>
            <TabsTrigger value="loan">On loan <span className="text-muted-foreground text-xs tabular-nums">{data.active.length}</span></TabsTrigger>
            <TabsTrigger value="overdue">Overdue <span className={cn('text-xs tabular-nums', data.overdue.length ? 'text-danger' : 'text-muted-foreground')}>{data.overdue.length}</span></TabsTrigger>
            <TabsTrigger value="upcoming">Coming up <span className="text-muted-foreground text-xs tabular-nums">{data.upcoming.length}</span></TabsTrigger>
            <TabsTrigger value="returned">Returned</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="issue" className="mt-2">
          <Shell loading={loading} rows={data.toIssue} empty={<EmptyState icon={CheckCircle2} title="Nothing to hand over">Approved bookings appear here on their start date.</EmptyState>}>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Asset</TableHead><TableHead>Booking</TableHead><TableHead className="text-right">Hand over</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.toIssue.map((r) => (
                <TableRow key={r.request_id}>
                  <TableCell><Person name={r.user_name} sub={r.user_email} /></TableCell>
                  <TableCell>
                    <p className="font-medium">{r.asset_name}</p>
                    <p className="text-muted-foreground text-xs"><span className="font-mono">{r.asset_tag}</span> · {r.location}</p>
                  </TableCell>
                  <TableCell><Dates start={r.start_date} end={r.end_date} sub={r.missed ? <span className="text-danger">Not collected in time</span> : `Due back ${fmtDate(r.end_date)}`} /></TableCell>
                  <TableCell className="text-right">
                    {r.missed ? (
                      <Badge variant="danger">Cancel it in Approvals</Badge>
                    ) : r.asset_status === 'Borrowed' ? (
                      <Badge variant="warning">Still on loan to someone</Badge>
                    ) : (
                      <Button size="sm" variant="brand" onClick={() => setIssuing(r)}><ArrowUpFromLine /> Issue</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Shell>
        </TabsContent>

        <TabsContent value="loan" className="mt-2">
          <Shell loading={loading} rows={data.active} empty={<EmptyState icon={PackageOpen} title="Nothing on loan">Issued assets appear here until they are returned.</EmptyState>}>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Borrower</TableHead><TableHead className="hidden md:table-cell">Issued</TableHead><TableHead>Due back</TableHead><TableHead className="text-right">Return</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.active.map((b) => (
                <TableRow key={b.borrow_id}>
                  <TableCell><p className="font-medium">{b.asset_name}</p><p className="text-muted-foreground font-mono text-xs">{b.asset_tag}</p></TableCell>
                  <TableCell><Person name={b.user_name} sub={b.user_email} /></TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{fmtDate(b.issued_at)}</TableCell>
                  <TableCell>
                    <p className="whitespace-nowrap">{fmtDate(b.due_date)}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <DueBadge daysLeft={b.days_left} />
                      {b.status === 'Overdue' && <StatusBadge status="Overdue" />}
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openReturn(b)}><ArrowDownToLine /> Return</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Shell>
        </TabsContent>

        <TabsContent value="overdue" className="mt-2">
          <Shell loading={loading} rows={data.overdue} empty={<EmptyState icon={Clock} title="No overdue loans">Loans past their due date show up here, and the borrower is notified.</EmptyState>}>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Borrower</TableHead><TableHead>Was due</TableHead><TableHead className="hidden sm:table-cell">Contact</TableHead><TableHead className="text-right">Return</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.overdue.map((b) => (
                <TableRow key={b.borrow_id}>
                  <TableCell><p className="font-medium">{b.asset_name}</p><p className="text-muted-foreground font-mono text-xs">{b.asset_tag}</p></TableCell>
                  <TableCell><Person name={b.user_name} sub={b.contact_no || b.user_email} /></TableCell>
                  <TableCell>
                    <p className="whitespace-nowrap">{fmtDate(b.due_date)}</p>
                    <Badge variant="danger" className="mt-1">{plural(b.days_overdue, 'day')} late</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><Contact email={b.user_email} phone={b.contact_no} /></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openReturn(b)}><ArrowDownToLine /> Return</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Shell>
        </TabsContent>

        <TabsContent value="upcoming" className="mt-2">
          <Shell loading={loading} rows={data.upcoming} empty={<EmptyState icon={CalendarClock} title="No future bookings">Approved bookings that start later are listed here.</EmptyState>}>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Asset</TableHead><TableHead>Booking</TableHead><TableHead className="text-right">Starts</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.upcoming.map((r) => (
                <TableRow key={r.request_id}>
                  <TableCell><Person name={r.user_name} sub={r.user_email} /></TableCell>
                  <TableCell><p className="font-medium">{r.asset_name}</p><p className="text-muted-foreground font-mono text-xs">{r.asset_tag}</p></TableCell>
                  <TableCell><Dates start={r.start_date} end={r.end_date} days={r.duration_days} /></TableCell>
                  <TableCell className="text-right"><Badge variant="info"><CalendarDays /> {r.days_until === 1 ? 'Tomorrow' : `In ${r.days_until} days`}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Shell>
        </TabsContent>

        <TabsContent value="returned" className="mt-2">
          <Shell loading={loading} rows={data.returned} empty={<EmptyState icon={History} title="No returns yet">Returned loans are listed here.</EmptyState>}>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Borrower</TableHead><TableHead className="hidden md:table-cell">Loan</TableHead><TableHead>Returned</TableHead><TableHead className="text-right">Condition</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.returned.map((b) => (
                <TableRow key={b.borrow_id}>
                  <TableCell><p className="font-medium">{b.asset_name}</p><p className="text-muted-foreground font-mono text-xs">{b.asset_tag}</p></TableCell>
                  <TableCell><Person name={b.user_name} /></TableCell>
                  <TableCell className="hidden md:table-cell"><Dates start={b.issued_at.slice(0, 10)} end={b.due_date} sub={`Due ${fmtDate(b.due_date)}`} /></TableCell>
                  <TableCell>
                    <p className="whitespace-nowrap">{fmtDate(b.returned_at)}</p>
                    {b.late_days > 0 ? <Badge variant="danger" className="mt-1">{plural(b.late_days, 'day')} late</Badge> : <Badge variant="success" className="mt-1">On time</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {b.return_condition === 'Damaged' ? <Badge variant="danger"><Wrench /> Damaged</Badge> : <Badge variant="neutral">{b.return_condition}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Shell>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(issuing)}
        onOpenChange={(o) => !o && setIssuing(null)}
        title="Hand over this asset?"
        description="Check the member's ID at the desk. The loan starts now and the asset shows as Borrowed."
        confirmLabel="Issue asset"
        confirmIcon={ArrowUpFromLine}
        onConfirm={issue}
      >
        {issuing && (
          <Facts rows={[
            ['Member', issuing.user_name],
            ['Asset', `${issuing.asset_name} (${issuing.asset_tag})`],
            ['From', issuing.location],
            ['Due back', fmtDate(issuing.end_date)],
          ]} />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(returning)}
        onOpenChange={(o) => !o && setReturning(null)}
        title="Record a return"
        description="Check the asset before you choose its condition."
        confirmLabel={damaged ? 'Return and send to maintenance' : 'Record return'}
        confirmIcon={damaged ? Wrench : Undo2}
        variant={damaged ? 'destructive' : 'brand'}
        canConfirm={Boolean(ret.date) && ret.date >= issuedOn && ret.date <= todayISO()}
        onConfirm={recordReturn}
      >
        {returning && (
          <>
            <Facts rows={[
              ['Asset', `${returning.asset_name} (${returning.asset_tag})`],
              ['Borrower', returning.user_name],
              ['Issued', fmtDate(returning.issued_at)],
              ['Was due', fmtDate(returning.due_date)],
            ]} />
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Condition on return</legend>
              <div className="grid grid-cols-2 gap-2">
                {CONDITIONS.map((c) => (
                  <label
                    key={c.value}
                    className={cn(
                      'cursor-pointer rounded-2xl border p-3 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                      ret.condition === c.value
                        ? c.value === 'Damaged' ? 'border-danger/50 bg-danger/12' : 'border-primary/60 bg-primary/12'
                        : 'border-border hover:bg-secondary/60'
                    )}
                  >
                    <input type="radio" name="return-condition" value={c.value} checked={ret.condition === c.value} onChange={() => setRet((r) => ({ ...r, condition: c.value }))} className="sr-only" />
                    <span className="block text-sm font-medium">{c.value}</span>
                    <span className="text-muted-foreground block text-xs">{c.note}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="return-date">Return date</Label>
              <Input id="return-date" type="date" min={issuedOn} max={todayISO()} value={ret.date} onChange={(e) => setRet((r) => ({ ...r, date: e.target.value }))} />
              {ret.date && (ret.date < issuedOn || ret.date > todayISO()) && (
                <p className="text-danger text-sm">Pick a date between {fmtDate(issuedOn)} and today.</p>
              )}
            </div>
            {damaged && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="return-notes">What is wrong? <span className="text-muted-foreground font-normal">(goes to the maintenance record)</span></Label>
                  <Textarea id="return-notes" maxLength={300} placeholder="For example: cracked screen hinge" value={ret.notes} onChange={(e) => setRet((r) => ({ ...r, notes: e.target.value }))} />
                </div>
                <p className="text-danger flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  The asset goes Under Maintenance and cannot be lent until its maintenance record is closed.
                </p>
              </>
            )}
          </>
        )}
      </ConfirmDialog>
    </Page>
  );
}
