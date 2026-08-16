import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from './ui/avatar.jsx';
import { Bubble, BubbleContent, BubbleGroup } from './ui/bubble.jsx';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

// Presentational chat widget shared by TeamChat, Load Detail's messages
// card, and Driver Messages. Callers normalize their message shape to
// { id, body, created_at, authorId, authorName, tag? } and pass an
// onSend(body) handler -- ChatPanel itself doesn't know about
// team_messages/load_messages/driver_messages. `tag` is optional (e.g.
// Driver Messages' "Re: Load #X" for a load-tagged dispatch message).
export default function ChatPanel({
  messages,
  onSend,
  currentUserId,
  emptyLabel = 'No messages yet.',
  placeholder = 'Type a message…',
  readOnly = false,
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages]);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setError(null);
    setSending(true);
    try {
      await onSend(trimmed);
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col">
      <BubbleGroup className="max-h-80 overflow-y-auto">
        {messages.length === 0 && <p className="text-sm text-text/60">{emptyLabel}</p>}
        {messages.map((message) => {
          const own = currentUserId && message.authorId === currentUserId;
          return (
            <div key={message.id} className={`flex items-end gap-2 ${own ? 'flex-row-reverse' : ''}`}>
              <Avatar size="sm">
                <AvatarFallback>{initials(message.authorName)}</AvatarFallback>
              </Avatar>
              <Bubble align={own ? 'end' : 'start'} variant={own ? 'default' : 'muted'}>
                {message.tag && (
                  <span className="mb-1 inline-block rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text/60">
                    {message.tag}
                  </span>
                )}
                <BubbleContent>{message.body}</BubbleContent>
                <span className="px-1 text-xs text-text/50">
                  {message.authorName ?? 'Unknown'} · {new Date(message.created_at).toLocaleString()}
                </span>
              </Bubble>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </BubbleGroup>

      {!readOnly && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
            placeholder={placeholder}
            className="w-full rounded border border-border p-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
          {error && <p className="text-sm text-status-dropped">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="self-end rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}
