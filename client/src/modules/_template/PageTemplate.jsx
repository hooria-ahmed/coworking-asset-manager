// COPY-ME PAGE TEMPLATE. Copy this file into your module folder, rename it, and replace the
// placeholder export in your page file with it. Steps are in docs/UI_TEMPLATE.md.
//
// Pattern every list screen follows:
//   1. load data from the API (api client), keep loading / error state
//   2. <Page> header with title, one-line description and action buttons
//   3. optional StatCards, then a filter bar, then a Card with a Table
//   4. skeleton while loading, EmptyState when the list is empty, ErrorBox on errors, toast on success
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MoreHorizontal, PackageSearch, Plus, Search } from 'lucide-react';
import api from '../../api/client';
import {
  Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  EmptyState, ErrorBox, Input, NativeSelect, NativeSelectOption, Page, StatusBadge, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow, TableSkeleton,
} from '../../components/ui';

// Sample rows so the template shows something without a server. Delete when you call the real API.
const SAMPLE = [
  { id: 1, tag: 'AST-0001', name: 'Dell Latitude 7440', category: 'Laptops', location: 'Floor 2, Locker A', status: 'Available' },
  { id: 2, tag: 'AST-0007', name: 'Epson EB-FH52 Projector', category: 'Projectors', location: 'Meeting Room 1', status: 'Borrowed' },
  { id: 3, tag: 'AST-0012', name: 'Logitech Rally Bar', category: 'Video conferencing', location: 'Board Room', status: 'Under Maintenance' },
  { id: 4, tag: 'AST-0015', name: 'Sony A7 IV Camera', category: 'Cameras', location: 'Media Room', status: 'Reserved' },
  { id: 5, tag: 'AST-0021', name: 'iPad Pro 12.9"', category: 'Tablets', location: 'Front Desk', status: 'Retired' },
];

export default function PageTemplate({ sample = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Real screen: setRows(await api.get('/assets'));
      setRows(sample ? SAMPLE : await api.get('/assets'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [sample]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => rows.filter((r) => (!status || r.status === status) && r.name.toLowerCase().includes(search.toLowerCase())),
    [rows, search, status]
  );

  return (
    <Page
      title="Page title"
      description="One short line that says what this screen is for."
      actions={<Button onClick={() => toast.success('Asset added')}><Plus /> Add asset</Button>}
    >
      <ErrorBox error={error} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input placeholder="Search by name..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-48">
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {['Available', 'Reserved', 'Borrowed', 'Under Maintenance', 'Retired'].map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
          </NativeSelect>
        </div>
      </div>

      {/* Table in a card. Use pb-0/py-0 on the card so the table touches the edges. */}
      <Card className="overflow-hidden py-0">
        {loading ? (
          <div className="py-4"><TableSkeleton /></div>
        ) : shown.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No assets found" action={<Button variant="outline" onClick={() => { setSearch(''); setStatus(''); }}>Clear filters</Button>}>
            Try a different search word or status.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Asset</TableHead><TableHead>Category</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-muted-foreground font-mono text-xs">{r.tag}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.category}</TableCell>
                  <TableCell className="text-muted-foreground">{r.location}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link to={`/assets/${r.id}`}>View details</Link></DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toast('Edit clicked')}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => toast.error('Asset retired')}>Retire</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
