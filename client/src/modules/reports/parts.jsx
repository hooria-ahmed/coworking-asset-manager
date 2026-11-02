// Building blocks for the Dashboard and Reports screens (Misbah), built on the shared shadcn/ui pieces.
import { Badge, Card, CardAction, CardDescription, CardHeader, CardIcon, CardTitle, EmptyState, StatCard } from '../../components/ui';
import { cn } from '@/lib/utils';

// Old colour names -> StatCard tones.
const TONE = { green: 'success', blue: 'info', navy: 'brand', amber: 'warning', red: 'danger', gray: 'neutral' };

// A number tile. color: green | blue | amber | red | gray | navy. icon: lucide icon. to: optional link.
export function Tile({ value, label, note, color = 'blue', icon, to, alert = false }) {
  return <StatCard value={value} label={label} note={note} tone={TONE[color] || color} icon={icon} to={to} alert={alert} />;
}

// A card with a title row. icon: lucide icon in a ring before the title. flush: content touches the card edges (tables).
export function Panel({ title, icon, description, count, action, children, flush = false, className }) {
  return (
    <Card className={cn('gap-4 overflow-hidden', flush && 'pb-0', className)}>
      <CardHeader>
        <CardTitle>
          {icon && <CardIcon icon={icon} />}
          {title}
          {count !== undefined && <Badge variant="secondary" className="tabular-nums">{count}</Badge>}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <div className={cn(!flush && 'px-6')}>{children}</div>
    </Card>
  );
}

export function Empty({ children, icon }) {
  return <EmptyState icon={icon}>{children}</EmptyState>;
}
