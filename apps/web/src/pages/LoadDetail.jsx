import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { sileo } from 'sileo';
import { Skeleton } from 'boneyard-js/react';
import { ThinkingOrb } from 'thinking-orbs';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import {
  fetchLoadDetail,
  addLoadNote,
  updateLoadConsignee,
  markBolVerified,
  updateBolFields,
  latestLoadSecuredPhoto,
  fetchLoadSecuredPhotoUrl,
  overrideLoadSecuredCompliance,
  latestBolPhoto,
  fetchBolPhotoUrl,
  latestPodPhoto,
  fetchPodPhotoUrl,
} from '../lib/loadDetail.js';
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

const VERIFICATION_LABELS = {
  pending: 'Pending Verification',
  ai_verified: 'AI Verified',
  dispatch_verified: 'Dispatch Verified',
};
const VERIFICATION_STYLES = {
  pending: 'bg-status-dropped',
  ai_verified: 'bg-status-in-transit',
  dispatch_verified: 'bg-status-delivered',
};

function VerificationBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white ${
        VERIFICATION_STYLES[status] ?? 'bg-status-assigned'
      }`}
    >
      {VERIFICATION_LABELS[status] ?? status}
    </span>
  );
}

// The BOL fields are populated by the driver app's OCR step (real Google
// Cloud Vision, see the standalone backend's /api/ocr/bol) -- this is
// dispatch's way to review/correct a bad OCR read and confirm the record,
// same "clone the inline-edit pattern" approach as CustomerField above, just
// several fields at once instead of one.
function BolVerificationCard({ load, photo, isStaff, userId, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoError, setPhotoError] = useState(null);

  // This card only ever showed the OCR'd fields, never the photo itself --
  // same signed-URL pattern LoadSecurityCheckCard already uses below.
  useEffect(() => {
    if (!photo) return;
    fetchBolPhotoUrl(supabase, photo.storage_path)
      .then(setPhotoUrl)
      .catch((err) => setPhotoError(err.message));
  }, [photo]);

  function startEditing() {
    setFormError(null);
    setForm({
      bol_trailer_number: load.bol_trailer_number ?? '',
      bol_mfo: load.bol_mfo ?? '',
      bol_po_number: load.bol_po_number ?? '',
      bol_seal_number: load.bol_seal_number ?? '',
      weight_lbs: load.weight_lbs ?? '',
      commodity: load.commodity ?? '',
    });
    setEditing(true);
  }

  function fieldsFromForm() {
    return { ...form, weight_lbs: form.weight_lbs === '' ? null : Number(form.weight_lbs) };
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateBolFields(supabase, { loadId: load.id, patch: fieldsFromForm() });
      onUpdated(updated);
      setEditing(false);
      sileo.success({ title: 'BOL details updated' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkVerified() {
    setSaving(true);
    setFormError(null);
    try {
      const updated = await markBolVerified(supabase, {
        loadId: load.id,
        verifiedBy: userId,
        patch: editing ? fieldsFromForm() : {},
      });
      onUpdated(updated);
      setEditing(false);
      sileo.success({ title: 'BOL marked verified' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="BOL Verification">
      <div className="mb-3 flex items-center justify-between">
        <VerificationBadge status={load.bol_verification_status} />
        {load.bol_verified_at && (
          <span className="text-xs text-text/60">{formatDateTime(load.bol_verified_at)}</span>
        )}
      </div>

      {photoUrl && <img src={photoUrl} alt="BOL" className="mb-3 w-full rounded border border-border" />}
      {!photo && <p className="mb-3 text-sm text-text/60">No BOL photo yet.</p>}
      {photoError && <p className="mb-3 text-sm text-status-dropped">{photoError}</p>}

      {!editing ? (
        <>
          <Field label="Trailer #" value={load.bol_trailer_number} />
          <Field label="MFO" value={load.bol_mfo} />
          <Field label="PO Number" value={load.bol_po_number} />
          <Field label="Seal Number" value={load.bol_seal_number} />
          <Field label="Weight" value={load.weight_lbs ? `${load.weight_lbs.toLocaleString()} lb` : null} />
          <Field label="Commodity" value={load.commodity} />
        </>
      ) : (
        <div className="space-y-2">
          {[
            ['bol_trailer_number', 'Trailer #'],
            ['bol_mfo', 'MFO'],
            ['bol_po_number', 'PO Number'],
            ['bol_seal_number', 'Seal Number'],
            ['weight_lbs', 'Weight (lb)'],
            ['commodity', 'Commodity'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-text/60">{label}</span>
              <input
                type={key === 'weight_lbs' ? 'number' : 'text'}
                value={form[key]}
                onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                className="w-40 rounded border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
            </label>
          ))}
        </div>
      )}

      {formError && <p className="mt-2 text-sm text-status-dropped">{formError}</p>}

      {isStaff && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                Save
              </button>
            </>
          )}
          {load.bol_verification_status !== 'dispatch_verified' && (
            <button
              type="button"
              onClick={handleMarkVerified}
              disabled={saving}
              className="rounded bg-status-delivered px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
            >
              Mark Verified
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

const COMPLIANCE_LABELS = { pass: 'Pass', fail: 'Fail', overridden: 'Overridden (Dispatch)' };
const COMPLIANCE_STYLES = {
  pass: 'bg-status-delivered',
  fail: 'bg-status-dropped',
  overridden: 'bg-status-in-transit',
};

function ComplianceBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white ${
        COMPLIANCE_STYLES[status] ?? 'bg-status-assigned'
      }`}
    >
      {COMPLIANCE_LABELS[status] ?? status}
    </span>
  );
}

