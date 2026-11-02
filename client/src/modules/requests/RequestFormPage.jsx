// Owner: Hamza. Route: /request/:assetId (registered in src/routes.jsx - do not rename this file or its export).
// Request Form (SRS screen 5, FR-RQ-01 to FR-RQ-04): purpose, start date and duration (1-30 days) for one asset.
// Reads ?start=YYYY-MM-DD&days=N from the URL so the AI Recommendation's Request button pre-fills it (FR-RC-05).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CalendarCheck2, CalendarRange, Loader2, MapPin, Package, Send, Sparkles } from 'lucide-react';
import api from '../../api/client';
import {
  Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle, DotPill,
  EmptyState, ErrorBox, Input, Label, Page, Skeleton, StatusBadge, Textarea,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { fmtDate, plural } from './parts';

const MAX_PURPOSE = 255;
const QUICK_DAYS = [1, 3, 7, 14];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Same rules as the server (NFR-SC-06: validated on both sides). Returns { field: message }.
function validate(form, info) {
  const errors = {};
  const days = Number(form.days);
  if (!form.purpose.trim()) errors.purpose = 'Please say what you need the asset for.';
  else if (form.purpose.length > MAX_PURPOSE) errors.purpose = `Keep it under ${MAX_PURPOSE} characters.`;
  if (!DATE_RE.test(form.start)) errors.start = 'Pick a start date.';
  else if (form.start < info.today) errors.start = 'The start date cannot be in the past. Pick today or later.';
  if (!Number.isInteger(days) || days < info.min_days || days > info.max_days) {
    errors.days = `Choose between ${info.min_days} and ${info.max_days} days.`;
  }
  return errors;
}

function FieldError({ id, children }) {
  if (!children) return null;
  return <p id={id} className="text-danger text-sm">{children}</p>;
}

function AssetCard({ info, clash }) {
  const { asset, booked } = info;
  return (
    <Card className="gap-5">
      <CardHeader>
        <CardTitle><CardIcon icon={Package} /> {asset.name}</CardTitle>
        <CardDescription className="font-mono">{asset.asset_tag}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {asset.image_path && (
          <img src={asset.image_path} alt={asset.name} className="aspect-video w-full rounded-2xl object-cover" />
        )}
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={asset.status} />
          <DotPill tone="brand">{asset.category}</DotPill>
          <DotPill tone="neutral">{asset.condition} condition</DotPill>
        </div>
        <p className="text-muted-foreground flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0" /> {asset.location}</p>
        {asset.description && <p className="text-sm leading-relaxed">{asset.description}</p>}
        <div className="space-y-2.5">
          <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.16em] uppercase">Already taken</p>
          {booked.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bookings yet. Any dates are free.</p>
          ) : (
            <ul className="space-y-1.5">
              {booked.map((b) => (
                <li
                  key={`${b.start_date}-${b.kind}`}
                  className={cn('flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm', clash?.start_date === b.start_date ? 'bg-danger/14' : 'bg-secondary/60')}
                >
                  <span>{fmtDate(b.start_date)}{b.end_date !== b.start_date && <> to {fmtDate(b.end_date)}</>}</span>
                  <StatusBadge status={b.kind} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Skeleton className="h-[30rem] rounded-3xl lg:col-span-3" />
      <Skeleton className="h-[30rem] rounded-3xl lg:col-span-2" />
    </div>
  );
}

export default function RequestFormPage() {
  const { assetId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromAi = params.has('start') || params.has('days');

  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ purpose: '', start: '', days: '3' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api.get(`/requests/asset/${assetId}`)
      .then((data) => {
        if (!live) return;
        setInfo(data);
        const start = params.get('start');
        const days = Number(params.get('days'));
        setForm((f) => ({
          ...f,
          start: start && DATE_RE.test(start) && start >= data.today ? start : data.today,
          days: Number.isInteger(days) && days >= data.min_days && days <= data.max_days ? String(days) : f.days,
        }));
      })
      .catch((err) => live && setLoadError(err));
    return () => { live = false; };
  }, [assetId, params]);

  const errors = useMemo(() => (info ? validate(form, info) : {}), [form, info]);
  const days = Number(form.days);
  const end = info && !errors.start && !errors.days ? addDays(form.start, days - 1) : null;
  // Warn early when the chosen dates overlap a booking (the server refuses them too).
  const clash = end && info?.booked.find((b) => b.start_date <= end && b.end_date >= form.start);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length || clash) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/requests', { asset_id: info.asset.asset_id, purpose: form.purpose.trim(), start_date: form.start, duration_days: days });
      toast.success(`Request sent for ${info.asset.name}. You will be notified when an admin decides.`);
      navigate('/my-requests');
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const show = (field) => (touched || form[field] !== '') && errors[field];

  return (
    <Page
      title="Request"
      accent={info?.asset.name || 'an asset'}
      description="Tell us what it is for and when you need it. An admin approves it, then you collect it at the front desk."
      actions={<Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>}
    >
      {loadError && (
        <Card>
          <EmptyState icon={Package} title="We could not open this asset" action={<Button asChild variant="brand"><Link to="/assets">Browse the catalogue</Link></Button>}>
            {loadError.message}
          </EmptyState>
        </Card>
      )}
      {!info && !loadError && <Loading />}

      {info && (
        <div className="grid items-start gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle><CardIcon icon={CalendarRange} /> Your request</CardTitle>
              <CardDescription>All fields are required. You can borrow for {info.min_days} to {info.max_days} days.</CardDescription>
            </CardHeader>
            <CardContent>
              {!info.can_request ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>{info.asset.name} cannot be requested right now</AlertTitle>
                  <AlertDescription>
                    It is {info.asset.status}. Only Available assets can be requested. Try the AI Recommendation or the catalogue for a similar one.
                  </AlertDescription>
                </Alert>
              ) : (
                <form onSubmit={submit} noValidate className="space-y-6">
                  {fromAi && (
                    <DotPill tone="lime"><Sparkles className="size-3" /> Dates filled in from your AI recommendation</DotPill>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <Label htmlFor="purpose">Purpose</Label>
                      <span className={cn('text-xs tabular-nums', form.purpose.length > MAX_PURPOSE ? 'text-danger' : 'text-muted-foreground')}>
                        {form.purpose.length}/{MAX_PURPOSE}
                      </span>
                    </div>
                    <Textarea
                      id="purpose"
                      rows={3}
                      placeholder="For example: editing a client video for the Friday demo"
                      value={form.purpose}
                      onChange={set('purpose')}
                      aria-invalid={Boolean(show('purpose'))}
                      aria-describedby="purpose-error"
                    />
                    <FieldError id="purpose-error">{show('purpose')}</FieldError>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="start">Start date</Label>
                      <Input
                        id="start"
                        type="date"
                        min={info.today}
                        value={form.start}
                        onChange={set('start')}
                        aria-invalid={Boolean(show('start'))}
                        aria-describedby="start-error"
                      />
                      <FieldError id="start-error">{show('start')}</FieldError>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="days">Duration (days)</Label>
                      <Input
                        id="days"
                        type="number"
                        inputMode="numeric"
                        min={info.min_days}
                        max={info.max_days}
                        value={form.days}
                        onChange={set('days')}
                        aria-invalid={Boolean(show('days'))}
                        aria-describedby="days-error"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_DAYS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, days: String(d) }))}
                            className={cn(
                              'rounded-full px-3 py-1 text-xs transition-colors',
                              days === d ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {plural(d, 'day')}
                          </button>
                        ))}
                      </div>
                      <FieldError id="days-error">{show('days')}</FieldError>
                    </div>
                  </div>

                  <div className={cn('flex items-center gap-4 rounded-2xl border p-4', clash ? 'border-danger/40 bg-danger/8' : 'border-border bg-secondary/40')}>
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', clash ? 'bg-danger/14 text-danger' : 'bg-primary/15 text-primary dark:text-[oklch(0.8_0.13_293)]')}>
                      {clash ? <AlertTriangle className="size-5" /> : <CalendarCheck2 className="size-5" />}
                    </span>
                    {end ? (
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          {fmtDate(form.start)}{end !== form.start && <> to {fmtDate(end)}</>}
                          <span className="text-muted-foreground font-normal"> · {plural(days, 'day')}</span>
                        </p>
                        <p className={clash ? 'text-danger' : 'text-muted-foreground'}>
                          {clash
                            ? `Already ${clash.kind === 'Borrowed' ? 'on loan' : 'booked'} from ${fmtDate(clash.start_date)} to ${fmtDate(clash.end_date)}. Pick dates after that.`
                            : `Return it by the end of ${fmtDate(end)}.`}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">Pick a start date and a duration to see your return date.</p>
                    )}
                  </div>

                  <ErrorBox error={error} />

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={saving}>Cancel</Button>
                    <Button type="submit" variant="brand" disabled={saving || (touched && (Object.keys(errors).length > 0 || Boolean(clash)))}>
                      {saving ? <Loader2 className="animate-spin" /> : <Send />} Submit request
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
          <div className="lg:col-span-2"><AssetCard info={info} clash={clash} /></div>
        </div>
      )}
    </Page>
  );
}
