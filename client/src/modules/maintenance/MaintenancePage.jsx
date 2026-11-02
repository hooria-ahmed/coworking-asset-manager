// Owner: Azlaan. Route: /admin/maintenance (registered in src/routes.jsx - do not rename this file or its export).
// Maintenance (SRS screen 11, FR-MT-01 to FR-MT-05): every repair record, wherever it came from (an admin,
// a member's problem report, or a Damaged return on Issue / Return). Start work, add notes and cost (PKR),
// and close as Repaired (asset Available again) or Retired. While a record is open the asset cannot be lent.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Ban, CheckCircle2, CircleDollarSign, ClipboardEdit, Hammer, Hourglass, Loader2, MessageSquareWarning, MoreHorizontal, PackageX, Play,
  Plus, RefreshCw, Search, ShieldCheck, Undo2, UserCog, Wrench,
} from 'lucide-react';
import api from '../../api/client';
import {
  Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DotPill, DropdownMenu,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorBox, Input, Label, NativeSelect,
  NativeSelectOption, Page, StatCard, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton, Tabs,
  TabsList, TabsTrigger, Textarea,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { AssetThumb, CONDITIONS, Facts, NewMaintenanceDialog, fmtDate, fmtMoney, plural } from '../assets/parts';

const SOURCE = {
  report: { label: 'Member report', tone: 'info', icon: MessageSquareWarning },
  return: { label: 'Damaged return', tone: 'danger', icon: Undo2 },
  admin: { label: 'Admin', tone: 'neutral', icon: UserCog },
};

function Source({ source }) {
  const s = SOURCE[source] || SOURCE.admin;
  return <DotPill tone={s.tone}><s.icon className="size-3" /> {s.label}</DotPill>;
}

// Notes + cost dialog (FR-MT-03).
function UpdateDialog({ record, onOpenChange, onSaved }) {
  const [notes, setNotes] = useState(record.notes || '');
  const [cost, setCost] = useState(String(record.cost ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { message } = await api.patch(`/maintenance/${record.maintenance_id}`, { notes, cost: cost === '' ? 0 : Number(cost) });
      toast.success(message);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Update {record.asset_name}</DialogTitle>
            <DialogDescription>{record.issue_description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="mu-notes">Work notes</Label>
            <Textarea id="mu-notes" rows={5} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was checked, parts ordered, who is repairing it" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mu-cost">Cost so far (Rs)</Label>
            <Input id="mu-cost" type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <ErrorBox error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="brand" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <ClipboardEdit />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Close dialog (FR-MT-04): outcome, final cost, closing note, condition after repair.
function CloseDialog({ record, onOpenChange, onSaved }) {
  const [outcome, setOutcome] = useState('Repaired');
  const [cost, setCost] = useState(String(record.cost ?? 0));
  const [note, setNote] = useState('');
  const [condition, setCondition] = useState(record.asset_condition === 'Damaged' ? 'Good' : record.asset_condition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const onLoan = record.asset_status === 'Borrowed';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const notes = note.trim() ? [record.notes, `Closed: ${note.trim()}`].filter(Boolean).join('\n') : undefined;
      const { message, asset_status } = await api.patch(`/maintenance/${record.maintenance_id}/close`, {
        outcome, cost: cost === '' ? 0 : Number(cost), ...(notes ? { notes } : {}), ...(outcome === 'Repaired' ? { condition } : {}),
      });
      if (asset_status === 'Retired') toast.warning(message); else toast.success(message);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const choices = [
    { value: 'Repaired', icon: ShieldCheck, title: 'Repaired', text: onLoan ? 'Record closed, it stays with the borrower' : 'Back in the catalogue as Available' },
    { value: 'Retired', icon: PackageX, title: 'Cannot be repaired', text: 'Retire it: hidden from members, waiting requests cancelled', disabled: onLoan },
  ];

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Close record for {record.asset_name}</DialogTitle>
            <DialogDescription>{record.issue_description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Outcome">
            {choices.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={outcome === c.value}
                disabled={c.disabled}
                onClick={() => setOutcome(c.value)}
                className={cn(
                  'flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                  outcome === c.value
                    ? c.value === 'Retired' ? 'border-danger/60 bg-danger/10' : 'border-success/60 bg-success/10'
                    : 'border-border hover:bg-secondary/60'
                )}
              >
                <c.icon className={cn('size-5', c.value === 'Retired' ? 'text-danger' : 'text-success')} />
                <span className="font-medium">{c.title}</span>
                <span className="text-muted-foreground text-xs">{c.text}</span>
              </button>
            ))}
          </div>
          {onLoan && <p className="text-muted-foreground text-sm">{record.borrower_name} still has it (due {fmtDate(record.borrower_due)}). To retire it, record the return first.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mc-cost">Final cost (Rs)</Label>
              <Input id="mc-cost" type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            {outcome === 'Repaired' && (
              <div className="space-y-2">
                <Label htmlFor="mc-cond">Condition now</Label>
                <NativeSelect id="mc-cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {CONDITIONS.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
                </NativeSelect>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-note">Closing note (optional)</Label>
            <Textarea id="mc-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: replaced the lamp" />
          </div>
          <ErrorBox error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant={outcome === 'Retired' ? 'destructive' : 'brand'} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : outcome === 'Retired' ? <Ban /> : <CheckCircle2 />}
              {outcome === 'Retired' ? 'Close and retire' : 'Close as repaired'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MaintenancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [closing, setClosing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/maintenance'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startWork(r) {
    try {
      const { message } = await api.patch(`/maintenance/${r.maintenance_id}`, { status: 'In Progress' });
      toast.success(`${message}: ${r.asset_name}`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status === 'Open');
    const prog = rows.filter((r) => r.status === 'In Progress');
    const closed = rows.filter((r) => r.status === 'Closed');
    return {
      open: open.length, prog: prog.length, closed: closed.length,
      reports: open.filter((r) => r.source === 'report').length,
      repaired: closed.filter((r) => r.outcome === 'Repaired').length,
      retired: closed.filter((r) => r.outcome === 'Retired').length,
      cost: rows.reduce((s, r) => s + r.cost, 0),
      openCost: [...open, ...prog].reduce((s, r) => s + r.cost, 0),
      oldest: [...open, ...prog].reduce((m, r) => Math.max(m, r.days_open), 0),
    };
  }, [rows]);

  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) =>
    (tab === 'all' || (tab === 'active' ? r.status !== 'Closed' : r.status === 'Closed'))
    && (!q || [r.asset_name, r.asset_tag, r.issue_description, r.reported_by_name].some((v) => v?.toLowerCase().includes(q))));

  return (
    <Page
      title="Maintenance"
      description="Repairs from admins, member problem reports and damaged returns. An asset with an open record cannot be lent."
      actions={
        <>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : undefined} /></Button>
          <Button variant="brand" onClick={() => setCreating(true)}><Plus /> New record</Button>
        </>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting to start" value={stats.open} icon={Hourglass} tone="warning" alert={stats.reports > 0} note={stats.reports ? `${plural(stats.reports, 'new member report')}` : 'No new member reports'} />
        <StatCard label="In progress" value={stats.prog} icon={Hammer} tone="brand" note={stats.oldest ? `Oldest open for ${plural(stats.oldest, 'day')}` : 'Nothing open'} />
        <StatCard label="Closed" value={stats.closed} icon={ShieldCheck} tone="success" note={`${stats.repaired} repaired · ${stats.retired} retired`} />
        <StatCard label="Total cost" value={fmtMoney(stats.cost)} icon={CircleDollarSign} tone="lime" note={`${fmtMoney(stats.openCost)} on open records`} to="/admin/reports" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="active">Open <span className="text-muted-foreground text-xs tabular-nums">{stats.open + stats.prog}</span></TabsTrigger>
            <TabsTrigger value="closed">Closed <span className="text-muted-foreground text-xs tabular-nums">{stats.closed}</span></TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset, problem or person" className="pl-10" aria-label="Search records" />
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        {loading && !rows.length ? <div className="py-4"><TableSkeleton /></div> : !shown.length ? (
          <EmptyState icon={CheckCircle2} title={tab === 'active' ? 'Nothing waiting for repair' : 'No records here'} action={tab === 'active' && <Button variant="outline" onClick={() => setCreating(true)}><Plus /> New record</Button>}>
            {tab === 'active' ? 'Damaged returns and member problem reports appear here automatically.' : 'Try another tab or search.'}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead className="hidden lg:table-cell">Reported</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.maintenance_id} className="cursor-pointer" onClick={() => setViewing(r)}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <AssetThumb asset={{ ...r, name: r.asset_name, status: r.asset_status }} size="sm" />
                      <div className="min-w-0">
                        <p className="max-w-48 truncate font-medium">{r.asset_name}</p>
                        <p className="text-muted-foreground font-mono text-xs">{r.asset_tag}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-80 min-w-56 whitespace-normal">
                    <p className="line-clamp-2 text-sm">{r.issue_description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Source source={r.source} />
                      {r.status !== 'Closed' && r.asset_status === 'Borrowed' && <Badge variant="info">Still with {r.borrower_name}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    <p>{fmtDate(r.reported_at)}</p>
                    <p className="text-muted-foreground text-xs">{r.reported_by_name}</p>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{fmtMoney(r.cost)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status === 'Closed' ? r.outcome : r.status} />
                    <p className="text-muted-foreground mt-1 text-xs whitespace-nowrap">
                      {r.status === 'Closed' ? `Closed ${fmtDate(r.resolved_at)}` : r.days_open === 0 ? 'Opened today' : `Open ${plural(r.days_open, 'day')}`}
                    </p>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {r.status !== 'Closed' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'Open'
                          ? <Button size="sm" variant="outline" onClick={() => startWork(r)}><Play /> Start</Button>
                          : <Button size="sm" variant="brand" onClick={() => setClosing(r)}><CheckCircle2 /> Close</Button>}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`More for ${r.asset_name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setUpdating(r)}><ClipboardEdit /> Notes and cost</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setClosing(r)}><CheckCircle2 /> Close record</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild><Link to={`/assets/${r.asset_id}`}><Wrench /> Open asset</Link></DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : (
                      <Button asChild size="sm" variant="ghost"><Link to={`/assets/${r.asset_id}`}>Asset</Link></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <NewMaintenanceDialog open={creating} onOpenChange={setCreating} onSaved={(res) => { toast.success(res.message); setTab('active'); load(); }} />
      {updating && <UpdateDialog record={updating} onOpenChange={(o) => !o && setUpdating(null)} onSaved={load} />}
      {closing && <CloseDialog record={closing} onOpenChange={(o) => !o && setClosing(null)} onSaved={load} />}
      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Record #{viewing.maintenance_id}: {viewing.asset_name}</DialogTitle>
              <DialogDescription>{viewing.issue_description}</DialogDescription>
            </DialogHeader>
            <Facts rows={[
              ['Asset', <Link to={`/assets/${viewing.asset_id}`} className="hover:underline">{viewing.asset_name} ({viewing.asset_tag})</Link>],
              ['Source', SOURCE[viewing.source]?.label],
              ['Reported by', `${viewing.reported_by_name} on ${fmtDate(viewing.reported_at)}`],
              ['Status', viewing.status === 'Closed' ? `${viewing.outcome}, closed ${fmtDate(viewing.resolved_at)}` : viewing.status],
              ['Cost', fmtMoney(viewing.cost)],
              ['Asset now', viewing.asset_status],
            ]} />
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.16em] uppercase">Notes</p>
              <p className="text-sm whitespace-pre-line">{viewing.notes || <span className="text-muted-foreground">No notes yet.</span>}</p>
            </div>
            <DialogFooter>
              {viewing.status !== 'Closed' && <Button variant="outline" onClick={() => { setUpdating(viewing); setViewing(null); }}><ClipboardEdit /> Notes and cost</Button>}
              {viewing.status !== 'Closed' && <Button variant="brand" onClick={() => { setClosing(viewing); setViewing(null); }}><CheckCircle2 /> Close</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Page>
  );
}
