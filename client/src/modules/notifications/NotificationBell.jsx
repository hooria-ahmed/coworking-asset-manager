// Owner: Hooria. Shown in the top bar on every page (components/Layout.jsx imports it).
// Polls GET /api/notifications/unread-count every 60 s (NOTIFICATION_POLL, FR-NT-01) and shows the
// count on the bell. The Notifications page sends a 'notifications:changed' event after marking
// something read, so the number drops at once instead of waiting for the next poll.
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import api from '../../api/client';
import { Button } from '../../components/ui';

const POLL_MS = 60 * 1000;
export const NOTIFICATIONS_CHANGED = 'notifications:changed';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/notifications/unread-count');
      setCount(data.count);
    } catch {
      // A failed poll is not worth an error on every page; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [refresh]);

  // Also check when the user moves to another page.
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  const label = count ? `Notifications, ${count} unread` : 'Notifications';

  return (
    <Button asChild variant="secondary" size="icon" className="border-border relative border">
      <Link to="/notifications" title={label} aria-label={label}>
        <Bell />
        {count > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.65rem] font-semibold tabular-nums shadow-[0_0_12px] shadow-primary">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
