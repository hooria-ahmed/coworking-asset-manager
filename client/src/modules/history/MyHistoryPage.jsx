// Owner: Hooria. Route: /history (registered in src/routes.jsx - do not rename this file or its export).
// My History (FR-UH-02, FR-UH-03): every request the member made and every item they borrowed.
// Read only: there are no edit or delete buttons on this screen.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, History, PackageCheck, PackageOpen, RefreshCw } from 'lucide-react';
import api from '../../api/client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Page,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui';
import { fmtDate } from '../reports/format';

// Main value with a small grey line under it.
function AssetCell({ row }) {
  return (
    <>
      <Link to={`/assets/${row.asset_id}`} className="font-medium hover:underline">
        {row.asset_name}
      </Link>
      <p className="text-muted-foreground text-xs">
        <span className="font-mono">{row.asset_tag}</span> · {row.category}
      </p>
    </>
  );
}

function RequestsTable({ rows }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={ClipboardList} title="No requests yet">
        Requests you send appear here, with their result.
      </EmptyState>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="hidden sm:table-cell">Dates</TableHead>
          <TableHead className="hidden lg:table-cell">Purpose</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Sent</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.request_id}>
            <TableCell>
              <AssetCell row={r} />
            </TableCell>
            <TableCell className="hidden whitespace-nowrap sm:table-cell">
              {fmtDate(r.start_date)} to {fmtDate(r.end_date)}
            </TableCell>
            <TableCell
              className="text-muted-foreground hidden max-w-64 truncate lg:table-cell"
              title={r.purpose}
            >
              {r.purpose}
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
              {r.rejection_reason && (
                <p className="text-muted-foreground mt-1 max-w-56 text-xs whitespace-normal">
                  {r.rejection_reason}
                </p>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
              {fmtDate(r.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BorrowingsTable({ rows }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={PackageOpen} title="Nothing borrowed yet">
        Items you collect from the front desk appear here.
      </EmptyState>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="hidden sm:table-cell">Collected</TableHead>
          <TableHead className="hidden sm:table-cell">Due</TableHead>
          <TableHead>Returned</TableHead>
          <TableHead className="hidden md:table-cell">Condition</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((b) => (
          <TableRow key={b.borrow_id}>
            <TableCell>
              <AssetCell row={b} />
            </TableCell>
            <TableCell className="hidden whitespace-nowrap sm:table-cell">
              {fmtDate(b.issued_at)}
            </TableCell>
            <TableCell className="hidden whitespace-nowrap sm:table-cell">
              {fmtDate(b.due_date)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {b.returned_at ? (
                fmtDate(b.returned_at)
              ) : (
                <StatusBadge status={b.status === 'Overdue' ? 'Overdue' : 'Borrowed'} />
              )}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              {b.return_condition ? (
                <Badge variant={b.return_condition === 'Damaged' ? 'danger' : 'pill'}>
                  {b.return_condition}
                </Badge>
              ) : (
                '-'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function MyHistoryPage() {
  const [data, setData] = useState({ requests: [], borrowings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get('/history/mine'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { requests, borrowings } = data;
  const returned = borrowings.filter((b) => b.returned_at).length;
  const onLoan = borrowings.length - returned;

  return (
    <Page
      title="My"
      accent="history"
      description="Everything you have requested and borrowed. This record cannot be changed."
      actions={
        <Button
          variant="outline"
          size="icon"
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
        </Button>
      }
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Requests sent" value={requests.length} icon={ClipboardList} tone="brand" />
        <StatCard label="Times borrowed" value={borrowings.length} icon={History} tone="info" />
        <StatCard label="Returned" value={returned} icon={PackageCheck} tone="success" />
        <StatCard
          label="On loan now"
          value={onLoan}
          icon={PackageOpen}
          tone={onLoan ? 'warning' : 'neutral'}
        />
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">
            Requests{' '}
            <span className="text-muted-foreground text-xs tabular-nums">{requests.length}</span>
          </TabsTrigger>
          <TabsTrigger value="borrowings">
            Borrowings{' '}
            <span className="text-muted-foreground text-xs tabular-nums">{borrowings.length}</span>
          </TabsTrigger>
        </TabsList>
        {['requests', 'borrowings'].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card className="overflow-hidden py-0">
              {loading && requests.length + borrowings.length === 0 ? (
                <div className="py-4">
                  <TableSkeleton />
                </div>
              ) : tab === 'requests' ? (
                <RequestsTable rows={requests} />
              ) : (
                <BorrowingsTable rows={borrowings} />
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </Page>
  );
}
