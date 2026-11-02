// Owner: Misbah. Route: /admin/reports (registered in src/routes.jsx - do not rename this file or its export).
// Reports (FR-RP-03 to FR-RP-05, FR-AI-08): usage charts for a chosen period, a maintenance summary,
// AI feature usage with the question log, and CSV / PDF export.
// Data: GET /api/reports/usage, /maintenance, /ai (in AiActivity.jsx), /export.
import { useCallback, useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Activity, Ban, Boxes, CalendarRange, CheckCircle2, CircleDollarSign, ClipboardList, Download, FileSpreadsheet, FileText,
  Hammer, Hourglass, Loader2, PackageCheck, Repeat2, ShieldCheck, Wrench, XCircle,
} from 'lucide-react';
import api from '../../api/client';
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle, ErrorBox, Input, Label, NativeSelect, NativeSelectOption,
  Page, SectionTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { Tile, Panel, Empty } from './parts';
import AiActivity from './AiActivity';
import { barData, barOptions, useChartTheme } from './charts';
import { fmtDate, fmtMoney, todayISO, downloadReport, CURRENCY } from './format';

function monthStart() {
  const t = todayISO();
  return `${t.slice(0, 8)}01`;
}

const PRESETS = [
  { id: '7', label: 'Last 7 days', range: () => [todayISO(-6), todayISO()] },
  { id: '30', label: 'Last 30 days', range: () => [todayISO(-29), todayISO()] },
  { id: 'month', label: 'This month', range: () => [monthStart(), todayISO()] },
  { id: '90', label: 'Last 90 days', range: () => [todayISO(-89), todayISO()] },
  { id: 'year', label: 'This year', range: () => [`${todayISO().slice(0, 4)}-01-01`, todayISO()] },
];

