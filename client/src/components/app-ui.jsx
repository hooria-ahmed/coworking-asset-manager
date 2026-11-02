// App-level building blocks used by every screen, built on the shadcn/ui components in ./ui/.
// Import them together with the shadcn pieces:
//   import { Page, StatCard, StatusBadge, ErrorBox, Button, Card, CardContent } from '../../components/ui';
// Add new shared pieces here only after telling the integrator. Guide: docs/UI_TEMPLATE.md
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, CheckCircle2, Construction, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';

// Every screen starts with <Page>. title: big heading. accent: optional second part shown in grey
// ("Welcome back," + accent "Ayesha"). description: one line under it. actions: buttons on the right.
export function Page({ title, accent, description, actions, children, className }) {
  return (
    <section className={cn('mx-auto flex w-full max-w-[1400px] flex-col gap-6', className)}>
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-[2rem] leading-[1.05] font-medium tracking-tight md:text-[2.75rem]">
            {title}
            {accent && <span className="text-muted-foreground"> {accent}</span>}
          </h1>
          {description && <p className="text-muted-foreground text-sm md:text-[0.95rem]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// A small heading that starts a group of cards on a page.
export function SectionTitle({ children, action }) {
  return (
    <div className="-mb-2 flex items-center justify-between gap-2">
      <h2 className="text-muted-foreground flex items-center gap-2 text-[0.7rem] font-medium tracking-[0.18em] uppercase">
        <span className="bg-highlight size-1.5 rounded-full shadow-[0_0_10px] shadow-highlight" />
        {children}
      </h2>
      {action}
    </div>
  );
}

// Round icon at the start of a card title, like the reference design.
export function CardIcon({ icon: Icon, className }) {
  return (
    <span className={cn('border-border text-foreground/80 flex size-8 shrink-0 items-center justify-center rounded-full border', className)}>
      <Icon className="size-4" />
    </span>
  );
}

// Round "open" arrow for the top-right corner of a card. to: where it links.
export function CardLink({ to, label = 'Open' }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="bg-secondary hover:bg-foreground hover:text-background flex size-9 items-center justify-center rounded-full transition-colors"
    >
      <ArrowUpRight className="size-4" />
    </Link>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{String(error.message || error)}</AlertDescription>
    </Alert>
  );
}

export function SuccessBox({ message }) {
  if (!message) return null;
  return (
    <Alert variant="success">
      <CheckCircle2 />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

// Tone colours. tone: brand | success | warning | danger | info | neutral | lime
export const TONES = {
  brand: { dot: 'bg-primary', text: 'text-primary dark:text-[oklch(0.78_0.14_293)]', soft: 'bg-primary/15' },
  success: { dot: 'bg-success', text: 'text-success', soft: 'bg-success/12' },
  warning: { dot: 'bg-warning', text: 'text-warning', soft: 'bg-warning/14' },
  danger: { dot: 'bg-danger', text: 'text-danger', soft: 'bg-danger/14' },
  info: { dot: 'bg-info', text: 'text-info', soft: 'bg-info/12' },
  neutral: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', soft: 'bg-secondary' },
  lime: { dot: 'bg-highlight', text: 'text-success', soft: 'bg-highlight/15' },
};

// Tone for every status word used in the database.
export const STATUS_TONE = {
  Available: 'success', Approved: 'success', Active: 'success', Repaired: 'success',
  Reserved: 'info', Borrowed: 'brand',
  Pending: 'warning', 'In Progress': 'warning', Open: 'warning', 'Under Maintenance': 'warning',
  Overdue: 'danger', Rejected: 'danger', Inactive: 'danger', Deactivated: 'danger',
  Returned: 'neutral', Completed: 'neutral', Retired: 'neutral', Cancelled: 'neutral', Closed: 'neutral',
};

// A dark pill with a coloured dot. Works for any status word.
export function StatusBadge({ status, className }) {
  const tone = TONES[STATUS_TONE[status] || 'neutral'];
  return (
    <Badge variant="pill" className={className}>
      <span className={cn('size-1.5 rounded-full', tone.dot)} aria-hidden="true" />
      {status}
    </Badge>
  );
}

// Same pill look for any label with a tone, e.g. <DotPill tone="danger">Borrowing</DotPill>
export function DotPill({ tone = 'neutral', children, className }) {
  return (
    <Badge variant="pill" className={className}>
      <span className={cn('size-1.5 rounded-full', TONES[tone]?.dot)} aria-hidden="true" />
      {children}
    </Badge>
  );
}

// A number card (KPI). icon: a lucide-react icon. tone colours the dot and the note.
// to: optional link. alert: red ring when something needs action.
export function StatCard({ label, value, note, icon: Icon, tone = 'brand', to, alert = false, className }) {
  const t = TONES[tone] || TONES.brand;
  const body = (
    <Card
      className={cn(
        'relative h-full gap-0 overflow-hidden py-5 transition-all duration-300',
        to && 'group-hover/stat:border-foreground/20 group-hover/stat:bg-[color-mix(in_oklch,var(--card),white_3%)]',
        alert && 'border-danger/40 shadow-[0_0_32px_-12px] shadow-danger',
        className
      )}
    >
      <CardContent className="flex h-full flex-col gap-4 px-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
            <span className={cn('size-1.5 shrink-0 rounded-full', t.dot)} />
            <span className="truncate">{label}</span>
          </p>
          {to ? (
            <span className="bg-secondary group-hover/stat:bg-foreground group-hover/stat:text-background flex size-8 shrink-0 items-center justify-center rounded-full transition-colors">
              <ArrowUpRight className="size-4" />
            </span>
          ) : Icon ? (
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', t.soft, t.text)}>
              <Icon className="size-4" />
            </span>
          ) : null}
        </div>
        <div className="mt-auto space-y-1">
          <p className="font-display text-4xl font-medium tracking-tight tabular-nums">{value}</p>
          {note && <p className="text-muted-foreground truncate text-xs">{note}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="group/stat block rounded-3xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">{body}</Link> : body;
}

// Shown inside a card when there is nothing to list.
export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="border-border text-muted-foreground flex size-12 items-center justify-center rounded-full border border-dashed">
        <Icon className="size-5" />
      </span>
      {title && <p className="font-medium">{title}</p>}
      {children && <p className="text-muted-foreground max-w-sm text-sm">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Loading placeholder: a few grey bars in the shape of a table.
export function TableSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-4 px-6 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5 rounded-full" />
            <Skeleton className="h-3 w-1/4 rounded-full" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Heatmap grid (e.g. activity by weekday). rows: [{ label, cells: [number | null] }] (null = no data),
// columns: header labels. Cell colour runs from dark to bright violet by value.
export function Heatmap({ rows, columns, max, legend = true, formatTitle }) {
  const top = max ?? Math.max(1, ...rows.flatMap((r) => r.cells.filter((c) => c != null)));
  const level = (v) => (v == null ? -1 : v === 0 ? 0 : Math.min(4, Math.ceil((v / top) * 4)));
  const SHADES = [
    'bg-primary/12',
    'bg-primary/35',
    'bg-primary/60',
    'bg-primary/85',
    'bg-primary dark:bg-[oklch(0.8_0.13_293)] dark:shadow-[0_0_14px_-2px] dark:shadow-primary',
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `auto repeat(${columns.length}, minmax(0, 1fr))` }}>
        <span />
        {columns.map((c) => <span key={c} className="text-muted-foreground pb-1 text-center text-[0.7rem]">{c}</span>)}
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="text-muted-foreground flex items-center pr-2 text-[0.7rem] whitespace-nowrap">{r.label}</span>
            {r.cells.map((v, i) => (
              <span
                key={i}
                title={v == null ? undefined : formatTitle ? formatTitle(r, i, v) : String(v)}
                className={cn('aspect-[1.35] rounded-lg transition-transform hover:scale-105', v == null ? 'border-border border border-dashed' : SHADES[level(v)])}
              />
            ))}
          </div>
        ))}
      </div>
      {legend && (
        <div className="text-muted-foreground flex items-center justify-end gap-1.5 text-[0.7rem]">
          Less {SHADES.map((s) => <span key={s} className={cn('size-3 rounded-[4px]', s)} />)} More
        </div>
      )}
    </div>
  );
}

// "Bar strip": one row of segments sized by value, each drawn as a solid bar (first) or a strip of
// thin bars, with the value above and the label below. items: [{ label, value, note, shade }]
// shade: CSS colour for the bars. Used for "Assets by status" on the Dashboard.
export function BarStrip({ items, total, marker }) {
  const sum = total ?? items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative">
      {marker && (
        <div className="pointer-events-none absolute inset-x-0 top-[3.1rem] z-10 flex items-center">
          <div className="border-foreground/25 flex-1 border-t border-dashed" />
          <span className="bg-secondary text-foreground/90 ml-2 rounded-full px-3 py-1 text-xs">{marker}</span>
        </div>
      )}
      <div className="flex gap-2.5 overflow-hidden sm:gap-4">
        {items.map((it, idx) => {
          const share = sum ? it.value / sum : 0;
          const strips = Math.max(3, Math.round(share * 40));
          return (
            <div key={it.label} className="flex min-w-[3.6rem] flex-col border-l border-border pl-2.5 sm:min-w-[5.5rem] sm:pl-3" style={{ flexGrow: Math.max(share, 0.07), flexBasis: 0 }}>
              <p className="font-display text-2xl font-medium tabular-nums">{it.value}</p>
              <div className="h-10" />
              <p className="mb-2 text-xs leading-tight">
                <span className="text-foreground block font-medium">{Math.round(share * 100)}%</span>
                <span className="text-muted-foreground block truncate" title={it.label}>{it.label}</span>
              </p>
              {idx === 0 ? (
                <div className="h-11 rounded-xl" style={{ background: it.shade }} />
              ) : (
                <div className="flex h-11 justify-between gap-[3px]">
                  {Array.from({ length: strips }, (_, i) => (
                    <span key={i} className="w-1.5 max-w-1.5 flex-1 rounded-full" style={{ background: it.shade }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Placeholder used until the owner builds the real screen.
export function ComingSoon({ title, owner, reqs, endpoints = [] }) {
  return (
    <Page title={title} description="This screen is being built. It already uses the shared layout and theme.">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>
            <CardIcon icon={Construction} />
            Under construction
          </CardTitle>
          <CardDescription>Owner: {owner}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2.5">
            <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.16em] uppercase">SRS requirements</p>
            <div className="flex flex-wrap gap-1.5">
              {reqs.split(/,\s*/).map((r) => <DotPill key={r} tone="brand">{r}</DotPill>)}
            </div>
          </div>
          {endpoints.length > 0 && (
            <div className="min-w-0 space-y-2.5">
              <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.16em] uppercase">API it uses (docs/API.md)</p>
              <ul className="space-y-2">
                {endpoints.map((e) => {
                  const [method, ...path] = e.split(' ');
                  return (
                    <li key={e} className="flex items-center gap-2 font-mono text-xs">
                      <Badge variant={method === 'GET' ? 'lime' : method === 'DELETE' ? 'danger' : 'brand'} className="w-16 shrink-0 font-mono">{method}</Badge>
                      <span className="min-w-0 truncate">{path.join(' ')}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="gap-4 opacity-60" aria-hidden="true">
        <TableSkeleton rows={3} />
      </Card>
    </Page>
  );
}
