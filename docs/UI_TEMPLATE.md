# UI template: how every screen should look

The client uses **Tailwind CSS v4 + shadcn/ui** with one shared theme called **Neon Noir**:
a dark-first, futuristic look with a near-black canvas, graphite cards with big rounded corners,
**electric violet** accents and a **lime** highlight, pill-shaped buttons and navigation, and large
Space Grotesk numbers. There is no sidebar: the menu is a row of pills in a floating top bar.
A light mode exists too (sun/moon button), but dark is the default and what the app is designed for.
If everyone builds from the same pieces, the finished app looks like one product instead of four.

**See it live:** log in, click your avatar (top right) and choose **UI template**, or go to
`http://localhost:5173/ui-template`. The *Components* tab shows every piece; the *Page template*
tab shows the copy-me page running with sample rows.

## 1. Make a new screen in five steps

1. Copy `client/src/modules/_template/PageTemplate.jsx` into your module folder,
   e.g. `client/src/modules/requests/MyRequestsTable.jsx`.
2. Open your page file (the one already registered in `routes.jsx`, e.g. `MyRequestsPage.jsx`) and
   replace the `<ComingSoon ... />` placeholder with your screen. Keep the file name and the default export.
3. Swap the sample rows for your API call: `setRows(await api.get('/requests/mine'))`.
4. Change the title, description, columns and buttons. Keep the order: `Page` header, then cards
   (KPIs / filters / table).
5. Run `npm run dev` and check it in dark mode, light mode, and at phone width (390 px).

Your screen already appears in the top bar: `routes.jsx` gives every screen a `group`
(Dashboard, Assets, Operations, Activity, Reports, AI). When a role has more than six screens,
each group with several screens becomes a drop-down pill.

## 2. One import for everything

```jsx
import {
  Page, SectionTitle, StatCard, StatusBadge, DotPill, CardIcon, CardLink, ErrorBox, SuccessBox,
  EmptyState, TableSkeleton, Heatmap, BarStrip,
  Button, Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction,
  Input, Label, Textarea, NativeSelect, NativeSelectOption,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  Tabs, TabsList, TabsTrigger, TabsContent, Progress, Skeleton, Alert, AlertTitle, AlertDescription,
  Avatar, AvatarFallback, Tooltip, TooltipTrigger, TooltipContent, Separator, Sheet,
} from '../../components/ui';
import { toast } from 'sonner';                  // pop-up messages: toast.success('Saved')
import { Plus, Search, Trash2 } from 'lucide-react'; // icons: https://lucide.dev/icons
```

## 3. The app pieces (built for this project)

| Piece | Use it for | Example |
|---|---|---|
| `Page` | Every screen's frame: big title, optional grey `accent`, description, action buttons | `<Page title="Welcome back," accent={name} actions={...}>` |
| `StatCard` | A KPI number. `tone`: brand, success, warning, danger, info, neutral, lime. `to` adds a ↗ link | `<StatCard label="Pending" value={3} icon={Hourglass} tone="warning" />` |
| `StatusBadge` | Any status word from the database: dark pill with a coloured dot | `<StatusBadge status={row.status} />` |
| `DotPill` | The same pill for any label | `<DotPill tone="danger">Borrowing</DotPill>` |
| `CardIcon` | Round outlined icon before a card title | `<CardTitle><CardIcon icon={TrendingUp} /> Trend</CardTitle>` |
| `CardLink` | Round ↗ button in a card's top-right corner | `<CardAction><CardLink to="/admin/reports" /></CardAction>` |
| `Heatmap` | Activity by weekday/hour, dark-to-bright violet cells | `<Heatmap columns={['Mon', ...]} rows={[{ label: '9 am', cells: [1, 3, ...] }]} />` |
| `BarStrip` | A total split into parts (solid bar + thin strips), like assets by status | `<BarStrip items={[{ label, value, shade }]} marker="Live" />` |
| `ErrorBox` / `SuccessBox` | API errors and success messages inside the page | `<ErrorBox error={error} />` |
| `toast` (sonner) | Short pop-up after an action | `toast.success('Request approved')` |
| `EmptyState` | A list with no rows | `<EmptyState title="No requests yet">...</EmptyState>` |
| `TableSkeleton` / `Skeleton` | Grey placeholders while loading | `{loading && <TableSkeleton />}` |
| `SectionTitle` | Small spaced-out heading with a lime dot over a group of cards | `<SectionTitle>Maintenance</SectionTitle>` |

Everything else (Button, Card, Table, Dialog, Input, ...) is a standard **shadcn/ui** component, so the
official docs apply: <https://ui.shadcn.com/docs/components>.

### Buttons (all pill-shaped)

- `<Button>`: the main action, a solid white pill (black in light mode). One per area.
- `variant="brand"`: violet with a soft glow, for the one action that should pop (e.g. "View reports").
- `variant="highlight"`: lime, use rarely.
- `variant="outline"`: second action. `"secondary"`: quiet grey pill. `"ghost"`: in tables and toolbars.
- `variant="destructive"`: delete, reject. `"link"`: text link.
- Sizes: `sm`, `lg`, `icon` (round icon button), `icon-sm`. Put a lucide icon after the text for
  "go somewhere" (`View reports <ArrowUpRight />`) or before it for actions (`<Plus /> Add asset`).
- Link that looks like a button: `<Button asChild><Link to="/x">Go</Link></Button>`.

### Forms

