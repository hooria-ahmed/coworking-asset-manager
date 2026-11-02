// Owner: Hamza. Route: /admin/approvals (registered in src/routes.jsx - do not rename this file or its export).
// Manage Requests (SRS screen 10, FR-AP-01 to FR-AP-06): pending requests to approve or reject (with a clash
// check before deciding), approved bookings not collected yet (cancel), and the log of past decisions.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Ban, CalendarClock, Check, CheckCircle2, ClipboardCheck, History, Hourglass, RefreshCw, Search, Users2, X,
} from 'lucide-react';
import api from '../../api/client';
import {
  Badge, Button, Card, DotPill, EmptyState, ErrorBox, Input, Label, NativeSelect, NativeSelectOption, Page, StatCard,
  StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton, Tabs, TabsContent, TabsList,
  TabsTrigger, Textarea, Tooltip, TooltipContent, TooltipTrigger,
} from '../../components/ui';
import { ConfirmDialog, Dates, Facts, Person, fmtDate, plural } from '../requests/parts';

const MAX_REASON = 255;

function requestFacts(r) {
  return [
    ['Member', r.user_name],
    ['Asset', `${r.asset_name} (${r.asset_tag})`],
    ['Dates', `${fmtDate(r.start_date)} to ${fmtDate(r.end_date)} · ${plural(r.duration_days, 'day')}`],
    ['Purpose', r.purpose],
  ];
}

function Flags({ r }) {
  if (!r.conflict && !r.competing) return <DotPill tone="success">Dates free</DotPill>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {r.conflict && <DotPill tone="danger">{r.conflict_reason}</DotPill>}
      {r.competing > 0 && <DotPill tone="warning">{plural(r.competing, 'other request')} for these dates</DotPill>}
    </div>
  );
}

function Loading() {
  return <Card className="py-4"><TableSkeleton /></Card>;
}

