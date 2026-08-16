import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from 'boneyard-js/react';
import { ThinkingOrb } from 'thinking-orbs';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import { fetchDriverMessages, sendDriverMessage, subscribeToInserts } from '../lib/chat.js';
import { fetchDrivers } from '../lib/driverRoster.js';

// Load-independent messaging: pick any driver and message them, whether or
// not they currently have an active load. Fills the gap Team Chat
// (staff-only) and Load Detail's per-load driver thread don't cover --
// see schema.sql's driver_messages comment.
export default function DriverMessages() {
  const { user, profile } = useAuth();
  const isStaff = profile?.role === 'admin' || profile?.role === 'dispatcher';
  const [searchParams, setSearchParams] = useSearchParams();
  const [drivers, setDrivers] = useState(null);
  const [driversError, setDriversError] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(searchParams.get('driver'));
  const [messages, setMessages] = useState(null);
  const [messagesError, setMessagesError] = useState(null);

  useEffect(() => {
    if (!isStaff) return;
    fetchDrivers(supabase)
      .then(setDrivers)
      .catch((err) => setDriversError(err.message));
  }, [isStaff]);

  const refreshMessages = useCallback(() => {
    if (!selectedDriverId) return;
    fetchDriverMessages(supabase, selectedDriverId)
      .then(setMessages)
      .catch((err) => setMessagesError(err.message));
  }, [selectedDriverId]);

  useEffect(() => {
    if (!isStaff || !selectedDriverId) return undefined;
    setMessages(null);
    setMessagesError(null);
    refreshMessages();
    const unsubscribe = subscribeToInserts(supabase, {
      table: 'driver_messages',
      filter: `driver_id=eq.${selectedDriverId}`,
      onInsert: refreshMessages,
    });
    return unsubscribe;
  }, [isStaff, selectedDriverId, refreshMessages]);

  function handleSelectDriver(driverId) {
    setSelectedDriverId(driverId);
    setSearchParams({ driver: driverId });
  }

  async function handleSend(body) {
    await sendDriverMessage(supabase, { driverId: selectedDriverId, senderId: user.id, body });
  }

  const normalized = (messages ?? []).map((message) => ({
    id: message.id,
    body: message.body,
    created_at: message.created_at,
    authorId: message.sender_id,
    authorName: message.sender?.full_name,
  }));

  const selectedDriver = drivers?.find((driver) => driver.id === selectedDriverId);

  if (!isStaff) {
    return (
      <AppShell>
        <p className="text-sm text-text/60">Driver Messages is only available to dispatch and admin staff.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-primary">Driver Messages</h1>
      <p className="mt-1 text-sm text-text/70">
        Message any driver directly, whether or not they currently have an active load.
      </p>

      {driversError && (
        <p className="mt-4 rounded border border-status-dropped/30 bg-status-dropped/5 p-3 text-sm text-status-dropped">
          Couldn&apos;t load drivers: {driversError}
        </p>
      )}

      <Skeleton
        loading={drivers === null && !driversError}
        name="driver-messages"
        fallback={
          <div className="mt-6 flex items-center gap-2 text-sm text-text/60">
            <ThinkingOrb size={20} />
            Loading…
          </div>
        }
      >
        {drivers !== null && (
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
            <div className="rounded border border-border bg-white p-3">
              {drivers.length === 0 && <p className="p-2 text-sm text-text/60">No drivers yet.</p>}
              <ul className="space-y-1">
                {drivers.map((driver) => (
                  <li key={driver.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectDriver(driver.id)}
                      className={`w-full rounded px-3 py-2 text-left text-sm font-medium transition-colors ${
                        driver.id === selectedDriverId ? 'bg-primary/10 text-primary' : 'text-text hover:bg-surface'
                      }`}
                    >
                      {driver.full_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-border bg-white p-5">
              {!selectedDriverId && <p className="text-sm text-text/60">Pick a driver to see their messages.</p>}
              {selectedDriverId && (
                <>
                  <h2 className="mb-3 text-sm font-semibold text-text">{selectedDriver?.full_name ?? 'Driver'}</h2>
                  {messagesError && (
                    <p className="mb-3 text-sm text-status-dropped">Couldn&apos;t load messages: {messagesError}</p>
                  )}
                  {messages === null && !messagesError ? (
                    <p className="text-sm text-text/60">Loading…</p>
                  ) : (
                    <ChatPanel
                      messages={normalized}
                      onSend={handleSend}
                      currentUserId={user.id}
                      emptyLabel="No messages yet — say hi."
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Skeleton>
    </AppShell>
  );
}