```jsx
<div className="space-y-2">
  <Label htmlFor="purpose">Purpose</Label>
  <Input id="purpose" value={form.purpose} onChange={set('purpose')} required />
</div>
```

Use `NativeSelect` for drop-downs (a real `<select>`, so `value` and `onChange` work as usual),
`Textarea` for long text, and a `Dialog` for add/edit forms and "are you sure?" questions.
Disable the submit button and show `<Loader2 className="animate-spin" />` while saving.

### Tables

Put a table in `<Card className="overflow-hidden py-0">` so it touches the card edges. Show the main
value in `font-medium` with a small grey second line (`text-muted-foreground text-xs`), statuses with
`StatusBadge`, numbers right-aligned with `text-right tabular-nums`, and row actions in a
`DropdownMenu` behind a `MoreHorizontal` ghost icon button. `PageTemplate.jsx` shows all of this.

### Segmented pills (Week / Month / Year style)

Use `Tabs` (`TabsList` + `TabsTrigger`); they are styled as a pill group. The Reports period picker
shows the same look built from plain buttons.

## 4. Colours

Never type hex colours. Use the theme names as Tailwind classes; they switch automatically between
dark and light.

| Token | Tailwind classes | Used for |
|---|---|---|
| background | `bg-background` | page canvas (near black) |
| card | `bg-card` | cards, dialogs, menus |
| foreground | `text-foreground`, `bg-foreground` | text, the white main pill |
| secondary | `bg-secondary` | pills, inputs, chips, round icon buttons |
| primary (violet) | `bg-primary`, `text-primary`, `bg-primary/15` | accents, brand button, charts, heatmap |
| highlight (lime) | `bg-highlight`, `text-highlight-foreground` | live dots, trend line, top-3 ranks (fills only, not text on white) |
| success | `text-success`, `bg-success/12` | Available, Approved, Repaired |
| warning (amber) | `text-warning`, `bg-warning/14` | Pending, Open, Under Maintenance |
| info (sky) | `text-info` | Reserved |
| danger (rose) | `text-danger`, `bg-danger/14`, `border-danger/40` | Overdue, Rejected, errors |
| muted | `text-muted-foreground`, `bg-muted` | secondary text, skeletons |
| chart-1 ... chart-5 | `var(--chart-1)` | chart series: violet, lime, lavender, cyan, pink |

Extra helpers from `styles.css`: `font-display` (Space Grotesk, for big numbers and headings),
`text-aurora` (violet-to-lime gradient text, one or two words at most), `bg-orb` (the logo orb).
The values live in `client/src/styles.css` (`.dark` = dark, the default; `:root` = light).
Fonts are bundled, so the app works offline.

## 5. Layout rules

- Big rounded shapes: cards are `rounded-3xl`, buttons/pills `rounded-full`, inputs `rounded-xl`.
- Spacing: `gap-4` between cards, `gap-6` between sections (the `Page` already does this), `space-y-2` inside a form field.
- Grids: KPIs `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`; three cards in a row `grid gap-4 lg:grid-cols-2 xl:grid-cols-3`.
- Text: page title comes from `Page`; card titles from `CardTitle` (add a `CardIcon`); body `text-sm`; secondary `text-muted-foreground`.
- Every list needs three states: loading (skeleton), empty (`EmptyState`) and error (`ErrorBox`).
- Phones: the pill menu moves into the ☰ sheet; wide tables scroll sideways; nothing may make the page scroll sideways.

## 6. Charts

Chart.js is set up in `client/src/modules/reports/charts.js` (Misbah). Reuse it so charts match the theme:

```jsx
import { Bar, Line } from 'react-chartjs-2';
import { barData, barOptions, lineData, lineOptions, useChartTheme } from '../reports/charts';
const t = useChartTheme();               // re-reads colours when dark/light mode changes
<div className="h-72"><Bar options={barOptions(t)} data={barData(t, labels, values)} /></div>
<div className="h-52"><Line options={lineOptions(t)} data={lineData(t, labels, [{ label: 'Borrowings', values }])} /></div>
```

Bars are thin pills with a violet gradient (pass `{ color: t.series[1] }` for lime); lines glow lime
with a fading fill, and a second series with `dashed: true` draws a dotted comparison line.

## 7. Adding another shadcn component

The components are plain files in `client/src/components/ui/`, so the team owns and can read them.
To add one more (e.g. `checkbox`), ask the integrator. They run `npx shadcn@latest add checkbox`
in `client/` (settings are in `client/components.json`; JavaScript, not TypeScript), give it the
Neon Noir shapes (rounded-full / rounded-xl) and add an `export * from './checkbox';` line to
`components/ui/index.js`.

## 8. Do and don't

- Do start from `PageTemplate.jsx`; do use `StatusBadge` for every status; do test light mode and phone width.
- Do keep violet for accents and lime for one or two highlights per screen; too much lime looks noisy.
- Don't add `.css` files or `style={{ color: ... }}`; don't use `alert()`; use `toast` or `ErrorBox`.
- Don't change files in `components/`, `styles.css` or `routes.jsx`; ask the integrator.

## About "premium" shadcn

The paid shadcn kits are commercial licences. This template builds its look from the **free,
open-source shadcn/ui components** (MIT licence), inspired by modern dark dashboard concepts:
pill navigation, a big welcome headline, bar strips, a heatmap and dot pills. No paid licence is
needed and nothing here is copied from a paid kit.
