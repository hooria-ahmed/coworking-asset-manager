// Owner: integrator. Route: /ui-template (open it from the user menu, top right).
// A living style guide: every shared colour and component, plus the copy-me page template.
// docs/UI_TEMPLATE.md explains how to use them.
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlarmClock, ArrowUpRight, Bell, Boxes, CalendarDays, CheckCircle2, ClipboardList, Copy, Info, LayoutTemplate, Loader2, Palette, Plus, Sparkles, Trash2, TrendingUp,
} from 'lucide-react';
import {
  Alert, AlertDescription, AlertTitle, Badge, BarStrip, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardIcon, CardTitle, DotPill, Heatmap,
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
  EmptyState, ErrorBox, Input, Label, NativeSelect, NativeSelectOption, Page, Progress, SectionTitle, StatCard,
  StatusBadge, SuccessBox, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from '../../components/ui';
import PageTemplate from './PageTemplate';

const COLOURS = [
  { name: 'background', cls: 'bg-background border-b', use: 'Page canvas (near black)' },
  { name: 'card', cls: 'bg-card border-b', use: 'Cards, dialogs' },
  { name: 'foreground', cls: 'bg-foreground', use: 'Text, main pill buttons' },
  { name: 'secondary', cls: 'bg-secondary', use: 'Pills, inputs, chips' },
  { name: 'primary', cls: 'bg-primary', use: 'Electric violet: accents, charts' },
  { name: 'highlight', cls: 'bg-highlight', use: 'Lime: live dots, trend line' },
  { name: 'success', cls: 'bg-success', use: 'Available, Approved' },
  { name: 'warning', cls: 'bg-warning', use: 'Pending, Maintenance' },
  { name: 'danger', cls: 'bg-danger', use: 'Overdue, Rejected' },
  { name: 'chart-1 to 5', cls: 'bg-[linear-gradient(90deg,var(--chart-1)_20%,var(--chart-2)_20%_40%,var(--chart-3)_40%_60%,var(--chart-4)_60%_80%,var(--chart-5)_80%)]', use: 'Chart series' },
];

const STATUSES = ['Available', 'Reserved', 'Borrowed', 'Under Maintenance', 'Retired', 'Pending', 'Approved', 'Rejected', 'Overdue', 'Returned', 'Open', 'In Progress', 'Closed'];

function Section({ title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Components() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-6">
      <Section title="Colours" description="Theme tokens from src/styles.css. Use them as Tailwind classes, e.g. bg-primary, text-success, border-danger/30.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {COLOURS.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-2xl border">
              <div className={`h-14 ${c.cls}`} />
              <div className="p-3">
                <p className="font-mono text-xs font-medium">{c.name}</p>
                <p className="text-muted-foreground text-xs">{c.use}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <SectionTitle>Stat cards (KPI)</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total assets" value="128" icon={Boxes} tone="brand" note="Across every category" />
        <StatCard label="Available now" value="74" icon={CheckCircle2} tone="success" note="58% of all assets" />
        <StatCard label="Pending requests" value="6" icon={ClipboardList} tone="warning" note="Waiting for approval (links somewhere)" to="/ui-template" />
        <StatCard label="Overdue items" value="2" icon={AlarmClock} tone="danger" note="Past their due date" alert />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Buttons" description="Pill buttons. <Button> is the white main action; brand (violet) and highlight (lime) for the one thing you want to pop.">
          <div className="flex flex-wrap gap-2">
            <Button><Plus /> Primary</Button>
            <Button variant="brand">Brand <ArrowUpRight /></Button>
            <Button variant="highlight">Highlight</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive"><Trash2 /> Delete</Button>
            <Button variant="link">Link</Button>
            <Button disabled={busy} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 1200); }}>
              {busy ? <><Loader2 className="animate-spin" /> Saving...</> : 'Click to load'}
            </Button>
            <Button size="icon" variant="outline" aria-label="Notifications"><Bell /></Button>
          </div>
        </Section>

        <Section title="Status badges" description="<StatusBadge status=&quot;Available&quot; /> picks the colour for every status word in the database.">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <DotPill tone="brand">Multimedia</DotPill><DotPill tone="lime">Transfer</DotPill>
            <Badge variant="lime">Lime</Badge><Badge variant="brand"><Sparkles /> AI</Badge><Badge variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section title="Form fields" description="Label + Input / NativeSelect / Textarea, stacked with space-y-2.">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); toast.success('Request sent'); }}>
            <div className="space-y-2">
              <Label htmlFor="t-asset">Asset</Label>
              <NativeSelect id="t-asset" defaultValue="">
                <NativeSelectOption value="" disabled>Choose an asset</NativeSelectOption>
                <NativeSelectOption>Epson Projector</NativeSelectOption>
                <NativeSelectOption>Dell Latitude 7440</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-date">Start date</Label>
              <Input id="t-date" type="date" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="t-purpose">Purpose</Label>
              <Textarea id="t-purpose" placeholder="Client demo in Meeting Room 1" />
            </div>
            <div className="sm:col-span-2"><Button>Submit request</Button></div>
          </form>
        </Section>

        <Section title="Messages" description="ErrorBox for API errors, SuccessBox / toast for success, Alert for notes.">
          <div className="space-y-3">
            <ErrorBox error={new Error('This asset is already booked for those dates.')} />
            <SuccessBox message="Your request was sent to the admin." />
            <Alert variant="info">
              <Info />
              <AlertTitle>Tip</AlertTitle>
              <AlertDescription>Requests can be cancelled while they are still Pending.</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => toast.success('Asset saved')}>Success toast</Button>
              <Button variant="outline" onClick={() => toast.error('Could not save the asset')}>Error toast</Button>
              <Button variant="outline" onClick={() => toast('Reminder', { description: 'Return the projector by 5 pm.' })}>Info toast</Button>
            </div>
          </div>
        </Section>

        <Section title="Dialog" description="Use a Dialog for add/edit forms and confirmations.">
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">Reject request...</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject this request?</DialogTitle>
                <DialogDescription>The member sees the reason in My Requests.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="t-reason">Reason</Label>
                <Textarea id="t-reason" placeholder="The projector is booked for the board meeting." />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <DialogClose asChild><Button variant="destructive" onClick={() => toast.error('Request rejected')}>Reject</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        <Section title="Progress and empty state">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm"><span>Laptops in use</span><span className="text-muted-foreground tabular-nums">18 / 24</span></div>
              <Progress value={75} />
            </div>
            <div className="rounded-lg border border-dashed">
              <EmptyState title="No requests yet" action={<Button size="sm"><Plus /> New request</Button>}>Requests you make will show up here.</EmptyState>
            </div>
          </div>
        </Section>

        <Card>
          <CardHeader>
            <CardTitle><CardIcon icon={CalendarDays} /> Heatmap</CardTitle>
            <CardDescription>&lt;Heatmap columns rows /&gt; for activity by day or hour.</CardDescription>
          </CardHeader>
          <CardContent>
            <Heatmap
              columns={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
              rows={[
                { label: '9 am', cells: [1, 2, 4, 3, 2, 0, 0] },
                { label: '12 pm', cells: [3, 5, 6, 7, 4, 1, 0] },
                { label: '3 pm', cells: [2, 6, 8, 5, 6, 2, 1] },
                { label: '6 pm', cells: [0, 1, 2, 3, 1, 0, null] },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><CardIcon icon={TrendingUp} /> Bar strip</CardTitle>
            <CardDescription>&lt;BarStrip items marker /&gt; splits a total into parts, like assets by status.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarStrip
              marker="Live"
              items={[
                { label: 'Available', value: 74, shade: 'var(--chart-1)' },
                { label: 'Borrowed', value: 32, shade: 'oklch(0.7 0.2 293)' },
                { label: 'Reserved', value: 12, shade: 'oklch(0.8 0.1 293)' },
                { label: 'Retired', value: 10, shade: 'oklch(0.45 0.02 286)' },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Card</CardTitle>
            <CardDescription>Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">Every block of content on a page sits in a Card.</CardContent>
          <CardFooter className="justify-end gap-2 border-t">
            <Button variant="ghost">Cancel</Button><Button>Save</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function UiTemplatePage() {
  return (
    <Page
      title="UI"
      accent="template"
      description="The shared look of the app. Copy from here when you build your screens. Guide: docs/UI_TEMPLATE.md"
      actions={<DotPill tone="lime" className="h-8 px-3.5 text-sm">Neon Noir theme</DotPill>}
    >
      <Tabs defaultValue="components" className="gap-6">
        <TabsList>
          <TabsTrigger value="components"><Palette /> Components</TabsTrigger>
          <TabsTrigger value="page"><LayoutTemplate /> Page template</TabsTrigger>
        </TabsList>
        <TabsContent value="components"><Components /></TabsContent>
        <TabsContent value="page" className="space-y-4">
          <Alert variant="info">
            <Copy />
            <AlertTitle>Copy-me page</AlertTitle>
            <AlertDescription>This is src/modules/_template/PageTemplate.jsx running with sample rows. Copy the file into your module and swap the sample for your API call.</AlertDescription>
          </Alert>
          <div className="rounded-[2rem] border border-dashed p-4 md:p-6">
            <PageTemplate />
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
