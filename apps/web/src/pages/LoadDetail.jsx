import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sileo } from 'sileo';
import { Skeleton } from 'boneyard-js/react';
import { ThinkingOrb } from 'thinking-orbs';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import { fetchLoadDetail, addLoadNote, updateLoadConsignee } from '../lib/loadDetail.js';
import { fetchConsignees, createConsignee } from '../lib/consignees.js';
import { fetchLoadMessages, sendLoadMessage, subscribeToInserts } from '../lib/chat.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb.jsx';

const CHECKLIST_LABELS = { in_progress: 'In Progress', locked: 'Locked' };
const DISCREPANCY_LABELS = { mismatch: 'Mismatch', equipment_damage: 'Equipment Damage', other: 'Other' };

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function Card({ title, children }) {
  return (
    <section className="rounded border border-border bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text/60">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-text/60">{label}</span>
      <span className="font-mono text-text">{value ?? '—'}</span>
    </div>
  );
}

// The "customer" here is the load's consignee -- the recipient a Coreva
// customer ships to (e.g. one of International Paper's own customers), not
// the Coreva customer itself. Staff can change it inline; everyone else
// (including the customer login) sees it read-only, same as the rest of
// Core Details.
function CustomerField({ load, isStaff, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState(null);
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  function startEditing() {
    setFormError(null);
    setSelected(load.consignee?.id ?? '');
    setNewName('');
    setEditing(true);
    fetchConsignees(supabase, load.customer_company)
      .then(setOptions)
      .catch((err) => setFormError(err.message));
  }

  async function handleSave() {
    setFormError(null);
    if (selected === '__new__' && !newName.trim()) {
      setFormError('Enter a customer name.');
      return;
    }
    setSaving(true);
    try {
      let consigneeId = selected || null;
      if (selected === '__new__') {
        const created = await createConsignee(supabase, {
          name: newName.trim(),
          customerCompany: load.customer_company,
        });
        consigneeId = created.id;
      }
      const consignee = await updateLoadConsignee(supabase, { loadId: load.id, consigneeId });
      onUpdated(consignee);
      setEditing(false);
      sileo.success({ title: 'Customer updated' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isStaff) {
    return <Field label="Customer" value={load.consignee?.name} />;
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
        <span className="text-text/60">Customer</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-text">{load.consignee?.name ?? '—'}</span>
          <button type="button" onClick={startEditing} className="text-xs font-medium text-primary hover:underline">
            Change
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-border py-2 text-sm last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-text/60">Customer</span>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-text/60 hover:underline">
          Cancel
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="rounded border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
        >
          <option value="">— None —</option>
          {options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          <option value="__new__">+ Add new customer…</option>
        </select>
        {selected === '__new__' && (
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New customer name"
            className="rounded border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {formError && <p className="mt-1 text-xs text-status-dropped">{formError}</p>}
    </div>
  );
}

function LoadMessages({ loadId, isStaff, userId }) {
  const [tab, setTab] = useState('dispatch');
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    fetchLoadMessages(supabase, loadId, tab)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [loadId, tab]);

  useEffect(() => {
    setMessages(null);
    refresh();
    const unsubscribe = subscribeToInserts(supabase, {
      table: 'load_messages',
      filter: `load_id=eq.${loadId}`,
      onInsert: refresh,
    });
    return unsubscribe;
  }, [refresh, loadId]);

  async function handleSend(body) {
    await sendLoadMessage(supabase, { loadId, channel: tab, senderId: userId, body });
  }

  const normalized = (messages ?? []).map((message) => ({
    id: message.id,
    body: message.body,
    created_at: message.created_at,
    authorId: message.sender_id,
    authorName: message.sender?.full_name,
  }));

  return (
    <Card title="Messages">
      <div className="mb-3 flex gap-2">
        {['dispatch', 'driver'].map((channel) => (
          <button
            key={channel}
            type="button"
            onClick={() => setTab(channel)}
            className={`rounded px-3 py-1 text-sm font-medium capitalize ${
              tab === channel ? 'bg-primary text-white' : 'border border-border text-text/70'
            }`}
          >
            {channel}
          </button>
        ))}
      </div>

      {tab === 'driver' && (
        <p className="mb-3 text-xs text-text/60">
          {isStaff ? 'Oversight view — messages ' : 'Messages '}delivered to the driver&apos;s mobile app.
        </p>
      )}

      {error && <p className="text-sm text-status-dropped">{error}</p>}
      {!error && messages === null && <p className="text-sm text-text/60">Loading…</p>}
      {!error && messages !== null && (
        <ChatPanel
          messages={normalized}
          onSend={handleSend}
          currentUserId={userId}
          emptyLabel="No messages yet."
          readOnly={tab === 'driver' && isStaff}
        />
      )}
    </Card>
  );
}

export default function LoadDetail() {
  const { id } = useParams();
  const { profile, user } = useAuth();
  const isStaff = profile?.role === 'admin' || profile?.role === 'dispatcher';

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState(null);
  const [submittingNote, setSubmittingNote] = useState(false);

  const load = detail?.load;

  const refresh = useCallback(() => {
    fetchLoadDetail(supabase, id)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAddNote(event) {
    event.preventDefault();
    if (!noteBody.trim()) return;
    setNoteError(null);
    setSubmittingNote(true);
    try {
      const note = await addLoadNote(supabase, { loadId: id, authorId: user.id, body: noteBody.trim() });
      setDetail((prev) => ({ ...prev, notes: [...prev.notes, note] }));
      setNoteBody('');
      sileo.success({ title: 'Note posted' });
    } catch (err) {
      setNoteError(err.message);
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <AppShell>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Loads Overview</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{load ? `Load ${load.load_number}` : 'Load'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {error && (
        <p className="mt-4 rounded border border-status-dropped/30 bg-status-dropped/5 p-3 text-sm text-status-dropped">
          Couldn&apos;t load this shipment: {error}
        </p>
      )}

      <Skeleton
        loading={!error && !load}
        name="load-detail"
        fallback={
          <p className="mt-6 flex items-center gap-2 text-sm text-text/60">
            <ThinkingOrb size={20} />
            Loading…
          </p>
        }
      >
        {load && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-primary">Load {load.load_number}</h1>
            <StatusBadge status={load.status} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Core Details">
              <CustomerField
                load={load}
                isStaff={isStaff}
                onUpdated={(consignee) =>
                  setDetail((prev) => ({ ...prev, load: { ...prev.load, consignee } }))
                }
              />
              <Field label="Trailer #" value={load.bol_trailer_number} />
              <Field label="MFO" value={load.bol_mfo} />
              <Field label="PO Number" value={load.bol_po_number} />
              <Field label="Seal Number" value={load.bol_seal_number} />
              <Field label="Assigned Truck" value={load.truck?.unit_number} />
              <Field label="Assigned Trailer" value={load.trailer?.trailer_number} />
              <Field label="Driver" value={load.driver?.full_name} />
            </Card>

            <Card title="Route">
              <Field label="Origin" value={load.origin_address} />
              <Field label="Pickup Appointment" value={formatDateTime(load.pickup_appointment_at)} />
              <Field label="Destination" value={load.destination_address} />
              <Field label="Delivery Appointment" value={formatDateTime(load.delivery_appointment_at)} />
              {detail.stops.length > 0 && (
                <div className="mt-3 space-y-2">
                  {detail.stops.map((stop) => (
                    <div key={stop.id} className="rounded border border-border p-2 text-sm">
                      <span className="font-semibold uppercase text-text/60">{stop.stop_type}</span>{' '}
                      <span>{stop.address}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Checklist &amp; Signing History">
              {detail.checklists.length === 0 && (
                <p className="text-sm text-text/60">No checklist submitted yet.</p>
              )}
              {detail.checklists.map((checklist) => (
                <div key={checklist.id} className="border-b border-border py-2 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text">{checklist.driver?.full_name ?? 'Unknown driver'}</span>
                    <span className="text-xs font-semibold uppercase text-text/60">
                      {CHECKLIST_LABELS[checklist.status] ?? checklist.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text/60">
                    Signed {formatDateTime(checklist.signed_at)} · Sealed {formatDateTime(checklist.sealed_at)}
                    {checklist.seal_number ? ` · Seal #${checklist.seal_number}` : ''}
                  </p>
                </div>
              ))}
            </Card>

            <Card title="Discrepancy Reports">
              {detail.discrepancies.length === 0 && (
                <p className="text-sm text-text/60">No discrepancies reported.</p>
              )}
              {detail.discrepancies.map((report) => (
                <div key={report.id} className="border-b border-border py-2 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text">
                      {DISCREPANCY_LABELS[report.type] ?? report.type}
                    </span>
                    <span className="text-xs text-text/60">{report.resolved ? 'Resolved' : 'Open'}</span>
                  </div>
                  {report.description && <p className="mt-1 text-xs text-text/60">{report.description}</p>}
                </div>
              ))}
            </Card>
          </div>

          {isStaff && (
            <div className="mt-5">
              <Card title="Internal Notes (Dispatcher Only)">
                {detail.notes.length === 0 && (
                  <p className="text-sm text-text/60">No notes yet.</p>
                )}
                <div className="space-y-3">
                  {detail.notes.map((note) => (
                    <div key={note.id} className="rounded border border-border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-text">{note.author?.full_name ?? 'Unknown'}</span>
                        <span className="text-xs text-text/60">{formatDateTime(note.created_at)}</span>
                      </div>
                      <p className="mt-1 text-text/80">{note.body}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddNote} className="mt-4 flex flex-col gap-2">
                  <textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    rows={2}
                    placeholder="Type an internal note…"
                    className="w-full rounded border border-border p-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                  {noteError && <p className="text-sm text-status-dropped">{noteError}</p>}
                  <button
                    type="submit"
                    disabled={submittingNote}
                    className="self-end rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
                  >
                    {submittingNote ? 'Posting…' : 'Post note'}
                  </button>
                </form>
              </Card>
            </div>
          )}

          <div className="mt-5">
            <LoadMessages loadId={load.id} isStaff={isStaff} userId={user.id} />
          </div>
        </>
        )}
      </Skeleton>
    </AppShell>
  );
}
