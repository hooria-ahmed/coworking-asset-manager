// Small building blocks shared by Azlaan's screens (Catalogue, Asset Details, Manage Assets, Categories,
// Maintenance, Report a Problem), built on the shared shadcn/ui pieces. Dates and money use Misbah's
// format helpers and dialogs use Hamza's ConfirmDialog, so every screen in the app matches.
import { useEffect, useRef, useState } from 'react';
import {
  Cable, Camera, FlaskConical, ImagePlus, Laptop, Loader2, Monitor, Package, Projector, Save, Search, Tablet, Trash2, Wrench, X,
} from 'lucide-react';
import api from '../../api/client';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorBox, Input, Label, NativeSelect,
  NativeSelectOption, StatusBadge, Textarea,
} from '../../components/ui';
import { cn } from '@/lib/utils';

export { ConfirmDialog, Facts } from '../requests/parts';
export { fmtDate, fmtMoney, plural } from '../reports/format';

export const CONDITIONS = ['New', 'Good', 'Fair', 'Damaged'];
export const STATUSES = ['Available', 'Reserved', 'Borrowed', 'Under Maintenance', 'Retired'];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // MAX_IMAGE_SIZE in the SRS (FR-AM-01)

// A picture for a category when the asset has no photo.
const CATEGORY_ICONS = [
  [/laptop|notebook/i, Laptop], [/desktop|computer|monitor|screen/i, Monitor], [/projector/i, Projector],
  [/camera|video|photo/i, Camera], [/cable|adapter|charger/i, Cable], [/lab|kit|electronic/i, FlaskConical],
  [/tablet|ipad/i, Tablet],
];
export function categoryIcon(category = '') {
  return CATEGORY_ICONS.find(([re]) => re.test(category))?.[1] || Package;
}

// Asset photo, or a violet tile with the category icon. size: sm (table row), md (card), lg (details).
export function AssetThumb({ asset, size = 'md', className }) {
  const [broken, setBroken] = useState(false);
  const Icon = categoryIcon(asset.category);
  const box = {
    sm: 'size-11 rounded-2xl',
    md: 'aspect-[16/10] w-full rounded-[1.25rem]',
    lg: 'aspect-[16/9] w-full rounded-3xl',
  }[size];
  if (asset.image_path && !broken) {
    return (
      <img
        src={asset.image_path}
        alt={asset.name}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn('bg-secondary shrink-0 object-cover', box, asset.status === 'Retired' && 'grayscale', className)}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden border border-border',
        'bg-[radial-gradient(120%_90%_at_20%_0%,color-mix(in_oklch,var(--primary)_30%,transparent),transparent_60%),radial-gradient(90%_80%_at_100%_100%,color-mix(in_oklch,var(--highlight)_14%,transparent),transparent_60%)] bg-secondary/50',
        box, asset.status === 'Retired' && 'opacity-60 grayscale', className
      )}
    >
      <Icon className={cn('text-foreground/70', size === 'sm' ? 'size-5' : size === 'md' ? 'size-10' : 'size-16')} strokeWidth={1.4} />
      {size !== 'sm' && <span className="text-foreground/40 absolute bottom-2.5 left-3 font-mono text-[0.65rem] tracking-wider">{asset.asset_tag}</span>}
    </div>
  );
}

// "Back on 2 Nov" / "Booked from 5 Nov" line under a status, for Borrowed and Reserved assets.
export function availabilityNote(a, fmt) {
  if (a.status === 'Borrowed' && a.due_back) return `Back on ${fmt(a.due_back)}`;
  if (a.next_booking) return `Booked from ${fmt(a.next_booking)}`;
  return null;
}

export function FieldError({ children }) {
  if (!children) return null;
  return <p className="text-danger text-sm">{children}</p>;
}

// Reads a picked file as a base64 data URL after the same checks as the server (JPG/PNG, 2 MB).
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) return reject(new Error('Please choose a JPG or PNG picture'));
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error('The picture is larger than 2 MB. Please choose a smaller one'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the picture'));
    reader.readAsDataURL(file);
  });
}

const EMPTY = { asset_tag: '', name: '', category_id: '', location: '', condition: 'Good', status: 'Available', description: '', image: undefined };