const REPORT_TYPES = [
  { value: 'usage', label: 'Asset usage (selected period)' },
  { value: 'maintenance', label: 'Maintenance (selected period)' },
  { value: 'assets', label: 'Asset register (all assets, today)' },
  { value: 'ai', label: 'AI questions and answers (selected period)' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function periodLabel(period, unit) {
  if (unit === 'month') return `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(2, 4)}`;
  return `${Number(period.slice(8, 10))} ${MONTHS[Number(period.slice(5, 7)) - 1]}`;
}

export default function ReportsPage() {
  const [preset, setPreset] = useState('30');
  const [range, setRange] = useState(() => PRESETS[1].range());
  const [draft, setDraft] = useState(range);
  const [usage, setUsage] = useState(null);
  const [maint, setMaint] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState('usage');
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  const load = useCallback(async ([from, to]) => {
    setLoading(true);
    setError(null);
    try {
      const q = `from=${from}&to=${to}`;
      const [u, m] = await Promise.all([api.get(`/reports/usage?${q}`), api.get(`/reports/maintenance?${q}`)]);
      setUsage(u);
      setMaint(m);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  function choosePreset(p) {
    const r = p.range();
    setPreset(p.id);
    setDraft(r);
    setRange(r);
  }

  function applyCustom(e) {
    e.preventDefault();
    if (!draft[0] || !draft[1]) return setError(new Error('Choose both a start and an end date'));
    if (draft[1] < draft[0]) return setError(new Error('The end date cannot be before the start date'));
    setPreset(null);
    setRange([...draft]);
  }

  async function exportFile(format) {
    setExporting(format);
    setExportError(null);
    try {
      await downloadReport({ type: exportType, format, from: range[0], to: range[1] });
    } catch (err) {
      setExportError(err);
    } finally {
      setExporting(null);
    }
  }

  const req = usage?.requests;
  const totalRequests = req ? Object.values(req).reduce((a, b) => a + b, 0) : 0;
  const usedCategories = usage?.byCategory.filter((c) => c.times > 0) ?? [];
  const t = useChartTheme();

  return (
    <Page
      title="Reports"
      accent="& analytics"
      description={<>Usage and maintenance from <span className="text-foreground font-medium">{fmtDate(range[0])}</span> to <span className="text-foreground font-medium">{fmtDate(range[1])}</span>.</>}
      actions={
        <Button variant="outline" onClick={() => document.getElementById('export')?.scrollIntoView({ behavior: 'smooth' })}>
          <Download /> Export
        </Button>
      }
    >
      <Card className="gap-0 py-5">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 px-5">
          <div className="space-y-2">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"><CalendarRange className="size-3.5" /> Period</p>
            <div className="bg-secondary inline-flex flex-wrap gap-1 rounded-full p-1" role="group" aria-label="Period">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePreset(p)}
                  className={cn(
                    'cursor-pointer rounded-full px-4 py-2 text-sm transition-all',
                    preset === p.id ? 'bg-card text-foreground font-medium shadow-sm dark:bg-white/12' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={applyCustom}>
            <div className="space-y-2">
              <Label htmlFor="rp-from" className="text-muted-foreground text-xs">From</Label>
              <Input id="rp-from" type="date" className="w-40" value={draft[0]} max={draft[1] || undefined} onChange={(e) => setDraft([e.target.value, draft[1]])} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rp-to" className="text-muted-foreground text-xs">To</Label>
              <Input id="rp-to" type="date" className="w-40" value={draft[1]} min={draft[0] || undefined} onChange={(e) => setDraft([draft[0], e.target.value])} />
            </div>
            <Button disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : null} Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      <ErrorBox error={error} />

      {!usage && loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[7.5rem] rounded-xl" />)}
        </div>
      )}

      {usage && maint && (
        <div className={cn('flex flex-col gap-6 transition-opacity', loading && 'opacity-60')}>
          <SectionTitle>Asset usage</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile value={usage.totalBorrowings} label="Borrowings" color="navy" icon={Repeat2} note="Assets issued in this period" />
            <Tile value={usage.mostUsed.length} label="Different assets used" color="blue" icon={Boxes} />
            <Tile value={totalRequests} label="Requests made" color="blue" icon={ClipboardList} />
            <Tile value={req.Approved + req.Completed} label="Approved or completed" color="green" icon={CheckCircle2} />
            <Tile value={req.Rejected} label="Rejected" color="red" icon={XCircle} />
            <Tile value={req.Pending} label="Still pending" color="amber" icon={Hourglass} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={`Borrowings per ${usage.timeline.unit}`} icon={Activity} description="How often assets were issued">
              {usage.totalBorrowings === 0 ? (
                <Empty icon={Activity}>No assets were borrowed in this period.</Empty>
              ) : (
                <div className="h-72">
                  <Bar
                    aria-label={`Bar chart of borrowings per ${usage.timeline.unit}`}
                    options={barOptions(t)}
                    data={barData(t, usage.timeline.points.map((p) => periodLabel(p.period, usage.timeline.unit)), usage.timeline.points.map((p) => p.times))}
                  />
                </div>
              )}
            </Panel>
            <Panel title="Usage by category" icon={Boxes} description="Borrowings in each asset category">
              {usedCategories.length === 0 ? (
                <Empty icon={Activity}>No usage to show for this period.</Empty>
              ) : (
                <div className="h-72">
                  <Bar
                    aria-label="Bar chart of borrowings per category"
                    options={barOptions(t, { horizontal: true })}
                    data={barData(t, usage.byCategory.map((c) => c.category), usage.byCategory.map((c) => c.times), { horizontal: true, color: t.series[1] })}
                  />
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Most-used assets" icon={Repeat2} description="Ranked by number of borrowings" count={usage.mostUsed.length}>
              {usage.mostUsed.length === 0 ? (
                <Empty icon={Activity}>No assets were borrowed in this period.</Empty>
              ) : (
                <div className="h-80">
                  <Bar
                    aria-label="Bar chart of the most-used assets"
                    options={barOptions(t, { horizontal: true })}
                    data={barData(t, usage.mostUsed.map((a) => a.name), usage.mostUsed.map((a) => a.times), { horizontal: true, color: t.series[2] })}
                  />
                </div>
              )}
            </Panel>
            <Panel flush title="Most-used assets: details" icon={ClipboardList} description="Times borrowed and days in use">
              {usage.mostUsed.length === 0 ? (
                <Empty>Nothing to list.</Empty>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Asset</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Times</TableHead><TableHead className="text-right">Days in use</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {usage.mostUsed.map((a, i) => (
                      <TableRow key={a.asset_id}>
                        <TableCell>
                          <span className={cn('flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums', i < 3 ? 'bg-highlight text-highlight-foreground' : 'bg-secondary text-muted-foreground')}>{i + 1}</span>
                        </TableCell>
                        <TableCell><p className="font-medium">{a.name}</p><p className="text-muted-foreground font-mono text-xs">{a.asset_tag}</p></TableCell>
                        <TableCell className="text-muted-foreground">{a.category}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{a.times}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.days}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>

          <SectionTitle>Maintenance</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile value={maint.total} label="Problems reported" color="navy" icon={Wrench} />
            <Tile value={maint.open} label="Open or in progress" color="amber" icon={Hammer} note={maint.inProgress ? `${maint.inProgress} in progress` : undefined} />
            <Tile value={maint.closed} label="Closed" color="gray" icon={ShieldCheck} />
            <Tile value={maint.repaired} label="Repaired" color="green" icon={PackageCheck} />
            <Tile value={maint.retired} label="Retired (not repairable)" color="red" icon={Ban} />
            <Tile value={fmtMoney(maint.totalCost)} label="Total cost" color="blue" icon={CircleDollarSign} />
          </div>
          <Panel flush title="Maintenance cost by asset" icon={CircleDollarSign} description="Repairs logged in this period" count={maint.byAsset.length}>
            {maint.byAsset.length === 0 ? (
              <Empty icon={Wrench}>No maintenance was reported in this period.</Empty>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead className="text-right">Records</TableHead><TableHead className="text-right">Cost ({CURRENCY})</TableHead></TableRow></TableHeader>
                <TableBody>
                  {maint.byAsset.map((a) => (
                    <TableRow key={a.asset_id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.records}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtMoney(a.cost).replace(`${CURRENCY} `, '')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </div>
      )}

      <AiActivity range={range} />

      <Card id="export" className="scroll-mt-24 gap-5">
        <CardHeader>
          <CardTitle><CardIcon icon={Download} /> Export a report</CardTitle>
          <CardDescription>
            {exportType === 'assets'
              ? 'The asset register lists every asset with its current status.'
              : `Uses the period above: ${fmtDate(range[0])} to ${fmtDate(range[1])}. CSV opens in Excel.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorBox error={exportError} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs space-y-2">
              <Label htmlFor="rp-type">Report</Label>
              <NativeSelect id="rp-type" value={exportType} onChange={(e) => setExportType(e.target.value)}>
                {REPORT_TYPES.map((r) => <NativeSelectOption key={r.value} value={r.value}>{r.label}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <Button variant="brand" onClick={() => exportFile('pdf')} disabled={Boolean(exporting)}>
              {exporting === 'pdf' ? <Loader2 className="animate-spin" /> : <FileText />} {exporting === 'pdf' ? 'Preparing...' : 'Download PDF'}
            </Button>
            <Button variant="outline" onClick={() => exportFile('csv')} disabled={Boolean(exporting)}>
              {exporting === 'csv' ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} {exporting === 'csv' ? 'Preparing...' : 'Download CSV'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
