// Owner: Hooria. Route: /notifications (registered in src/routes.jsx - do not rename this file or its export).
// Notifications (FR-NT-01 to FR-NT-03): the user's in-app messages, newest first. Unread ones are
// highlighted; the user can mark one or all as read. Opening a message marks it read and goes to
// the screen where they can act on it.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorBox,
  Page,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '../../components/ui';
import { cn } from '@/lib/utils';
import { fmtDate } from '../reports/format';
import { NOTIFICATIONS_CHANGED } from './NotificationBell';

// One icon, colour and target screen for every notification type the other modules send (docs/API.md).
const TYPES = {
  new_request: { icon: ClipboardList, tone: 'text-warning', to: '/admin/approvals' },
  problem_report: { icon: Wrench, tone: 'text-danger', to: '/admin/maintenance' },
  request_approved: { icon: CheckCircle2, tone: 'text-success', to: '/my-requests' },
  request_rejected: { icon: XCircle, tone: 'text-danger', to: '/my-requests' },
  request_cancelled: { icon: XCircle, tone: 'text-muted-foreground', to: '/my-requests' },
  asset_issued: { icon: PackageOpen, tone: 'text-primary', to: '/my-requests' },
  asset_returned: { icon: PackageCheck, tone: 'text-success', to: '/history' },
  due_reminder: { icon: CalendarClock, tone: 'text-warning', to: '/my-requests' },
  overdue: { icon: AlarmClock, tone: 'text-danger', to: '/my-requests' },
  problem_resolved: { icon: Wrench, tone: 'text-success', to: '/history' },
  account_reactivated: { icon: UserCheck, tone: 'text-success', to: null },
};

const DEFAULT_TYPE = { icon: Bell, tone: 'text-muted-foreground', to: null };

// "2026-10-24 10:08:50" -> "24 Oct 2026, 10:08"
const fmtWhen = (value) => `${fmtDate(value)}, ${String(value).slice(11, 16)}`;

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/notifications'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unread = rows.filter((n) => !n.is_read).length;
  const shown = filter === 'Unread' ? rows.filter((n) => !n.is_read) : rows;

  // Updates the list on screen straight away and tells the bell to recount.
  function markLocally(id) {
    setRows((list) =>
      list.map((n) => (id === 'all' || n.notification_id === id ? { ...n, is_read: true } : n)),
    );
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  async function markRead(n) {
    try {
      await api.patch(`/notifications/${n.notification_id}/read`);
      markLocally(n.notification_id);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function markAll() {
    try {
      const { message } = await api.patch('/notifications/read-all');
      markLocally('all');
      toast.success(message);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function open(n) {
    if (!n.is_read) await markRead(n);
    const target = (TYPES[n.type] || DEFAULT_TYPE).to;
    // Members have no admin screens and admins have no member screens.
    if (target && target.startsWith('/admin') === (user.role === 'Admin')) navigate(target);
  }

  return (
    <Page
      title="Notifications"
      accent={unread ? `${unread} new` : undefined}
      description="Updates about your requests, due dates and problem reports."
      actions={
        <>
          <Button
            variant="outline"
            size="icon"
            onClick={load}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
          <Button variant="brand" onClick={markAll} disabled={unread === 0}>
            <CheckCheck /> Mark all as read
          </Button>
        </>
      }
    >
      <ErrorBox error={error} />

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="All">
            All <span className="text-muted-foreground text-xs tabular-nums">{rows.length}</span>
          </TabsTrigger>
          <TabsTrigger value="Unread">
            Unread <span className="text-muted-foreground text-xs tabular-nums">{unread}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-2xl" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={filter === 'Unread' ? 'You are all caught up' : 'No notifications yet'}
            >
              {filter === 'Unread'
                ? 'Nothing new since you last looked.'
                : 'You will see updates about your requests and loans here.'}
            </EmptyState>
          ) : (
            <ul className="divide-border divide-y">
              {shown.map((n) => {
                const t = TYPES[n.type] || DEFAULT_TYPE;
                const Icon = t.icon;
                return (
                  <li
                    key={n.notification_id}
                    className={cn(
                      'flex items-start gap-4 px-5 py-4 transition-colors',
                      !n.is_read && 'bg-primary/8',
                    )}
                  >
                    <span
                      className={cn(
                        'border-border flex size-10 shrink-0 items-center justify-center rounded-full border',
                        t.tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p
                        className={cn(
                          'text-sm',
                          n.is_read ? 'text-muted-foreground' : 'text-foreground font-medium',
                        )}
                      >
                        {n.message}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">{fmtWhen(n.created_at)}</p>
                    </button>
                    {!n.is_read && (
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="bg-primary size-2 rounded-full shadow-[0_0_10px] shadow-primary"
                          aria-label="Unread"
                        />
                        <Button size="sm" variant="ghost" onClick={() => markRead(n)}>
                          <span className="hidden sm:inline">Mark as read</span>
                          <CheckCheck className="sm:hidden" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
