// Owner: Hamza. Route: /my-requests (registered in src/routes.jsx - do not rename this file or its export).
// My Requests (SRS screen 6, FR-RQ-05, FR-RQ-06): the status of every request the member made,
// the rejection reason, loan details, and a Cancel button while a request is Pending.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRight, Ban, CheckCircle2, ClipboardList, Hourglass, PackageOpen, RefreshCw, XCircle } from 'lucide-react';
import api from '../../api/client';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Page, StatCard, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader,
  TableRow, TableSkeleton, Tabs, TabsList, TabsTrigger,
} from '../../components/ui';
import { ConfirmDialog, Dates, Facts, countBy, fmtDate, plural } from './parts';

const FILTERS = ['All', 'Pending', 'Approved', 'Completed', 'Rejected', 'Cancelled'];

// The line under the status: what happens next, or why it ended.
function StatusNote({ r }) {
  if (r.status === 'Pending') return <span>Waiting for an admin since {fmtDate(r.created_at)}</span>;
  if (r.status === 'Rejected') return <span className="text-danger">Reason: {r.rejection_reason || 'not given'}</span>;
  if (r.status === 'Cancelled') return <span>{r.rejection_reason ? `Cancelled: ${r.rejection_reason}` : r.decided_at ? 'Cancelled by an admin' : 'Cancelled by you'}</span>;
  if (r.status === 'Completed') return <span>Returned {fmtDate(r.returned_at)}</span>;
  if (r.borrow_status === 'Overdue') return <span className="text-danger">Overdue: was due {fmtDate(r.due_date)}</span>;
  if (r.borrow_status === 'Active') return <span>On loan, due back {fmtDate(r.due_date)}</span>;
  return <span>Collect from {r.location} on {fmtDate(r.start_date)}</span>;
}

export default function MyRequestsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/requests/mine'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => countBy(rows, 'status'), [rows]);
  const onLoan = rows.filter((r) => r.borrow_status === 'Active' || r.borrow_status === 'Overdue').length;
  const overdue = rows.filter((r) => r.borrow_status === 'Overdue').length;
  const shown = filter === 'All' ? rows : rows.filter((r) => r.status === filter);

  async function cancel() {
    const { message } = await api.patch(`/requests/${cancelling.request_id}/cancel`);
    toast.success(message);
    load();
  }

  return (
    <Page
      title="My"
      accent="requests"
      description="Every request you made and where it stands. You can cancel a request while it is still pending."
      actions={
        <>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
          <Button asChild variant="brand"><Link to="/assets">Request an asset <ArrowUpRight /></Link></Button>
        </>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting for approval" value={counts.Pending || 0} icon={Hourglass} tone="warning" note="An admin decides each one" />
        <StatCard label="Approved" value={counts.Approved || 0} icon={CheckCircle2} tone="success" note="Collect on the start date" />
        <StatCard
          label="On loan now"
          value={onLoan}
          icon={PackageOpen}
          tone={overdue ? 'danger' : 'brand'}
          alert={overdue > 0}
          note={overdue ? `${plural(overdue, 'item')} overdue. Please return ${overdue === 1 ? 'it' : 'them'}.` : `${plural(counts.Completed || 0, 'booking')} completed`}
        />
        <StatCard label="Rejected or cancelled" value={(counts.Rejected || 0) + (counts.Cancelled || 0)} icon={XCircle} tone="neutral" note="Reasons are shown below" />
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f}>
                {f}
                <span className="text-muted-foreground text-xs tabular-nums">{f === 'All' ? rows.length : counts[f] || 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Card className="overflow-hidden py-0">
        {loading && rows.length === 0 ? (
          <div className="py-4"><TableSkeleton /></div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={filter === 'All' ? 'No requests yet' : `No ${filter.toLowerCase()} requests`}
            action={filter === 'All'
              ? <Button asChild variant="brand"><Link to="/assets">Browse assets</Link></Button>
              : <Button variant="outline" onClick={() => setFilter('All')}>Show all</Button>}
          >
            {filter === 'All' ? 'Find an asset in the catalogue or ask the AI Recommendation, then press Request.' : 'Try another tab.'}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="hidden sm:table-cell">Dates</TableHead>
                <TableHead className="hidden lg:table-cell">Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.request_id}>
                  <TableCell>
                    <Link to={`/assets/${r.asset_id}`} className="font-medium hover:underline">{r.asset_name}</Link>
                    <p className="text-muted-foreground text-xs"><span className="font-mono">{r.asset_tag}</span> · {r.category}</p>
                    <p className="text-muted-foreground mt-1 text-xs sm:hidden">{fmtDate(r.start_date)}{r.end_date !== r.start_date && <> to {fmtDate(r.end_date)}</>}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><Dates start={r.start_date} end={r.end_date} days={r.duration_days} /></TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-64 truncate lg:table-cell" title={r.purpose}>{r.purpose}</TableCell>
                  <TableCell className="max-w-72">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={r.status} />
                      {r.borrow_status === 'Overdue' && <Badge variant="danger">Overdue</Badge>}
                      {r.borrow_status === 'Active' && <StatusBadge status="Borrowed" />}
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs whitespace-normal"><StatusNote r={r} /></p>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'Pending' && (
                      <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => setCancelling(r)} aria-label={`Cancel request for ${r.asset_name}`}>
                        <Ban /> <span className="hidden sm:inline">Cancel</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this request?"
        description="The admin will no longer see it. You can send a new request later."
        confirmLabel="Cancel request"
        confirmIcon={Ban}
        variant="destructive"
        onConfirm={cancel}
      >
        {cancelling && (
          <Facts rows={[
            ['Asset', cancelling.asset_name],
            ['Dates', `${fmtDate(cancelling.start_date)} to ${fmtDate(cancelling.end_date)}`],
            ['Purpose', cancelling.purpose],
          ]} />
        )}
      </ConfirmDialog>
    </Page>
  );
}
