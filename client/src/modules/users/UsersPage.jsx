// Owner: Hamza. Route: /admin/users (registered in src/routes.jsx - do not rename this file or its export).
// Manage Users (SRS screen 10, FR-AU-08): every account with its loans, and Deactivate / Activate for members.
// A deactivated member cannot log in; their history is kept (NFR-SF-05).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, PackageOpen, RefreshCw, Search, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, DotPill, EmptyState, ErrorBox, Input, NativeSelect, NativeSelectOption, Page, StatCard, StatusBadge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton,
} from '../../components/ui';
import { ConfirmDialog, Facts, Person, fmtDate, plural } from '../requests/parts';

export default function UsersPage() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [changing, setChanging] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/users'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const k = search.trim().toLowerCase();
    return rows.filter((u) => (!role || u.role === role) && (!status || u.account_status === status)
      && (!k || u.name.toLowerCase().includes(k) || u.email.toLowerCase().includes(k)));
  }, [rows, search, role, status]);

  const members = rows.filter((u) => u.role === 'Member');
  const deactivated = members.filter((u) => u.account_status === 'Deactivated').length;
  const withLoans = members.filter((u) => u.active_loans > 0).length;
  const lateMembers = members.filter((u) => u.overdue_loans > 0).length;
  const deactivating = changing?.account_status === 'Active';

  async function toggle() {
    const next = deactivating ? 'Deactivated' : 'Active';
    const { message } = await api.patch(`/users/${changing.user_id}/status`, { account_status: next });
    if (next === 'Active') toast.success(message); else toast(message);
    load();
  }

  return (
    <Page
      title="Manage"
      accent="users"
      description="Everyone with an account. Deactivate a member to stop them logging in; their history is kept."
      actions={
        <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
        </Button>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members" value={members.length} icon={Users} tone="brand" note={`${rows.length - members.length} admin${rows.length - members.length === 1 ? '' : 's'} too`} />
        <StatCard label="Active members" value={members.length - deactivated} icon={UserCheck} tone="success" note="Can log in and request" />
        <StatCard label="Deactivated" value={deactivated} icon={UserX} tone="neutral" note={deactivated ? 'Cannot log in' : 'Nobody is blocked'} />
        <StatCard label="Borrowing now" value={withLoans} icon={PackageOpen} tone={lateMembers ? 'danger' : 'lime'} alert={lateMembers > 0} note={lateMembers ? `${plural(lateMembers, 'member')} with overdue items` : 'No one is late'} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input placeholder="Search by name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} />
        </div>
        <div className="w-40">
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            <NativeSelectOption value="">All roles</NativeSelectOption>
            <NativeSelectOption>Member</NativeSelectOption>
            <NativeSelectOption>Admin</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="w-44">
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Account status">
            <NativeSelectOption value="">Any status</NativeSelectOption>
            <NativeSelectOption>Active</NativeSelectOption>
            <NativeSelectOption>Deactivated</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        {loading && !rows.length ? (
          <div className="py-4"><TableSkeleton /></div>
        ) : shown.length === 0 ? (
          <EmptyState icon={Users} title="No users found" action={<Button variant="outline" onClick={() => { setSearch(''); setRole(''); setStatus(''); }}>Clear filters</Button>}>
            Try a different name or filter.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="hidden lg:table-cell">Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Loans</TableHead>
                <TableHead className="hidden xl:table-cell">Joined</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((u) => (
                <TableRow key={u.user_id} className={u.account_status === 'Deactivated' ? 'opacity-70' : undefined}>
                  <TableCell><Person name={u.name} sub={u.email} /></TableCell>
                  <TableCell className="text-muted-foreground hidden tabular-nums lg:table-cell">{u.contact_no || '-'}</TableCell>
                  <TableCell>
                    {u.role === 'Admin' ? <DotPill tone="brand"><ShieldCheck className="size-3" /> Admin</DotPill> : <DotPill tone="neutral">Member</DotPill>}
                  </TableCell>
                  <TableCell><StatusBadge status={u.account_status} /></TableCell>
                  <TableCell className="hidden md:table-cell">
                    {u.role === 'Member' ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular-nums">{u.active_loans}</span>
                        <span className="text-muted-foreground text-xs">now · {u.total_borrowings} total</span>
                        {u.overdue_loans > 0 && <Badge variant="danger">{u.overdue_loans} overdue</Badge>}
                        {u.pending_requests > 0 && <Badge variant="warning">{u.pending_requests} pending</Badge>}
                      </div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden xl:table-cell">{fmtDate(u.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {u.user_id === me?.user_id ? (
                      <Badge variant="secondary">You</Badge>
                    ) : u.role === 'Member' && (
                      u.account_status === 'Active' ? (
                        <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => setChanging(u)}><UserX /> <span className="hidden sm:inline">Deactivate</span></Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setChanging(u)}><UserCheck /> <span className="hidden sm:inline">Activate</span></Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(changing)}
        onOpenChange={(o) => !o && setChanging(null)}
        title={deactivating ? `Deactivate ${changing?.name}?` : `Activate ${changing?.name}?`}
        description={deactivating
          ? 'They will not be able to log in. Their requests and borrowing history are kept.'
          : 'They can log in and request assets again. Any login lock-out is cleared.'}
        confirmLabel={deactivating ? 'Deactivate' : 'Activate'}
        confirmIcon={deactivating ? UserX : UserCheck}
        variant={deactivating ? 'destructive' : 'brand'}
        onConfirm={toggle}
      >
        {changing && (
          <>
            <Facts rows={[
              ['Email', changing.email],
              ['Member since', fmtDate(changing.created_at)],
              ['On loan now', plural(changing.active_loans, 'item')],
            ]} />
            {deactivating && (changing.pending_requests > 0 || changing.active_loans > 0) && (
              <ul className="text-warning space-y-1.5 text-sm">
                {changing.pending_requests > 0 && (
                  <li className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Their {plural(changing.pending_requests, 'pending request')} will be cancelled.</li>
                )}
                {changing.active_loans > 0 && (
                  <li className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> They still have {plural(changing.active_loans, 'item')} on loan. Record the return when it comes back.</li>
                )}
              </ul>
            )}
          </>
        )}
      </ConfirmDialog>
    </Page>
  );
}
