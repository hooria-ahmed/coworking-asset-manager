// Owner: Azlaan. Route: /admin/assets (registered in src/routes.jsx - do not rename this file or its export).
// Manage Assets (SRS screen 8, FR-AM-01 to FR-AM-06): the whole inventory in a table, with add, edit,
// send for maintenance, retire and delete. Reserved / Borrowed assets cannot be deleted or retired, and an
// asset with history is retired instead of deleted. Every irreversible action asks first (NFR-SF-04).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Ban, Boxes, ChevronLeft, ChevronRight, CircleCheck, Eye, History, MoreHorizontal, PackageOpen, PackageSearch, Pencil, Plus,
  RefreshCw, Search, Trash2, Wrench,
} from 'lucide-react';
import api from '../../api/client';
import {
  BarStrip, Button, Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorBox, Input, NativeSelect, NativeSelectOption, Page,
  StatCard, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton,
} from '../../components/ui';
import { AssetFormDialog, AssetThumb, ConfirmDialog, NewMaintenanceDialog, STATUSES, availabilityNote, deleteCopy, fmtDate } from './parts';

const SHADES = {
  Available: 'var(--chart-1)', Reserved: 'var(--chart-4)', Borrowed: 'var(--chart-3)', 'Under Maintenance': 'var(--warning)', Retired: 'var(--muted-foreground)',
};

