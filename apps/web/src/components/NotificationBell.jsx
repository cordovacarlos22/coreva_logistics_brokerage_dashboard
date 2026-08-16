import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sileo } from 'sileo';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { subscribeToInserts } from '../lib/chat.js';
import { formatRelativeTime } from '../lib/trailers.js';

const MAX_HISTORY = 20;
const LAST_SEEN_KEY = 'coreva-notification-bell-last-seen-at';

function toLoadEntry(row) {
  return {
    id: row.id,
    kind: 'load',
    loadId: row.load_id,
    loadNumber: row.load?.load_number ?? '—',
    senderName: row.sender?.full_name ?? 'driver',
    body: row.body,
    createdAt: row.created_at,
  };
}

function toDriverEntry(row) {
  return {
    id: row.id,
    kind: 'driver',
    driverId: row.driver_id,
    senderName: row.sender?.full_name ?? 'driver',
    body: row.body,
    createdAt: row.created_at,
  };
}

function entryHref(entry) {
  return entry.kind === 'driver' ? `/driver-messages?driver=${entry.driverId}` : `/loads/${entry.loadId}?tab=driver`;
}

function entryDescription(entry) {
  return entry.kind === 'driver' ? entry.body : `Load #${entry.loadNumber}: ${entry.body}`;
}

// Staff-only live indicator for new messages from a driver -- merges two
// sources: load_messages' driver channel (per-load, see LoadDetail.jsx)
// and driver_messages (load-independent, see DriverMessages.jsx). History
// and unread count are derived from both tables directly (already
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
    Promise.all([
      supabase
        .from('load_messages')
        .select('id, load_id, body, created_at, sender_id, load:loads(load_number), sender:profiles(full_name)')
        .eq('channel', 'driver')
        .order('created_at', { ascending: false })
        .limit(MAX_HISTORY),
      supabase
        .from('driver_messages')
        .select('id, driver_id, body, created_at, sender_id, sender:profiles!sender_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(MAX_HISTORY),
    ]).then(([loadResult, driverResult]) => {
      const loadEntries = (loadResult.data ?? [])
        .filter((row) => row.sender_id !== user.id)
        .map(toLoadEntry);
      const driverEntries = (driverResult.data ?? [])
        .filter((row) => row.sender_id !== user.id)
        .map(toDriverEntry);
      const entries = [...loadEntries, ...driverEntries]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, MAX_HISTORY);
      setNotifications(entries);

      const lastSeenAt = localStorage.getItem(LAST_SEEN_KEY);
      setUnreadCount(entries.filter((entry) => !lastSeenAt || entry.createdAt > lastSeenAt).length);
    });
  }, [user]);

  useEffect(() => {
    function handleNewEntry(entry) {
      setNotifications((current) => [entry, ...current].slice(0, MAX_HISTORY));
      setUnreadCount((n) => n + 1);

      sileo.info({
        title: `New message from ${entry.senderName}`,
        description: entryDescription(entry),
        button: { title: 'View', onClick: () => navigate(entryHref(entry)) },
      });
    }

    const unsubscribeLoad = subscribeToInserts(supabase, {
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
        if (data) handleNewEntry(toLoadEntry(data));
      },
    });

    const unsubscribeDriver = subscribeToInserts(supabase, {
      table: 'driver_messages',
      onInsert: async (payload) => {
        if (payload.new.sender_id === user?.id) return;

        const { data } = await supabase
          .from('driver_messages')
          .select('id, driver_id, body, created_at, sender:profiles!sender_id(full_name)')
          .eq('id', payload.new.id)
          .single();
        if (data) handleNewEntry(toDriverEntry(data));
      },
    });

    return () => {
      unsubscribeLoad();
      unsubscribeDriver();
    };
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
    navigate(entryHref(entry));
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
                key={`${entry.kind}-${entry.id}`}
                type="button"
                onClick={() => handleSelect(entry)}
                className="flex w-full flex-col gap-0.5 border-b border-border px-4 py-2.5 text-left last:border-0 hover:bg-surface"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text">{entry.senderName}</span>
                  <span className="shrink-0 text-xs text-text/50">{formatRelativeTime(entry.createdAt)}</span>
                </div>
                <p className="truncate text-xs text-text/60">{entryDescription(entry)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
