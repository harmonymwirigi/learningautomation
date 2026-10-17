import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../api/client';
import EmptyState from '../components/EmptyState';
import { formatDateTime } from '../utils/dates';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.notifications.list()
      .then(setNotifications)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const markRead = async (id) => {
    await api.notifications.markRead(id);
    load();
  };

  const markAllRead = async () => {
    await api.notifications.markAllRead();
    load();
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>;
  }

  const unread = notifications.filter((n) => !n.is_read);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="mt-1 text-slate-500">Deadline reminders for your assignments</p>
        </div>
        {unread.length > 0 && (
          <button onClick={markAllRead} className="btn-secondary"><CheckCheck size={16} /> Mark all read</button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You'll receive alerts when assignment deadlines are approaching."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`card cursor-pointer p-4 transition hover:border-slate-700 ${
                !n.is_read ? 'border-indigo-500/30 bg-indigo-500/5' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {!n.is_read && <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" />}
                  <div>
                    <p className={`text-sm ${n.is_read ? 'text-slate-400' : 'font-medium text-white'}`}>{n.message}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {n.assignment_title} &middot; Due {formatDateTime(n.deadline)}
                    </p>
                  </div>
                </div>
                <span className="flex-shrink-0 text-xs text-slate-600">{formatDateTime(n.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
