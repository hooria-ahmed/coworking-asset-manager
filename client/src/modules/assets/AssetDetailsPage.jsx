// Owner: Azlaan. Route: /assets/:id (registered in src/routes.jsx - do not rename this file or its export).
// Asset Details (SRS screen 4, FR-AS-04, FR-RQ-01): every field, the dates it is already taken and a
// four-week availability strip. Members get a Request button (only when Available) and, while they
// borrow it, Report a problem. Admins can edit, send it for maintenance, retire or delete it, and
// open its usage history (Hooria's /admin/history/:id).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Ban, CalendarDays, History, MapPin, MoreHorizontal, Package, Pencil, Send, ShieldCheck, Trash2, UserRound,
  Wrench,
} from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Alert, AlertDescription, AlertTitle, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardIcon, CardTitle, DotPill,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorBox, Page, Skeleton,
  StatCard, StatusBadge,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import {
  AssetFormDialog, AssetThumb, ConfirmDialog, Facts, NewMaintenanceDialog, categoryIcon, deleteCopy, fmtDate, plural,
} from './parts';

const DAYS = 28;

function isoDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The next four weeks, one cell a day: free, reserved or on loan.
function AvailabilityStrip({ periods, status }) {
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => {
    const day = isoDay(i);
    const hit = periods.find((p) => p.start_date <= day && p.end_date >= day);
    return { day, kind: status === 'Under Maintenance' || status === 'Retired' ? 'blocked' : hit?.kind || 'free', d: new Date(`${day}T00:00:00`) };
  }), [periods, status]);
  const shade = {
    free: 'bg-primary/14 dark:bg-primary/18',
    Reserved: 'bg-info/70',
    Borrowed: 'bg-primary dark:bg-[oklch(0.8_0.13_293)] dark:shadow-[0_0_12px_-3px] dark:shadow-primary',
    blocked: 'bg-warning/40 bg-[repeating-linear-gradient(135deg,transparent_0_4px,color-mix(in_oklch,var(--background)_45%,transparent)_4px_8px)]',
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <span key={i} className="text-muted-foreground text-center text-[0.65rem]">{l}</span>)}
        {Array.from({ length: (days[0].d.getDay() + 6) % 7 }, (_, i) => <span key={`pad${i}`} />)}
        {days.map(({ day, kind, d }, i) => (
          <span
            key={day}
            title={`${fmtDate(day)}: ${kind === 'free' ? 'free' : kind === 'blocked' ? status : kind}`}
            className={cn('relative flex aspect-square items-center justify-center rounded-lg text-[0.65rem] tabular-nums', shade[kind], kind === 'Borrowed' ? 'text-primary-foreground' : 'text-foreground/70', i === 0 && 'ring-highlight ring-2')}
          >
            {d.getDate()}
          </span>
        ))}
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem]">
        <span className="flex items-center gap-1.5"><span className={cn('size-3 rounded', shade.free)} /> Free</span>
        <span className="flex items-center gap-1.5"><span className={cn('size-3 rounded', shade.Reserved)} /> Reserved</span>
        <span className="flex items-center gap-1.5"><span className={cn('size-3 rounded', shade.Borrowed)} /> On loan</span>
        <span className="flex items-center gap-1.5"><span className="ring-highlight size-3 rounded ring-2" /> Today</span>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Skeleton className="h-[28rem] rounded-3xl lg:col-span-3" />
      <Skeleton className="h-[28rem] rounded-3xl lg:col-span-2" />
    </div>
  );
}

