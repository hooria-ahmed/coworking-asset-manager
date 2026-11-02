// Owner: Azlaan. Route: /report-problem (registered in src/routes.jsx - do not rename this file or its export).
// Report a Problem (FR-MT-05, FR-NT-02): a member tells the admins that an asset they are borrowing is faulty.
// It opens a maintenance record and notifies the admins; when the asset comes back it goes for repair, not
// back on the shelf (NFR-SF-03). Below the form: the member's earlier reports and what happened to them.
// ?asset=<id> pre-selects an asset (the Report a problem button on Asset Details).
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, PackageOpen, Send, Wrench } from 'lucide-react';
import api from '../../api/client';
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle, EmptyState, ErrorBox, Label, Page, Skeleton, StatusBadge,
  Textarea,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { AssetThumb, fmtDate } from '../assets/parts';

const MAX = 500;
const QUICK = ['Does not turn on', 'Screen or display problem', 'Battery or charging problem', 'A part is missing', 'Physical damage', 'Makes a strange noise'];

export default function ReportProblemPage() {
  const [params] = useSearchParams();
  const [loans, setLoans] = useState(null);
  const [reports, setReports] = useState([]);
  const [assetId, setAssetId] = useState(params.get('asset') || '');
  const [issue, setIssue] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [me, mine] = await Promise.all([api.get('/reports/me'), api.get('/maintenance/mine')]);
      setLoans(me.borrowed);
      setReports(mine);
      setAssetId((id) => id || (me.borrowed.length === 1 ? String(me.borrowed[0].asset_id) : ''));
    } catch (err) {
      setLoadError(err);
      setLoans([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openFor = (id) => reports.some((r) => String(r.asset_id) === String(id) && r.status !== 'Closed');
  const tooShort = issue.trim().length < 5;

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (!assetId || tooShort || issue.length > MAX) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/maintenance/report', { asset_id: Number(assetId), issue_description: issue.trim() });
      toast.success('Problem reported. Thank you!');
      setDone({ ...res, asset: loans.find((l) => String(l.asset_id) === String(assetId)) });
      setIssue('');
      setTouched(false);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Report a"
      accent="problem"
      description="Something wrong with an asset you are borrowing? Tell us here and the team will check it when you return it."
      actions={<Button asChild variant="outline"><Link to="/dashboard">My dashboard</Link></Button>}
    >
      <ErrorBox error={loadError} />
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle><CardIcon icon={AlertTriangle} /> What is wrong?</CardTitle>
            <CardDescription>You can report a problem only for assets you have with you now.</CardDescription>
          </CardHeader>
          <CardContent>
            {loans === null ? (
              <div className="space-y-3"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
            ) : done ? (
              <EmptyState
                icon={CheckCircle2}
                title={`Thanks, we have your report${done.asset ? ` for ${done.asset.asset_name}` : ''}`}
                action={<div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => setDone(null)}>Report another</Button><Button asChild variant="brand"><Link to="/dashboard">Back to dashboard</Link></Button></div>}
              >
                {done.message}. The admins were notified (record #{done.maintenance_id}).
              </EmptyState>
            ) : loans.length === 0 ? (
              <EmptyState icon={PackageOpen} title="You are not borrowing anything right now" action={<Button asChild variant="brand"><Link to="/assets">Browse assets</Link></Button>}>
                If you saw a problem with an asset in the space, tell the front desk.
              </EmptyState>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-6">
                <div className="space-y-2">
                  <Label>Asset</Label>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Asset">
                    {loans.map((l) => {
                      const reported = openFor(l.asset_id);
                      const picked = String(l.asset_id) === String(assetId);
                      return (
                        <button
                          key={l.borrow_id}
                          type="button"
                          role="radio"
                          aria-checked={picked}
                          disabled={reported}
                          onClick={() => setAssetId(String(l.asset_id))}
                          className={cn(
                            'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55',
                            picked ? 'border-primary/60 bg-primary/12' : 'border-border hover:bg-secondary/60'
                          )}
                        >
                          <AssetThumb asset={{ ...l, name: l.asset_name, status: 'Borrowed' }} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{l.asset_name}</span>
                            <span className="text-muted-foreground block text-xs">{reported ? 'Already reported' : `Due back ${fmtDate(l.due_date)}`}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {touched && !assetId && <p className="text-danger text-sm">Choose the asset that has the problem.</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="rp-issue">Describe the problem</Label>
                    <span className={cn('text-xs tabular-nums', issue.length > MAX ? 'text-danger' : 'text-muted-foreground')}>{issue.length}/{MAX}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setIssue((t) => (t.trim() ? `${t.trim()}. ${q}` : q))}
                        className="bg-secondary text-muted-foreground hover:text-foreground rounded-full px-3 py-1 text-xs transition-colors"
                      >
                        + {q}
                      </button>
                    ))}
                  </div>
                  <Textarea id="rp-issue" rows={4} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="For example: the left hinge is cracked and the screen flickers when moved" aria-invalid={touched && tooShort} />
                  {touched && tooShort && <p className="text-danger text-sm">Please describe the problem in a few words.</p>}
                </div>

                <div className="border-border bg-secondary/40 flex items-start gap-3 rounded-2xl border p-4 text-sm">
                  <Wrench className="text-warning mt-0.5 size-4 shrink-0" />
                  <p className="text-muted-foreground">Keep using it only if it is safe. Return it at the front desk as usual; it goes for repair before anyone else borrows it.</p>
                </div>

                <ErrorBox error={error} />
                <div className="flex justify-end">
                  <Button type="submit" variant="brand" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Send report</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle><CardIcon icon={ClipboardList} /> My reports</CardTitle>
            <CardDescription>What happened to the problems you told us about.</CardDescription>
          </CardHeader>
          <CardContent>
            {!reports.length ? (
              <p className="text-muted-foreground text-sm">No reports yet.</p>
            ) : (
              <ul className="space-y-2">
                {reports.map((r) => (
                  <li key={r.maintenance_id} className="bg-secondary/50 space-y-2 rounded-2xl p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/assets/${r.asset_id}`} className="min-w-0 font-medium hover:underline"><span className="block truncate">{r.asset_name}</span></Link>
                      <StatusBadge status={r.status === 'Closed' ? r.outcome : r.status === 'Open' ? 'Pending' : r.status} />
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm">{r.issue_description}</p>
                    <p className="text-muted-foreground text-xs">
                      Reported {fmtDate(r.reported_at)}{r.resolved_at && ` · ${r.outcome === 'Repaired' ? 'Fixed' : 'Retired'} ${fmtDate(r.resolved_at)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