// AI compliance check (single criterion: straps/wrap visibly crossing the
// load) runs server-side when the driver takes the load-secured photo --
// see coreva_logistics_brokerage_dashboard_back_end's vision module. A
// 'fail' hard-gates the driver from sealing until they retake and pass, or
// dispatch overrides it here.
function LoadSecurityCheckCard({ photo, isStaff, onOverridden }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [error, setError] = useState(null);
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    if (!photo) return;
    fetchLoadSecuredPhotoUrl(supabase, photo.storage_path)
      .then(setPhotoUrl)
      .catch((err) => setError(err.message));
  }, [photo]);

  async function handleOverride() {
    setOverriding(true);
    setError(null);
    try {
      const updated = await overrideLoadSecuredCompliance(photo.id);
      onOverridden(updated);
      sileo.success({ title: 'Marked compliant' });
    } catch (err) {
      setError(err.message);
    } finally {
      setOverriding(false);
    }
  }

  return (
    <Card title="Load Security Check">
      {!photo && <p className="text-sm text-text/60">No load-secured photo yet.</p>}
      {photo && (
        <>
          <div className="mb-3 flex items-center justify-between">
            {photo.compliance_status ? (
              <ComplianceBadge status={photo.compliance_status} />
            ) : (
              <span className="text-xs text-text/60">Not checked</span>
            )}
            <span className="text-xs text-text/60">{formatDateTime(photo.uploaded_at)}</span>
          </div>
          {photoUrl && (
            <img src={photoUrl} alt="Load secured" className="mb-3 w-full rounded border border-border" />
          )}
          {photo.compliance_reason && <p className="text-sm text-text/70">{photo.compliance_reason}</p>}
          {error && <p className="mt-2 text-sm text-status-dropped">{error}</p>}
          {isStaff && photo.compliance_status === 'fail' && (
            <button
              type="button"
              onClick={handleOverride}
              disabled={overriding}
              className="mt-4 rounded bg-status-delivered px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {overriding ? 'Overriding…' : 'Override — Mark Compliant'}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function PodPhotoCard({ delivery }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!delivery?.pod_storage_path) return;
    fetchPodPhotoUrl(supabase, delivery.pod_storage_path)
      .then(setPhotoUrl)
      .catch((err) => setError(err.message));
  }, [delivery]);

  return (
    <Card title="Proof of Delivery">
      {!delivery?.pod_storage_path && <p className="text-sm text-text/60">No POD photo yet.</p>}
      {delivery?.pod_storage_path && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-text/60">{delivery.driver?.full_name}</span>
            <span className="text-xs text-text/60">{formatDateTime(delivery.unloaded_at)}</span>
          </div>
          {photoUrl && (
            <img src={photoUrl} alt="Proof of delivery" className="mb-3 w-full rounded border border-border" />
          )}
          {error && <p className="mt-2 text-sm text-status-dropped">{error}</p>}
        </>
      )}
    </Card>
  );
}

function LoadMessages({ loadId, userId }) {
  // NotificationBell links here with ?tab=driver so clicking a driver-
  // message notification lands directly on that thread instead of always
  // defaulting to dispatch and making staff click over to find it.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'driver' ? 'driver' : 'dispatch');
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
        <p className="mb-3 text-xs text-text/60">Messages delivered to the driver&apos;s mobile app.</p>
      )}

      {error && <p className="text-sm text-status-dropped">{error}</p>}
      {!error && messages === null && <p className="text-sm text-text/60">Loading…</p>}
      {!error && messages !== null && (
        <ChatPanel
          messages={normalized}
          onSend={handleSend}
          currentUserId={userId}
          emptyLabel="No messages yet."
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
  // The most recently-submitted checklist's most recent load_secured
  // photo -- that's the one that actually gates the driver's ability to
  // seal, so it's the one worth showing here.
  const latestChecklist = detail?.checklists?.[detail.checklists.length - 1];
  const latestSecuredPhoto = latestChecklist ? latestLoadSecuredPhoto(latestChecklist) : null;
  const latestBol = latestChecklist ? latestBolPhoto(latestChecklist) : null;
  const latestPod = latestPodPhoto(detail?.deliveries);

  function handlePhotoOverridden(updatedPhoto) {
    setDetail((prev) => ({
      ...prev,
      checklists: prev.checklists.map((checklist) => ({
        ...checklist,
        checklist_photos: (checklist.checklist_photos ?? []).map((p) =>
          p.id === updatedPhoto.id ? updatedPhoto : p
        ),
      })),
    }));
  }

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
              <Field label="Assigned Truck" value={load.truck?.unit_number} />
              <Field label="Assigned Trailer" value={load.trailer?.trailer_number} />
              <Field label="Driver" value={load.driver?.full_name} />
            </Card>

            <BolVerificationCard
              load={load}
              photo={latestBol}
              isStaff={isStaff}
              userId={user.id}
              onUpdated={(patch) => setDetail((prev) => ({ ...prev, load: { ...prev.load, ...patch } }))}
            />

            <LoadSecurityCheckCard
              photo={latestSecuredPhoto}
              isStaff={isStaff}
              onOverridden={handlePhotoOverridden}
            />

            <PodPhotoCard delivery={latestPod} />

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
            <LoadMessages loadId={load.id} userId={user.id} />
          </div>
        </>
        )}
      </Skeleton>
    </AppShell>
  );
}
