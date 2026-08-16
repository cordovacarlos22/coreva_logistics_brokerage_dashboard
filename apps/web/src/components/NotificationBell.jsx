import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sileo } from 'sileo';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { subscribeToInserts } from '../lib/chat.js';
import { formatRelativeTime } from '../lib/trailers.js';

const MAX_HISTORY = 20;
const LAST_SEEN_KEY = 'coreva-notification-bell-last-seen-at';

function toEntry(row) {
  return {
    id: row.id,
    loadId: row.load_id,
    loadNumber: row.load?.load_number ?? '—',
    senderName: row.sender?.full_name ?? 'driver',
    body: row.body,
    createdAt: row.created_at,
  };
}

// Staff-only live indicator for new driver-channel messages. History and
// unread count are both derived from load_messages itself (already
// durable) plus a localStorage "last seen" timestamp -- not a database
// read-state table, but not purely in-memory either, so a page refresh no
// longer wipes out what was there a moment ago.
export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    supabase
      .from('load_messages')
      .select('id, load_id, body, created_at, sender_id, load:loads(load_number), sender:profiles(full_name)')
      .eq('channel', 'driver')
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY)
      .then(({ data }) => {
        if (!data) return;
        const entries = data.filter((row) => row.sender_id !== user.id).map(toEntry);
        setNotifications(entries);

        const lastSeenAt = localStorage.getItem(LAST_SEEN_KEY);
        setUnreadCount(entries.filter((entry) => !lastSeenAt || entry.createdAt > lastSeenAt).length);
      });
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeToInserts(supabase, {
      table: 'load_messages',
      filter: 'channel=eq.driver',
      onInsert: async (payload) => {
        // Staff can now reply in this channel too (see LoadDetail.jsx) --
        // don't notify someone about the message they just sent themself.
        if (payload.new.sender_id === user?.id) return;

        // Realtime payloads don't include joined columns (same caveat
        // lib/chat.js's subscribeToInserts already documents) -- fetch
        // this one row with load/sender joined so the entry reads as more
        // than a bare id.
        const { data } = await supabase
          .from('load_messages')
          .select('id, load_id, body, created_at, load:loads(load_number), sender:profiles(full_name)')
          .eq('id', payload.new.id)
          .single();
        if (!data) return;

        const entry = toEntry(data);
        setNotifications((current) => [entry, ...current].slice(0, MAX_HISTORY));
        setUnreadCount((n) => n + 1);

        sileo.info({
          title: `New message from ${entry.senderName}`,
          description: `Load #${entry.loadNumber}: ${entry.body}`,
          button: { title: 'View', onClick: () => navigate(`/loads/${entry.loadId}?tab=driver`) },
        });
      },
    });
    return unsubscribe;
  }, [navigate, user]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleToggle() {
    setOpen((wasOpen) => !wasOpen);
    setUnreadCount(0);
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  }

  function handleSelect(entry) {
    setOpen(false);
    navigate(`/loads/${entry.loadId}?tab=driver`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-text/70 hover:bg-surface"
        aria-label={unreadCount > 0 ? `${unreadCount} new driver messages` : 'Notifications'}
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dropped px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-10 w-80 rounded border border-border bg-white shadow-lg">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold text-primary">
            Driver Messages
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-text/60">No messages yet.</p>
            )}
            {notifications.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleSelect(entry)}
                className="flex w-full flex-col gap-0.5 border-b border-border px-4 py-2.5 text-left last:border-0 hover:bg-surface"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text">{entry.senderName}</span>
                  <span className="shrink-0 text-xs text-text/50">{formatRelativeTime(entry.createdAt)}</span>
                </div>
                <p className="truncate text-xs text-text/60">
                  Load #{entry.loadNumber}: {entry.body}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
