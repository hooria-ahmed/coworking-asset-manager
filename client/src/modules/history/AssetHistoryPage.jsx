// Owner: Hooria. Route: /admin/history/:assetId (registered in src/routes.jsx - do not rename this file or its export).
// Asset History (FR-UH-01, FR-UH-03), admin only: every borrowing of one asset with the borrower's
// name, and every maintenance record. Opened from Azlaan's Asset Details and Manage Assets screens.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, History, PackageOpen, Wallet, Wrench } from 'lucide-react';
import api from '../../api/client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardIcon,
  CardTitle,
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
} from '../../components/ui';
import { fmtDate, fmtMoney } from '../reports/format';
import { AssetThumb } from '../assets/parts';

export default function AssetHistoryPage() {
  const { assetId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get(`/history/asset/${assetId}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  const back = (
    <Button asChild variant="outline">
      <Link to={`/assets/${assetId}`}>
        <ArrowLeft /> Back to asset
      </Link>
    </Button>
  );

  if (loading && !data) {
    return (
      <Page title="Asset" accent="history" actions={back}>
        <Card>
          <TableSkeleton />
        </Card>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page title="Asset" accent="history" actions={back}>
        <ErrorBox error={error} />
      </Page>
    );
  }

  const { asset, borrowings, maintenance } = data;
  const totalCost = maintenance.reduce((sum, m) => sum + m.cost, 0);
  const totalDays = borrowings.reduce((sum, b) => {
    const end = b.returned_at ? new Date(b.returned_at.slice(0, 10)) : new Date();
    return sum + Math.max(1, Math.round((end - new Date(b.issued_at.slice(0, 10))) / 86400000));
  }, 0);

  return (
    <Page
      title={asset.name}
      accent="history"
      description={`${asset.asset_tag} · ${asset.category} · ${asset.location}. History cannot be edited.`}
      actions={back}
    >
      <ErrorBox error={error} />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="gap-3 p-4">
          <AssetThumb asset={asset} />
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={asset.status} />
            <Badge variant="pill">Condition: {asset.condition}</Badge>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Times borrowed" value={borrowings.length} icon={History} tone="brand" />
          <StatCard label="Days on loan" value={totalDays} icon={PackageOpen} tone="info" />
          <StatCard
            label="Repairs"
            value={maintenance.length}
            icon={Wrench}
            tone={maintenance.length ? 'warning' : 'neutral'}
          />
          <StatCard label="Repair cost" value={fmtMoney(totalCost)} icon={Wallet} tone="neutral" />
        </div>
      </div>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>
            <CardIcon icon={History} /> Borrowings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {borrowings.length === 0 ? (
            <EmptyState icon={History} title="Never borrowed">
              Nobody has borrowed this asset yet.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead className="hidden sm:table-cell">Collected</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead>Returned</TableHead>
                  <TableHead className="hidden md:table-cell">Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {borrowings.map((b) => (
                  <TableRow key={b.borrow_id}>
                    <TableCell>
                      <p className="font-medium">{b.user_name}</p>
                      <p className="text-muted-foreground text-xs">{b.user_email}</p>
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
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>
            <CardIcon icon={Wrench} /> Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {maintenance.length === 0 ? (
            <EmptyState icon={Wrench} title="No repairs">
              This asset has never been sent for maintenance.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Problem</TableHead>
                  <TableHead className="hidden sm:table-cell">Reported</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenance.map((m) => (
                  <TableRow key={m.maintenance_id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <p className="font-medium">{m.issue_description}</p>
                      {m.notes && <p className="text-muted-foreground text-xs">{m.notes}</p>}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {fmtDate(m.reported_at)}
                      <p className="text-muted-foreground text-xs">by {m.reported_by_name}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.outcome || m.status} />
                      {m.resolved_at && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {fmtDate(m.resolved_at)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(m.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
