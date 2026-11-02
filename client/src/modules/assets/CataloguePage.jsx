// Owner: Azlaan. Route: /assets (registered in src/routes.jsx - do not rename this file or its export).
// Asset Catalogue (SRS screen 3, FR-AS-01 to FR-AS-03, FR-AS-05, FR-RQ-01): search by name, tag or
// description, combine filters, 20 results a page. Members never see Retired assets (the server hides them).
// Filters live in the URL (?search=&category_id=...), so Back and shared links keep them.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRight, ChevronLeft, ChevronRight, MapPin, PackageSearch, Plus, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Button, Card, CardContent, DotPill, EmptyState, ErrorBox, Input, NativeSelect, NativeSelectOption, Page, Skeleton, StatusBadge,
  STATUS_TONE, TONES,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { AssetFormDialog, AssetThumb, CONDITIONS, availabilityNote, fmtDate } from './parts';

const FILTER_KEYS = ['search', 'category_id', 'location', 'status', 'condition', 'sort'];

function AssetCard({ a, isAdmin }) {
  const navigate = useNavigate();
  const note = availabilityNote(a, fmtDate);
  return (
    <Card className="group hover:border-foreground/20 relative gap-0 overflow-hidden p-2.5 transition-all duration-300 hover:-translate-y-0.5">
      <Link to={`/assets/${a.asset_id}`} className="absolute inset-0 z-0 rounded-3xl" aria-label={`Open ${a.name}`} />
      <div className="pointer-events-none relative">
        <AssetThumb asset={a} />
        <StatusBadge status={a.status} className="bg-background/80 absolute top-2.5 left-2.5 backdrop-blur" />
      </div>
      <CardContent className="pointer-events-none relative flex flex-1 flex-col gap-3 px-2.5 pt-4 pb-2">
        <div className="min-w-0">
          <p className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
            <span className="font-mono">{a.asset_tag}</span><span aria-hidden="true">·</span><span className="truncate">{a.category}</span>
          </p>
          <h3 className="font-display truncate text-lg leading-tight font-medium">{a.name}</h3>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{a.location}</span></p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-muted-foreground truncate text-xs">{note || `${a.condition} condition`}</span>
          {!isAdmin && a.status === 'Available' ? (
            <Button size="sm" variant="brand" className="pointer-events-auto relative z-10" onClick={() => navigate(`/request/${a.asset_id}`)}>Request</Button>
          ) : (
            <span className="bg-secondary group-hover:bg-foreground group-hover:text-background flex size-8 items-center justify-center rounded-full transition-colors">
              <ArrowUpRight className="size-4" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GridSkeleton() {
  return Array.from({ length: 8 }, (_, i) => (
    <Card key={i} className="gap-3 p-2.5">
      <Skeleton className="aspect-[16/10] w-full rounded-[1.25rem]" />
      <div className="space-y-2 px-2.5 pb-2"><Skeleton className="h-3 w-1/3 rounded-full" /><Skeleton className="h-5 w-3/4 rounded-full" /><Skeleton className="h-3 w-1/2 rounded-full" /></div>
    </Card>
  ));
}

export default function CataloguePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [text, setText] = useState(filters.search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => {});
    api.get('/assets/locations').then(setLocations).catch(() => {});
  }, []);

  // Update the URL; any filter change goes back to page 1.
  function update(changes, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  }

  // Search as you type (FR-AS-01), 300 ms after the last key.
  useEffect(() => {
    if (text === filters.search) return undefined;
    const t = setTimeout(() => update({ search: text.trim() }), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = params.toString();
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api.get(`/assets?${query}`)
      .then((d) => live && setData(d))
      .catch((err) => live && setError(err))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [query, reload]);

  const active = FILTER_KEYS.filter((k) => k !== 'search' && k !== 'sort' && filters[k]);
  const catName = (id) => categories.find((c) => String(c.category_id) === id)?.name || 'Category';
  const statusChips = useMemo(() => Object.entries(data?.statusCounts || {}), [data]);
  const allCount = statusChips.reduce((s, [, n]) => s + n, 0);
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <Page
      title="Asset"
      accent="catalogue"
      description={isAdmin ? 'Everything in the space, including retired assets. Open one to edit it or see its history.' : 'Find equipment, check when it is free, and request it.'}
      actions={
        <>
          <Button asChild variant="outline"><Link to="/ai/recommend"><Sparkles /> Ask AI</Link></Button>
          {isAdmin && <Button onClick={() => setAdding(true)}><Plus /> Add asset</Button>}
        </>
      }
    >
      <Card className="gap-4 py-4">
        <CardContent className="space-y-4 px-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
              <Input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 100))}
                placeholder="Search by name, tag or description, e.g. laptop, PRJ-001, video editing"
                className="h-11 rounded-full pr-10 pl-11"
                aria-label="Search assets"
              />
              {text && (
                <button type="button" onClick={() => { setText(''); update({ search: '' }); }} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3.5 -translate-y-1/2" aria-label="Clear search">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant={showFilters || active.length ? 'secondary' : 'outline'} className="h-11 flex-1 sm:flex-none" onClick={() => setShowFilters((s) => !s)}>
                <SlidersHorizontal /> Filters{active.length > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums">{active.length}</span>}
              </Button>
              <NativeSelect value={filters.sort} onChange={(e) => update({ sort: e.target.value })} className="h-11 w-36 rounded-full" aria-label="Sort">
                <NativeSelectOption value="">Name A-Z</NativeSelectOption>
                <NativeSelectOption value="newest">Newest first</NativeSelectOption>
                <NativeSelectOption value="tag">Asset tag</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          {showFilters && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NativeSelect value={filters.category_id} onChange={(e) => update({ category_id: e.target.value })} aria-label="Category">
                <NativeSelectOption value="">All categories</NativeSelectOption>
                {categories.map((c) => <NativeSelectOption key={c.category_id} value={c.category_id}>{c.name}</NativeSelectOption>)}
              </NativeSelect>
              <NativeSelect value={filters.location} onChange={(e) => update({ location: e.target.value })} aria-label="Location">
                <NativeSelectOption value="">All locations</NativeSelectOption>
                {locations.map((l) => <NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>)}
              </NativeSelect>
              <NativeSelect value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
                <NativeSelectOption value="">Any status</NativeSelectOption>
                {statusChips.map(([s]) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
              </NativeSelect>
              <NativeSelect value={filters.condition} onChange={(e) => update({ condition: e.target.value })} aria-label="Condition">
                <NativeSelectOption value="">Any condition</NativeSelectOption>
                {CONDITIONS.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          )}

          {/* Status chips: counts for the current search and filters (FR-AS-02) */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            <button
              type="button"
              onClick={() => update({ status: '' })}
              className={cn('flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors', !filters.status ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground')}
            >
              All <span className="tabular-nums opacity-70">{allCount}</span>
            </button>
            {statusChips.map(([s, n]) => (
              <button
                type="button"
                key={s}
                onClick={() => update({ status: filters.status === s ? '' : s })}
                className={cn('flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors', filters.status === s ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground')}
              >
                <span className={cn('size-1.5 rounded-full', TONES[STATUS_TONE[s]]?.dot)} />{s} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>

          {active.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {active.map((k) => (
                <button key={k} type="button" onClick={() => update({ [k]: '' })} className="group">
                  <DotPill tone="brand" className="group-hover:bg-foreground group-hover:text-background">
                    {k === 'category_id' ? catName(filters[k]) : filters[k]} <X className="size-3" />
                  </DotPill>
                </button>
              ))}
              <Button variant="link" size="sm" onClick={() => { setText(''); setParams({}, { replace: true }); }}>Clear all</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ErrorBox error={error} />

      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {data ? (data.total ? <>Showing <span className="text-foreground tabular-nums">{from}-{to}</span> of <span className="text-foreground tabular-nums">{data.total}</span> assets</> : 'No matches') : 'Loading...'}
        </p>
      </div>

      <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4', loading && data && 'opacity-60 transition-opacity')}>
        {!data && loading && <GridSkeleton />}
        {data?.items.map((a) => <AssetCard key={a.asset_id} a={a} isAdmin={isAdmin} />)}
      </div>

      {data && !data.total && (
        <Card>
          <EmptyState
            icon={PackageSearch}
            title="Nothing matches your search"
            action={<div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => { setText(''); setParams({}, { replace: true }); }}>Clear filters</Button><Button asChild variant="brand"><Link to="/ai/recommend"><Sparkles /> Ask the AI</Link></Button></div>}
          >
            Try fewer words or remove a filter. The AI Recommendation can also suggest a similar asset.
          </EmptyState>
        </Card>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, true)} aria-label="Previous page"><ChevronLeft /></Button>
          {Array.from({ length: data.pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === data.pages || Math.abs(p - page) <= 1)
            .map((p, i, arr) => (
              <span key={p} className="flex items-center gap-2">
                {i > 0 && p - arr[i - 1] > 1 && <span className="text-muted-foreground">…</span>}
                <Button variant={p === page ? 'default' : 'secondary'} size="icon" onClick={() => update({ page: String(p) }, true)} aria-current={p === page ? 'page' : undefined}>{p}</Button>
              </span>
            ))}
          <Button variant="outline" size="icon" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) }, true)} aria-label="Next page"><ChevronRight /></Button>
        </div>
      )}

      {isAdmin && (
        <AssetFormDialog open={adding} onOpenChange={setAdding} asset={null} categories={categories} locations={locations} onSaved={() => { toast.success('Asset added'); setReload((n) => n + 1); }} />
      )}
    </Page>
  );
}