export default function AssetDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [asset, setAsset] = useState(null);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [dialog, setDialog] = useState(null); // 'edit' | 'maintenance' | 'retire' | 'delete'

  const load = useCallback(async () => {
    setError(null);
    try {
      setAsset(await api.get(`/assets/${id}`));
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/categories').then(setCategories).catch(() => {});
    api.get('/assets/locations').then(setLocations).catch(() => {});
  }, [isAdmin]);

  async function retire() {
    const { message } = await api.put(`/assets/${asset.asset_id}`, { status: 'Retired' });
    toast.success(message);
    load();
  }

  async function remove() {
    const { message, retired } = await api.delete(`/assets/${asset.asset_id}`);
    toast.success(message);
    if (retired) load(); else navigate('/admin/assets');
  }

  if (error && !asset) {
    return (
      <Page title="Asset" accent="details" actions={<Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>}>
        <Card><EmptyState icon={Package} title="We could not open this asset" action={<Button asChild variant="brand"><Link to="/assets">Browse the catalogue</Link></Button>}>{error.message}</EmptyState></Card>
      </Page>
    );
  }

  const CatIcon = categoryIcon(asset?.category);
  const upcoming = asset?.reserved_dates || [];

  return (
    <Page
      title={asset ? asset.name : 'Asset'}
      accent={asset ? undefined : 'details'}
      description={asset ? `${asset.asset_tag} · ${asset.category} · ${asset.location}` : 'Loading...'}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>
          {asset && !isAdmin && asset.my_loan && !asset.my_open_report && (
            <Button asChild variant="outline"><Link to={`/report-problem?asset=${asset.asset_id}`}><AlertTriangle /> Report a problem</Link></Button>
          )}
          {asset && !isAdmin && (asset.can_request
            ? <Button asChild variant="brand"><Link to={`/request/${asset.asset_id}`}><Send /> Request</Link></Button>
            : <Button variant="brand" disabled><Send /> Not available</Button>)}
          {asset && isAdmin && (
            <>
              <Button asChild variant="outline"><Link to={`/admin/history/${asset.asset_id}`}><History /> View history</Link></Button>
              <Button onClick={() => setDialog('edit')}><Pencil /> Edit</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={['Borrowed', 'Retired', 'Under Maintenance'].includes(asset.status)} onSelect={() => setDialog('maintenance')}><Wrench /> Send for maintenance</DropdownMenuItem>
                  <DropdownMenuItem disabled={asset.status !== 'Available'} onSelect={() => setDialog('retire')}><Ban /> Retire</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={['Reserved', 'Borrowed', 'Under Maintenance'].includes(asset.status)} onSelect={() => setDialog('delete')}><Trash2 /> Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </>
      }
    >
      <ErrorBox error={asset && error} />
      {!asset && <Loading />}

      {asset && (
        <>
          {!isAdmin && asset.my_open_report && (
            <Alert className="border-warning/35 bg-warning/10 [&>svg]:text-warning"><Wrench /><AlertTitle>You reported a problem with this asset</AlertTitle><AlertDescription>The team is looking at it. Please return it at the front desk as usual.</AlertDescription></Alert>
          )}
          {isAdmin && asset.open_maintenance && (
            <Alert className="border-warning/35 bg-warning/10 [&>svg]:text-warning">
              <Wrench />
              <AlertTitle>Open maintenance record #{asset.open_maintenance.maintenance_id} ({asset.open_maintenance.status})</AlertTitle>
              <AlertDescription>
                <span>{asset.open_maintenance.issue_description}. Reported by {asset.open_maintenance.reported_by_name} on {fmtDate(asset.open_maintenance.reported_at)}.{' '}</span>
                <Link to="/admin/maintenance" className="text-foreground underline underline-offset-4">Open Maintenance</Link>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-5">
            <Card className="gap-0 overflow-hidden p-2.5 lg:col-span-3">
              <div className="relative">
                <AssetThumb asset={asset} size="lg" />
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                  <StatusBadge status={asset.status} className="bg-background/80 backdrop-blur" />
                </div>
              </div>
              <CardContent className="space-y-5 px-3 pt-5 pb-3">
                <div className="flex flex-wrap gap-1.5">
                  <DotPill tone="brand"><CatIcon className="size-3" /> {asset.category}</DotPill>
                  <DotPill tone={asset.condition === 'Damaged' ? 'danger' : asset.condition === 'Fair' ? 'warning' : 'success'}>{asset.condition} condition</DotPill>
                  <DotPill tone="neutral"><MapPin className="size-3" /> {asset.location}</DotPill>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.16em] uppercase">About</p>
                  <p className="text-sm leading-relaxed">{asset.description || <span className="text-muted-foreground">No description yet.</span>}</p>
                </div>
                <Facts rows={[
                  ['Asset tag', <span className="font-mono">{asset.asset_tag}</span>],
                  ['Category', asset.category],
                  ['Location', asset.location],
                  ['Condition', asset.condition],
                  ['Status', asset.status],
                  ['Added', fmtDate(asset.created_at)],
                  isAdmin && ['Last changed', fmtDate(asset.updated_at)],
                ]} />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle><CardIcon icon={CalendarDays} /> Availability</CardTitle>
                  <CardDescription>
                    {asset.status === 'Under Maintenance' ? 'Being repaired. It cannot be booked until it is fixed.'
                      : asset.status === 'Retired' ? 'Retired. No longer lent out.'
                      : upcoming.length ? 'Pick dates around the taken ones below.' : 'No bookings yet. Any dates are free.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <AvailabilityStrip periods={upcoming} status={asset.status} />
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.16em] uppercase">Upcoming reserved dates</p>
                    {upcoming.length === 0 ? (
                      <p className="text-muted-foreground text-sm">Nothing booked.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {upcoming.map((b) => (
                          <li key={`${b.start_date}-${b.kind}`} className="bg-secondary/60 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm">
                            <span>{fmtDate(b.start_date)}{b.end_date !== b.start_date && <> to {fmtDate(b.end_date)}</>}</span>
                            <StatusBadge status={b.kind} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>

              {isAdmin ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard label="Times borrowed" value={asset.stats.times_borrowed} icon={ShieldCheck} tone="brand" />
                    <StatCard label="Repairs" value={asset.stats.maintenance_records} icon={Wrench} tone="warning" to="/admin/maintenance" />
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle><CardIcon icon={UserRound} /> With</CardTitle>
                      <CardAction><Button asChild variant="ghost" size="sm"><Link to={`/admin/history/${asset.asset_id}`}>History</Link></Button></CardAction>
                    </CardHeader>
                    <CardContent>
                      {asset.current_loan ? (
                        <Facts rows={[
                          ['Borrower', asset.current_loan.user_name],
                          ['Email', asset.current_loan.user_email],
                          ['Issued', fmtDate(asset.current_loan.issued_on)],
                          ['Due back', <span className={asset.current_loan.status === 'Overdue' ? 'text-danger' : undefined}>{fmtDate(asset.current_loan.due_date)}{asset.current_loan.status === 'Overdue' && ' (overdue)'}</span>],
                        ]} />
                      ) : (
                        <p className="text-muted-foreground text-sm">Nobody has it right now. It is in {asset.location}.</p>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardHeader><CardTitle><CardIcon icon={Send} /> How to borrow</CardTitle></CardHeader>
                  <CardContent className="text-muted-foreground space-y-2 text-sm">
                    {asset.my_loan ? (
                      <p>You have it now. Please return it by <span className="text-foreground font-medium">{fmtDate(asset.my_loan.due_date)}</span>. If something is wrong with it, use Report a problem.</p>
                    ) : (
                      <>
                        <p>1. Press Request and choose your dates (1 to 30 days).</p>
                        <p>2. An admin approves it and you get a notification.</p>
                        <p>3. Collect it at the front desk on the start date. {plural(asset.stats.times_borrowed, 'member')} borrowed it before you.</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {isAdmin && (
            <>
              <AssetFormDialog open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} asset={asset} categories={categories} locations={locations} onSaved={(_, res) => { toast.success(res.message); load(); }} />
              <NewMaintenanceDialog open={dialog === 'maintenance'} onOpenChange={(o) => setDialog(o ? 'maintenance' : null)} asset={asset} onSaved={(res) => { toast.success(res.message); load(); }} />
              <ConfirmDialog
                open={dialog === 'retire'} onOpenChange={(o) => setDialog(o ? 'retire' : null)}
                title={`Retire ${asset.name}?`} description="It will be hidden from members and can no longer be booked. Waiting requests for it are cancelled and the members are told. This cannot be undone."
                confirmLabel="Retire asset" confirmIcon={Ban} variant="destructive" onConfirm={retire}
              />
              <ConfirmDialog
                open={dialog === 'delete'} onOpenChange={(o) => setDialog(o ? 'delete' : null)}
                title={deleteCopy(asset).title} description={deleteCopy(asset).description}
                confirmLabel="Delete" confirmIcon={Trash2} variant="destructive" onConfirm={remove}
              />
            </>
          )}
        </>
      )}
    </Page>
  );
}
