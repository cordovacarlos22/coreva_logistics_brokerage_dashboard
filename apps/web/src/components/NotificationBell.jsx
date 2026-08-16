import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sileo } from 'sileo';
import { supabase } from '../lib/supabaseClient.js';
import { subscribeToInserts } from '../lib/chat.js';

// Staff-only live indicator for new driver-channel messages -- an
// in-session Realtime badge, not a durable per-staff read-state (no
// unread-tracking schema exists anywhere in this app yet). Solves the
// actual complaint ("I don't see messages coming through") without one.
export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = subscribeToInserts(supabase, {
      table: 'load_messages',
      filter: 'channel=eq.driver',
      onInsert: async (payload) => {
        setCount((n) => n + 1);

        // Realtime payloads don't include joined columns (same caveat
        // lib/chat.js's subscribeToInserts already documents) -- fetch
        // this one row with load/sender joined so the toast reads as
        // more than a bare id.
        const { data } = await supabase
          .from('load_messages')
          .select('load_id, body, load:loads(load_number), sender:profiles(full_name)')
          .eq('id', payload.new.id)
          .single();
        if (!data) return;

        sileo.info({
          title: `New message from ${data.sender?.full_name ?? 'driver'}`,
          description: `Load #${data.load?.load_number ?? '—'}: ${data.body}`,
          button: { title: 'View', onClick: () => navigate(`/loads/${data.load_id}`) },
        });
      },
    });
    return unsubscribe;
  }, [navigate]);

  return (
    <button
      type="button"
      onClick={() => setCount(0)}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-text/70 hover:bg-surface"
      aria-label={count > 0 ? `${count} new driver messages` : 'Notifications'}
    >
      <span className="material-symbols-outlined text-[20px]">notifications</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dropped px-1 text-[10px] font-semibold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