function PendingTable({ rows, onApprove, onReject }) {
  if (!rows.length) {
    return <Card><EmptyState icon={CheckCircle2} title="All caught up">No requests are waiting for approval.</EmptyState></Card>;
  }
  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="hidden xl:table-cell">Check</TableHead>
            <TableHead className="text-right">Decide</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.request_id}>
              <TableCell><Person name={r.user_name} sub={`Requested ${fmtDate(r.created_at)}`} /></TableCell>
              <TableCell className="max-w-64">
                <p className="font-medium">{r.asset_name}</p>
                <p className="text-muted-foreground truncate text-xs" title={r.purpose}>{r.purpose}</p>
                <div className="mt-1.5 xl:hidden"><Flags r={r} /></div>
              </TableCell>
              <TableCell><Dates start={r.start_date} end={r.end_date} days={r.duration_days} /></TableCell>
              <TableCell className="hidden xl:table-cell"><Flags r={r} /></TableCell>
              <TableCell>
                <div className="flex justify-end gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button size="sm" variant="outline" disabled={r.conflict} onClick={() => onApprove(r)} aria-label={`Approve request from ${r.user_name}`}>
                          <Check /> <span className="hidden sm:inline">Approve</span>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{r.conflict ? `Cannot approve: ${r.conflict_reason.toLowerCase()}` : 'Reserve the asset for these dates'}</TooltipContent>
                  </Tooltip>
                  <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => onReject(r)} aria-label={`Reject request from ${r.user_name}`}>
                    <X /> <span className="hidden sm:inline">Reject</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ApprovedTable({ rows, onCancel }) {
  if (!rows.length) {
    return <Card><EmptyState icon={CalendarClock} title="No bookings waiting">Approved requests appear here until the member collects the asset.</EmptyState></Card>;
  }
  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="hidden lg:table-cell">Approved</TableHead>
            <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.request_id}>
              <TableCell><Person name={r.user_name} sub={r.user_email} /></TableCell>
              <TableCell>
                <p className="font-medium">{r.asset_name}</p>
                <p className="text-muted-foreground font-mono text-xs">{r.asset_tag}</p>
              </TableCell>
              <TableCell><Dates start={r.start_date} end={r.end_date} days={r.duration_days} /></TableCell>
              <TableCell className="text-muted-foreground hidden lg:table-cell">
                {fmtDate(r.decided_at)}
                {r.decided_by_name && <p className="text-xs">by {r.decided_by_name}</p>}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => onCancel(r)} aria-label={`Cancel booking for ${r.user_name}`}>
                  <Ban /> <span className="hidden sm:inline">Cancel booking</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function HistoryPanel({ active }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}) });
        const data = await api.get(`/approvals/history?${q}`);
        if (live) { setRows(data); setError(null); }
      } catch (err) {
        if (live) setError(err);
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [active, search, status]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input placeholder="Search member or asset..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} />
        </div>
        <div className="w-48">
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <NativeSelectOption value="">All decisions</NativeSelectOption>
            {['Approved', 'Rejected', 'Cancelled', 'Completed'].map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
          </NativeSelect>
        </div>
      </div>
      <ErrorBox error={error} />
      <Card className="overflow-hidden py-0">
        {loading && !rows.length ? (
          <div className="py-4"><TableSkeleton /></div>
        ) : !rows.length ? (
          <EmptyState icon={History} title="Nothing here yet">Decisions on requests show up here.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="hidden md:table-cell">Dates</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="hidden lg:table-cell">Decided</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.request_id}>
                  <TableCell><Person name={r.user_name} sub={r.user_email} /></TableCell>
                  <TableCell className="max-w-56">
                    <p className="font-medium">{r.asset_name}</p>
                    <p className="text-muted-foreground truncate text-xs" title={r.purpose}>{r.purpose}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell"><Dates start={r.start_date} end={r.end_date} days={r.duration_days} /></TableCell>
                  <TableCell className="max-w-64">
                    <StatusBadge status={r.status} />
                    {r.rejection_reason && <p className="text-muted-foreground mt-1 text-xs whitespace-normal">{r.rejection_reason}</p>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {r.decided_at ? fmtDate(r.decided_at) : 'By the member'}
                    {r.decided_by_name && <p className="text-xs">by {r.decided_by_name}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function ApprovalsPage() {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('pending');
  const [dialog, setDialog] = useState(null); // { mode: 'approve' | 'reject' | 'cancel', request }
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, a] = await Promise.all([api.get('/approvals/pending'), api.get('/approvals/approved')]);
      setPending(p);
      setApproved(a);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = (mode) => (request) => { setReason(''); setDialog({ mode, request }); };

  async function decide() {
    const { mode, request } = dialog;
    const body = mode === 'approve' ? undefined : { reason: reason.trim() };
    const { message } = await api.patch(`/approvals/${request.request_id}/${mode}`, body);
    toast.success(message);
    load();
  }

  const clashes = pending.filter((r) => r.conflict).length;
  const members = new Set(pending.map((r) => r.user_id)).size;
  const startingSoon = approved.filter((r) => r.start_date <= new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)).length;
  const mode = dialog?.mode;

  return (
    <Page
      title="Manage"
      accent="requests"
      description="Approve or reject what members asked for. Clashing dates are checked for you before you decide."
      actions={
        <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
        </Button>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting for a decision" value={pending.length} icon={Hourglass} tone="warning" note={pending.length ? `Oldest from ${fmtDate(pending[0].created_at)}` : 'Nothing to review'} />
        <StatCard label="Date clashes" value={clashes} icon={AlertTriangle} tone="danger" alert={clashes > 0} note={clashes ? 'These can only be rejected' : 'No clashes'} />
        <StatCard label="Approved, not collected" value={approved.length} icon={ClipboardCheck} tone="success" note={`${startingSoon} start within 2 days`} />
        <StatCard label="Members waiting" value={members} icon={Users2} tone="lime" note="Each is notified of your decision" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="pending">Pending <span className="text-muted-foreground text-xs tabular-nums">{pending.length}</span></TabsTrigger>
            <TabsTrigger value="approved">Approved bookings <span className="text-muted-foreground text-xs tabular-nums">{approved.length}</span></TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="pending" className="mt-2">
          {loading && !pending.length ? <Loading /> : <PendingTable rows={pending} onApprove={open('approve')} onReject={open('reject')} />}
        </TabsContent>
        <TabsContent value="approved" className="mt-2">
          {loading && !approved.length ? <Loading /> : <ApprovedTable rows={approved} onCancel={open('cancel')} />}
        </TabsContent>
        <TabsContent value="history" className="mt-2">
          <HistoryPanel active />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(dialog)}
        onOpenChange={(o) => !o && setDialog(null)}
        title={mode === 'approve' ? 'Approve this request?' : mode === 'reject' ? 'Reject this request?' : 'Cancel this booking?'}
        description={
          mode === 'approve' ? 'The asset is reserved for these dates and the member is notified.'
            : mode === 'reject' ? 'The member is notified with your reason. This cannot be undone.'
              : 'The asset becomes free again and the member is notified. This cannot be undone.'
        }
        confirmLabel={mode === 'approve' ? 'Approve' : mode === 'reject' ? 'Reject' : 'Cancel booking'}
        confirmIcon={mode === 'approve' ? Check : mode === 'reject' ? X : Ban}
        variant={mode === 'approve' ? 'brand' : 'destructive'}
        canConfirm={mode !== 'reject' || Boolean(reason.trim())}
        onConfirm={decide}
      >
        {dialog && (
          <>
            <Facts rows={requestFacts(dialog.request)} />
            {mode === 'approve' && dialog.request.competing > 0 && (
              <p className="text-warning flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {plural(dialog.request.competing, 'other pending request')} for this asset overlap. They will clash once you approve this one.
              </p>
            )}
            {mode !== 'approve' && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="decision-reason">Reason{mode === 'cancel' && <span className="text-muted-foreground font-normal"> (optional)</span>}</Label>
                  <Badge variant="neutral" className="tabular-nums">{reason.length}/{MAX_REASON}</Badge>
                </div>
                <Textarea
                  id="decision-reason"
                  maxLength={MAX_REASON}
                  placeholder={mode === 'reject' ? 'For example: the laptop is booked for a workshop on these dates' : 'For example: needed for a building inspection'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                {mode === 'reject' && !reason.trim() && <p className="text-muted-foreground text-xs">A reason is required so the member knows why.</p>}
              </div>
            )}
          </>
        )}
      </ConfirmDialog>
    </Page>
  );
}
