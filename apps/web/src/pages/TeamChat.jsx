import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { ThinkingOrb } from 'thinking-orbs';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import { fetchTeamMessages, sendTeamMessage, subscribeToInserts } from '../lib/chat.js';

export default function TeamChat() {
  const { user, profile } = useAuth();
  const isStaff = profile?.role === 'admin' || profile?.role === 'dispatcher';
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    fetchTeamMessages(supabase)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!isStaff) return undefined;
    refresh();
    const unsubscribe = subscribeToInserts(supabase, { table: 'team_messages', onInsert: refresh });
    return unsubscribe;
  }, [isStaff, refresh]);

  async function handleSend(body) {
    await sendTeamMessage(supabase, { authorId: user.id, body });
  }

  const normalized = (messages ?? []).map((message) => ({
    id: message.id,
    body: message.body,
    created_at: message.created_at,
    authorId: message.author_id,
    authorName: message.author?.full_name,
  }));

  if (!isStaff) {
    return (
      <AppShell>
        <p className="text-sm text-text/60">Team Chat is only available to dispatch and admin staff.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-primary">Team Chat</h1>
      <p className="mt-1 text-sm text-text/70">Internal coordination for dispatch and admin staff.</p>

      {error && (
        <p className="mt-4 rounded border border-status-dropped/30 bg-status-dropped/5 p-3 text-sm text-status-dropped">
          Couldn&apos;t load messages: {error}
        </p>
      )}

      {!error && (
        <Skeleton
          loading={messages === null}
          name="team-chat"
          fallback={
            <div className="mt-6 flex max-w-2xl items-center gap-2 rounded border border-border bg-white p-5 text-sm text-text/60">
              <ThinkingOrb size={20} />
              Loading…
            </div>
          }
        >
          <div className="mt-6 max-w-2xl rounded border border-border bg-white p-5">
            {messages !== null && (
              <ChatPanel
                messages={normalized}
                onSend={handleSend}
                currentUserId={user.id}
                emptyLabel="No messages yet — say hi."
              />
            )}
          </div>
        </Skeleton>
      )}
    </AppShell>
  );
}
