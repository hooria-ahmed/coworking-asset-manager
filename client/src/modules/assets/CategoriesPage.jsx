// Owner: Azlaan. Route: /admin/categories (registered in src/routes.jsx - do not rename this file or its export).
// Categories (FR-AM-07): add, rename in place, and delete categories that no asset uses.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Loader2, Pencil, Plus, RefreshCw, Tags, Trash2, X } from 'lucide-react';
import api from '../../api/client';
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle, EmptyState, ErrorBox, Input, Label, Page, StatCard,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton, Tooltip, TooltipContent, TooltipTrigger,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { ConfirmDialog, categoryIcon, plural } from './parts';

function AddCategory({ onAdded }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError(new Error('Give the category a name'));
    setBusy(true);
    setError(null);
    try {
      await api.post('/categories', { name: form.name.trim(), description: form.description.trim() });
      toast.success(`Category "${form.name.trim()}" added`);
      setForm({ name: '', description: '' });
      onAdded();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><CardIcon icon={Plus} /> New category</CardTitle>
        <CardDescription>Group similar equipment so members can filter the catalogue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={form.name} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="For example: Tablet" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description (optional)</Label>
            <Input id="cat-desc" value={form.description} maxLength={255} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="iPads and Android tablets" />
          </div>
          <ErrorBox error={error} />
          <Button type="submit" variant="brand" className="w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Add category</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function CategoriesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null); // { category_id, name, description }
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/categories'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveEdit(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      const { message } = await api.patch(`/categories/${edit.category_id}`, { name: edit.name, description: edit.description });
      toast.success(message);
      setEdit(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const { message } = await api.delete(`/categories/${deleting.category_id}`);
    toast.success(message);
    load();
  }

  const totalAssets = rows.reduce((s, r) => s + r.asset_count, 0);
  const unused = rows.filter((r) => r.asset_count === 0).length;
  const biggest = rows.reduce((top, r) => (!top || r.active_count > top.active_count ? r : top), null);

  return (
    <Page
      title="Asset"
      accent="categories"
      description="Rename a category in place. A category can only be deleted when no asset uses it."
      actions={
        <>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : undefined} /></Button>
          <Button asChild variant="outline"><Link to="/admin/assets">Manage assets</Link></Button>
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Categories" value={rows.length} icon={Tags} tone="brand" note={`${unused} not used yet`} />
        <StatCard label="Assets in them" value={totalAssets} icon={categoryIcon('')} tone="info" note="Retired ones included" />
        <StatCard label="Largest" value={biggest ? biggest.active_count : 0} icon={categoryIcon(biggest?.name)} tone="lime" note={biggest ? biggest.name : 'No categories'} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="overflow-hidden py-0 lg:order-1">
          {loading && !rows.length ? <div className="py-4"><TableSkeleton /></div> : !rows.length ? (
            <EmptyState icon={Tags} title="No categories yet">Add the first one with the form.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Category</TableHead><TableHead className="text-right">Assets</TableHead><TableHead className="w-28 text-right"><span className="sr-only">Actions</span></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const Icon = categoryIcon(c.name);
                  const isEditing = edit?.category_id === c.category_id;
                  return (
                    <TableRow key={c.category_id}>
                      <TableCell>
                        {isEditing ? (
                          <form onSubmit={saveEdit} className="grid gap-2 sm:grid-cols-2">
                            <Input autoFocus value={edit.name} maxLength={60} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} aria-label="Category name" onKeyDown={(e) => e.key === 'Escape' && setEdit(null)} />
                            <Input value={edit.description} maxLength={255} onChange={(e) => setEdit((x) => ({ ...x, description: e.target.value }))} placeholder="Description" aria-label="Description" />
                            <button type="submit" className="hidden" />
                          </form>
                        ) : (
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full dark:text-[oklch(0.82_0.12_293)]"><Icon className="size-4" /></span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{c.name}</p>
                              <p className="text-muted-foreground max-w-md truncate text-xs">{c.description || 'No description'}</p>
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link to={`/assets?category_id=${c.category_id}`} className={cn('hover:underline', !c.asset_count && 'text-muted-foreground')}>{c.active_count}</Link>
                        {c.asset_count > c.active_count && <p className="text-muted-foreground text-xs">+{c.asset_count - c.active_count} retired</p>}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <Button size="icon-sm" variant="brand" onClick={saveEdit} disabled={saving} aria-label="Save">{saving ? <Loader2 className="animate-spin" /> : <Check />}</Button>
                            <Button size="icon-sm" variant="ghost" onClick={() => setEdit(null)} aria-label="Cancel"><X /></Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button size="icon-sm" variant="ghost" onClick={() => setEdit({ category_id: c.category_id, name: c.name, description: c.description || '' })} aria-label={`Rename ${c.name}`}><Pencil /></Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button size="icon-sm" variant="ghost" className="hover:text-danger" disabled={c.asset_count > 0} onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}><Trash2 /></Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{c.asset_count > 0 ? `Used by ${plural(c.asset_count, 'asset')}` : 'Delete'}</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
        <div className="lg:order-2"><AddCategory onAdded={load} /></div>
      </div>

      {deleting && (
        <ConfirmDialog
          open onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete "${deleting.name}"?`} description="No asset uses it, so nothing else changes. This cannot be undone."
          confirmLabel="Delete" confirmIcon={Trash2} variant="destructive" onConfirm={remove}
        />
      )}
    </Page>
  );
}