export default function ManageAssetsPage() {
  const [filters, setFilters] = useState({ search: '', category_id: '', status: '', location: '' });
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [maintAsset, setMaintAsset] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'retire' | 'delete', asset }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams(Object.entries({ ...filters, page }).filter(([, v]) => v));
      const [list, all] = await Promise.all([api.get(`/assets?${q}`), api.get('/assets?page=1')]);
      setData(list);
      setTotals(all.statusCounts);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  const loadLists = useCallback(() => {
    api.get('/categories').then(setCategories).catch(() => {});
    api.get('/assets/locations').then(setLocations).catch(() => {});
  }, []);
  useEffect(() => { loadLists(); }, [loadLists]);

  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => (f.search === text.trim() ? f : { ...f, search: text.trim() })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); };

  async function runConfirm() {
    const { kind, asset } = confirm;
    const res = kind === 'retire'
      ? await api.put(`/assets/${asset.asset_id}`, { status: 'Retired' })
      : await api.delete(`/assets/${asset.asset_id}`);
    toast.success(res.message);
    load();
  }

  const t = totals || {};
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const lent = (t.Reserved || 0) + (t.Borrowed || 0);

  return (
    <Page
      title="Manage"
      accent="assets"
      description="Add, edit and retire equipment. Bookings set Reserved and Borrowed; repairs set Under Maintenance."
      actions={
        <>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : undefined} /></Button>
          <Button asChild variant="outline"><Link to="/admin/categories">Categories</Link></Button>
          <Button variant="brand" onClick={() => setEditing(null)}><Plus /> Add asset</Button>
        </>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="All assets" value={total} icon={Boxes} tone="brand" note={`${categories.length} categories`} />
        <StatCard label="Available now" value={t.Available || 0} icon={CircleCheck} tone="success" note={total ? `${Math.round(((t.Available || 0) / total) * 100)}% of the inventory` : 'Nothing yet'} />
        <StatCard label="Booked or on loan" value={lent} icon={PackageOpen} tone="info" note={`${t.Reserved || 0} reserved · ${t.Borrowed || 0} borrowed`} />
        <StatCard label="Under maintenance" value={t['Under Maintenance'] || 0} icon={Wrench} tone="warning" to="/admin/maintenance" note={`${t.Retired || 0} retired`} />
      </div>

      {total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle><CardIcon icon={Boxes} /> Inventory by status</CardTitle>
            <CardDescription>Every asset in the space, split by where it is right now.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarStrip items={STATUSES.filter((s) => t[s]).map((s) => ({ label: s, value: t[s], shade: SHADES[s] }))} marker="Live" />
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-border grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input value={text} onChange={(e) => setText(e.target.value.slice(0, 100))} placeholder="Search name, tag or description" className="pl-10" aria-label="Search assets" />
          </div>
          <NativeSelect value={filters.category_id} onChange={setFilter('category_id')} aria-label="Category">
            <NativeSelectOption value="">All categories</NativeSelectOption>
            {categories.map((c) => <NativeSelectOption key={c.category_id} value={c.category_id}>{c.name}</NativeSelectOption>)}
          </NativeSelect>
          <NativeSelect value={filters.location} onChange={setFilter('location')} aria-label="Location">
            <NativeSelectOption value="">All locations</NativeSelectOption>
            {locations.map((l) => <NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>)}
          </NativeSelect>
          <NativeSelect value={filters.status} onChange={setFilter('status')} aria-label="Status">
            <NativeSelectOption value="">Any status</NativeSelectOption>
            {STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{s}{t[s] !== undefined ? ` (${t[s]})` : ''}</NativeSelectOption>)}
          </NativeSelect>
        </div>

        {loading && !data && <div className="py-4"><TableSkeleton rows={6} /></div>}
        {data && !data.items.length && (
          <EmptyState icon={PackageSearch} title={total ? 'No assets match' : 'No assets yet'} action={<Button variant="brand" onClick={() => setEditing(null)}><Plus /> Add asset</Button>}>
            {total ? 'Change the search or the filters.' : 'Add the first piece of equipment to start lending it.'}
          </EmptyState>
        )}
        {data && data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="hidden sm:table-cell">Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? 'opacity-60' : undefined}>
              {data.items.map((a) => {
                const note = availabilityNote(a, fmtDate);
                return (
                  <TableRow key={a.asset_id}>
                    <TableCell>
                      <Link to={`/assets/${a.asset_id}`} className="flex min-w-0 items-center gap-3">
                        <AssetThumb asset={a} size="sm" />
                        <span className="min-w-0">
                          <span className="block max-w-64 truncate font-medium hover:underline">{a.name}</span>
                          <span className="text-muted-foreground font-mono text-xs">{a.asset_tag}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{a.category}</TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-48 truncate lg:table-cell">{a.location}</TableCell>
                    <TableCell className="hidden sm:table-cell">{a.condition}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                      {note && <p className="text-muted-foreground mt-1 text-xs whitespace-nowrap">{note}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild><Link to={`/assets/${a.asset_id}`}><Eye /> View details</Link></DropdownMenuItem>
                          <DropdownMenuItem asChild><Link to={`/admin/history/${a.asset_id}`}><History /> Usage history</Link></DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setEditing(a)}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuItem disabled={['Borrowed', 'Retired', 'Under Maintenance'].includes(a.status)} onSelect={() => setMaintAsset(a)}><Wrench /> Send for maintenance</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled={a.status !== 'Available'} onSelect={() => setConfirm({ kind: 'retire', asset: a })}><Ban /> Retire</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" disabled={['Reserved', 'Borrowed', 'Under Maintenance'].includes(a.status)} onSelect={() => setConfirm({ kind: 'delete', asset: a })}><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {data && data.total > 0 && (
          <div className="border-border text-muted-foreground flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span>Page {data.page} of {data.pages} · {data.total} assets</span>
            <div className="flex gap-2">
              <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft /></Button>
              <Button variant="outline" size="icon-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight /></Button>
            </div>
          </div>
        )}
      </Card>

      <AssetFormDialog
        open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} asset={editing || null}
        categories={categories} locations={locations}
        onSaved={(_, res) => { toast.success(res.message || 'Asset added'); load(); loadLists(); }}
      />
      <NewMaintenanceDialog open={Boolean(maintAsset)} onOpenChange={(o) => !o && setMaintAsset(null)} asset={maintAsset} onSaved={(res) => { toast.success(res.message); load(); }} />
      {confirm && (
        <ConfirmDialog
          open onOpenChange={(o) => !o && setConfirm(null)}
          title={confirm.kind === 'retire' ? `Retire ${confirm.asset.name}?` : deleteCopy(confirm.asset).title}
          description={confirm.kind === 'retire'
            ? 'It will be hidden from members and can no longer be booked. Waiting requests are cancelled and the members are told. This cannot be undone.'
            : deleteCopy(confirm.asset).description}
          confirmLabel={confirm.kind === 'retire' ? 'Retire asset' : 'Delete'} confirmIcon={confirm.kind === 'retire' ? Ban : Trash2}
          variant="destructive" onConfirm={runConfirm}
        />
      )}
    </Page>
  );
}
