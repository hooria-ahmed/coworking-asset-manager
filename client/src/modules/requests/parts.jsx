// Small building blocks shared by Hamza's screens (Requests, Approvals, Issue/Return, Users),
// built on the shared shadcn/ui pieces. Dates use Misbah's format helpers so every screen matches.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Avatar, AvatarFallback, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorBox,
} from '../../components/ui';
import { fmtDate, plural } from '../reports/format';

export { fmtDate, plural };

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Avatar + name + a small grey second line.
export function Person({ name, sub }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
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

// "2 Nov 2026 to 4 Nov 2026" with "3 days" under it.
export function Dates({ start, end, days, sub }) {
  return (
    <div className="whitespace-nowrap">
      <p>{fmtDate(start)}{end && end !== start && <span className="text-muted-foreground"> to </span>}{end && end !== start && fmtDate(end)}</p>
      <p className="text-muted-foreground text-xs">{sub ?? (days ? plural(days, 'day') : null)}</p>
    </div>
  );
}

// Grey box listing the key facts of a request or loan inside a dialog. rows: [[label, value], ...]
export function Facts({ rows }) {
  return (
    <dl className="bg-secondary/60 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl p-4 text-sm">
      {rows.filter(Boolean).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// "Are you sure?" dialog (SRS GUI standards, NFR-SF-04). onConfirm may be async; errors show inside.
// canConfirm: false keeps the button disabled (e.g. a required reason is empty).
export function ConfirmDialog({
  open, onOpenChange, title, description, children, confirmLabel = 'Confirm', confirmIcon: Icon, variant = 'brand',
  onConfirm, canConfirm = true,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { setError(null); onOpenChange(o); } }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <ErrorBox error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant={variant} disabled={busy || !canConfirm}>
              {busy ? <Loader2 className="animate-spin" /> : Icon && <Icon />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Counts rows by a key: countBy(rows, 'status') -> { Pending: 2, ... }
export function countBy(rows, key) {
  return rows.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] || 0) + 1 }), {});
}