// Add / edit an asset (FR-AM-01 to FR-AM-05). asset = null for a new one. onSaved(assetId) after saving.
// Status: a new asset can start Available, Under Maintenance or Retired; an Available asset can be retired.
export function AssetFormDialog({ open, onOpenChange, asset, categories, locations = [], onSaved }) {
  const editing = Boolean(asset);
  const [form, setForm] = useState(EMPTY);
  const [preview, setPreview] = useState(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm(asset ? {
      asset_tag: asset.asset_tag, name: asset.name, category_id: String(asset.category_id), location: asset.location,
      condition: asset.condition, status: asset.status, description: asset.description || '', image: undefined,
    } : EMPTY);
    setPreview(asset?.image_path || null);
    setTouched(false);
    setError(null);
  }, [open, asset]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const errors = {};
  if (!form.asset_tag.trim()) errors.asset_tag = 'Asset tag is required';
  else if (form.asset_tag.trim().length > 30) errors.asset_tag = 'At most 30 characters';
  else if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(form.asset_tag.trim())) errors.asset_tag = 'Letters, numbers and - _ . / only';
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.category_id) errors.category_id = 'Choose a category';
  if (!form.location.trim()) errors.location = 'Location is required';
  const show = (k) => touched && errors[k];

  const statusOptions = editing
    ? (asset.status === 'Available' ? ['Available', 'Retired'] : [asset.status])
    : ['Available', 'Under Maintenance', 'Retired'];

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readImage(file);
      setForm((f) => ({ ...f, image: data }));
      setPreview(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError(null);
    const body = {
      asset_tag: form.asset_tag.trim(), name: form.name.trim(), category_id: Number(form.category_id), location: form.location.trim(),
      condition: form.condition, status: form.status, description: form.description.trim(),
      ...(form.image !== undefined ? { image: form.image } : {}),
    };
    try {
      const res = editing ? await api.put(`/assets/${asset.asset_id}`, body) : await api.post('/assets', body);
      onOpenChange(false);
      onSaved?.(editing ? asset.asset_id : res.asset_id, res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${asset.name}` : 'Add an asset'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Change any detail. Its booking and repair history stays as it is.' : 'The asset tag must be unique, for example LAP-004.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-[11rem_1fr]">
            <div className="space-y-2">
              <Label>Picture</Label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group border-border hover:border-primary/60 relative block w-full overflow-hidden rounded-2xl border border-dashed transition-colors"
              >
                {preview ? (
                  <img src={preview} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <span className="text-muted-foreground flex aspect-square w-full flex-col items-center justify-center gap-2 text-xs">
                    <ImagePlus className="size-6" /> JPG or PNG, 2 MB
                  </span>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={pick} />
              {preview && (
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setPreview(null); setForm((f) => ({ ...f, image: null })); }}>
                  <X /> Remove picture
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="af-tag">Asset tag</Label>
                <Input id="af-tag" value={form.asset_tag} onChange={set('asset_tag')} placeholder="LAP-004" className="font-mono uppercase" maxLength={30} aria-invalid={Boolean(show('asset_tag'))} />
                <FieldError>{show('asset_tag')}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="af-name">Name</Label>
                <Input id="af-name" value={form.name} onChange={set('name')} placeholder="Dell Latitude 7440" maxLength={100} aria-invalid={Boolean(show('name'))} />
                <FieldError>{show('name')}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="af-cat">Category</Label>
                <NativeSelect id="af-cat" value={form.category_id} onChange={set('category_id')} aria-invalid={Boolean(show('category_id'))}>
                  <NativeSelectOption value="">Choose...</NativeSelectOption>
                  {categories.map((c) => <NativeSelectOption key={c.category_id} value={c.category_id}>{c.name}</NativeSelectOption>)}
                </NativeSelect>
                <FieldError>{show('category_id')}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="af-loc">Location</Label>
                <Input id="af-loc" list="af-locations" value={form.location} onChange={set('location')} placeholder="Floor 1 - Store Room" maxLength={100} aria-invalid={Boolean(show('location'))} />
                <datalist id="af-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
                <FieldError>{show('location')}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="af-cond">Condition</Label>
                <NativeSelect id="af-cond" value={form.condition} onChange={set('condition')}>
                  {CONDITIONS.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="af-status">Status</Label>
                <NativeSelect id="af-status" value={form.status} onChange={set('status')} disabled={statusOptions.length === 1}>
                  {statusOptions.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
                </NativeSelect>
                {editing && statusOptions.length === 1 && asset.status !== 'Retired' && (
                  <p className="text-muted-foreground text-xs">Set by {asset.status === 'Under Maintenance' ? 'its maintenance record' : 'bookings'}.</p>
                )}
                {form.status === 'Retired' && (!editing || asset.status !== 'Retired') && (
                  <p className="text-warning text-xs">Retired assets are hidden from members and their waiting requests are cancelled.</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="af-desc">Description</Label>
                <Textarea id="af-desc" rows={3} value={form.description} onChange={set('description')} maxLength={2000} placeholder="Specs, accessories, what it is good for. Search and the AI read this." />
              </div>
            </div>
          </div>

          <ErrorBox error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="brand" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />} {editing ? 'Save changes' : 'Add asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Asset picker with search, for the "New maintenance record" dialog. Lists assets that can go for repair.
function AssetPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.get(`/assets?search=${encodeURIComponent(q)}`)
        .then((d) => live && setItems(d.items))
        .catch(() => live && setItems([]))
        .finally(() => live && setLoading(false));
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or tag" className="pl-10" aria-label="Search assets" />
      </div>
      <div className="border-border max-h-56 overflow-y-auto rounded-2xl border p-1">
        {loading && !items.length && <p className="text-muted-foreground p-3 text-sm">Searching...</p>}
        {!loading && !items.length && <p className="text-muted-foreground p-3 text-sm">No assets match.</p>}
        {items.map((a) => {
          const blocked = a.status === 'Borrowed' || a.status === 'Retired' || a.status === 'Under Maintenance';
          return (
            <button
              type="button"
              key={a.asset_id}
              disabled={blocked}
              onClick={() => onChange(a)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                value?.asset_id === a.asset_id ? 'bg-primary/15 ring-primary/50 ring-1' : 'hover:bg-secondary'
              )}
            >
              <AssetThumb asset={a} size="sm" className="size-9 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="text-muted-foreground font-mono text-xs">{a.asset_tag}</span>
              </span>
              <StatusBadge status={a.status} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Open a maintenance record (FR-MT-01, 02). asset: pre-chosen asset, or null to pick one.
export function NewMaintenanceDialog({ open, onOpenChange, asset = null, onSaved }) {
  const [chosen, setChosen] = useState(asset);
  const [issue, setIssue] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) { setChosen(asset); setIssue(''); setCost(''); setError(null); }
  }, [open, asset]);

  async function submit(e) {
    e.preventDefault();
    if (!chosen) return setError(new Error('Choose the asset that needs repair'));
    if (issue.trim().length < 5) return setError(new Error('Describe the problem in a few words'));
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/maintenance', { asset_id: chosen.asset_id, issue_description: issue.trim(), ...(cost !== '' ? { cost: Number(cost) } : {}) });
      onOpenChange(false);
      onSaved?.(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Send for maintenance</DialogTitle>
            <DialogDescription>The asset becomes Under Maintenance and cannot be lent until you close the record.</DialogDescription>
          </DialogHeader>
          {asset ? (
            <div className="bg-secondary/60 flex items-center gap-3 rounded-2xl p-3">
              <AssetThumb asset={asset} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{asset.name}</p>
                <p className="text-muted-foreground font-mono text-xs">{asset.asset_tag}</p>
              </div>
              <StatusBadge status={asset.status} />
            </div>
          ) : (
            <div className="space-y-2"><Label>Asset</Label><AssetPicker value={chosen} onChange={setChosen} /></div>
          )}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between"><Label htmlFor="nm-issue">What is wrong?</Label><span className="text-muted-foreground text-xs tabular-nums">{issue.length}/500</span></div>
            <Textarea id="nm-issue" rows={3} maxLength={500} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="For example: lamp flickers after 10 minutes" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nm-cost">Estimated cost (Rs, optional)</Label>
            <Input id="nm-cost" type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>
          {chosen?.status === 'Reserved' && (
            <p className="text-warning text-sm">This asset has an approved booking waiting. Repair it in time, or cancel the booking in Approvals.</p>
          )}
          <ErrorBox error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="brand" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Wrench />} Open record</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Delete or retire confirmation text (NFR-SF-04).
export function deleteCopy(asset) {
  return {
    title: `Delete ${asset.name}?`,
    description: 'If it was ever booked or repaired, it is retired instead, so its history is kept. This cannot be undone.',
    icon: Trash2,
  };
}
