import { apiPost } from './api.js';

function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchLoadDetail(supabaseClient, loadId) {
  const [load, stops, checklists, discrepancies, notes, deliveries] = await Promise.all([
    supabaseClient
      .from('loads')
      .select(
        `*, driver:profiles!driver_id(full_name), trailer:trailers(trailer_number, type), truck:trucks(unit_number),
         consignee:consignees(id, name)`
      )
      .eq('id', loadId)
      .single()
      .then(unwrap('load')),
    supabaseClient
      .from('load_stops')
      .select('*')
      .eq('load_id', loadId)
      .order('sequence', { ascending: true })
      .then(unwrap('load_stops')),
    supabaseClient
      .from('checklists')
      .select('*, driver:profiles(full_name), checklist_photos(*)')
      .eq('load_id', loadId)
      .order('created_at', { ascending: true })
      .then(unwrap('checklists')),
    supabaseClient
      .from('discrepancy_reports')
      .select('*')
      .eq('load_id', loadId)
      .order('reported_at', { ascending: false })
      .then(unwrap('discrepancy_reports')),
    supabaseClient
      .from('load_notes')
      .select('*, author:profiles(full_name)')
      .eq('load_id', loadId)
      .order('created_at', { ascending: true })
      .then(unwrap('load_notes')),
    supabaseClient
      .from('delivery_records')
      .select('*, driver:profiles(full_name)')
      .eq('load_id', loadId)
      .order('created_at', { ascending: true })
      .then(unwrap('delivery_records')),
  ]);

  return { load, stops, checklists, discrepancies, notes, deliveries };
}

export async function addLoadNote(supabaseClient, { loadId, authorId, body }) {
  const { data, error } = await supabaseClient
    .from('load_notes')
    .insert({ load_id: loadId, author_id: authorId, body })
    .select('*, author:profiles(full_name)')
    .single();

  if (error) throw new Error(`load_notes insert: ${error.message}`);
  return data;
}

export async function updateLoadConsignee(supabaseClient, { loadId, consigneeId }) {
  const { data, error } = await supabaseClient
    .from('loads')
    .update({ consignee_id: consigneeId })
    .eq('id', loadId)
    .select('consignee:consignees(id, name)')
    .single();

  if (error) throw new Error(`loads update: ${error.message}`);
  return data.consignee;
}

const BOL_FIELDS =
  'bol_trailer_number, bol_mfo, bol_po_number, bol_seal_number, weight_lbs, commodity, bol_verification_status, bol_verified_at, bol_verified_by';

export async function updateBolFields(supabaseClient, { loadId, patch }) {
  const { data, error } = await supabaseClient
    .from('loads')
    .update(patch)
    .eq('id', loadId)
    .select(BOL_FIELDS)
    .single();

  if (error) throw new Error(`loads update: ${error.message}`);
  return data;
}

// Driver-app OCR (Google Cloud Vision, /api/ocr/bol) auto-verifies when it
// finds every expected field; this is the dispatch-side override/confirm
// for the 'pending' case, or just a way to correct a bad OCR read.
export async function markBolVerified(supabaseClient, { loadId, verifiedBy, patch = {} }) {
  return updateBolFields(supabaseClient, {
    loadId,
    patch: {
      ...patch,
      bol_verification_status: 'dispatch_verified',
      bol_verified_at: new Date().toISOString(),
      bol_verified_by: verifiedBy,
    },
  });
}

// A checklist can have multiple load_secured photos (retakes after a
// failed AI compliance check) -- the most recent one is the one that
// actually gates the driver's ability to seal, so that's the one worth
// showing here too.
export function latestLoadSecuredPhoto(checklist) {
  const photos = (checklist?.checklist_photos ?? []).filter((p) => p.type === 'load_secured');
  if (photos.length === 0) return null;
  return photos.reduce((latest, p) => (p.uploaded_at > latest.uploaded_at ? p : latest));
}

// `load-photos` is a private bucket -- getPublicUrl won't work, this is
// the first signed-URL usage in the web app.
export async function fetchLoadSecuredPhotoUrl(supabaseClient, storagePath) {
  const { data, error } = await supabaseClient.storage.from('load-photos').createSignedUrl(storagePath, 300);
  if (error) throw new Error(`load-photos signed url: ${error.message}`);
  return data.signedUrl;
}

// Same "most recent wins" reasoning as latestLoadSecuredPhoto above -- a
// checklist can have more than one 'bol' photo (a retake), and this page
// never showed the photo itself before, only the OCR'd fields.
export function latestBolPhoto(checklist) {
  const photos = (checklist?.checklist_photos ?? []).filter((p) => p.type === 'bol');
  if (photos.length === 0) return null;
  return photos.reduce((latest, p) => (p.uploaded_at > latest.uploaded_at ? p : latest));
}

export async function fetchBolPhotoUrl(supabaseClient, storagePath) {
  const { data, error } = await supabaseClient.storage.from('bol-photos').createSignedUrl(storagePath, 300);
  if (error) throw new Error(`bol-photos signed url: ${error.message}`);
  return data.signedUrl;
}

// delivery_records is unique per (load_id, driver_id) -- more than one row
// only happens if more than one driver touched this load's delivery leg.
// pod_storage_path is only set once the driver's actually uploaded it.
export function latestPodPhoto(deliveries) {
  const records = (deliveries ?? []).filter((d) => d.pod_storage_path);
  if (records.length === 0) return null;
  return records.reduce((latest, d) => (d.created_at > latest.created_at ? d : latest));
}

export async function fetchPodPhotoUrl(supabaseClient, storagePath) {
  const { data, error } = await supabaseClient.storage.from('pod-photos').createSignedUrl(storagePath, 300);
  if (error) throw new Error(`pod-photos signed url: ${error.message}`);
  return data.signedUrl;
}

// Dispatch-only (backend enforces via requireRole) -- clears a hard-gated
// load whose photo the AI got wrong, without a client-side RLS update
// (checklist_photos has no UPDATE policy; the backend writes via
// supabaseAdmin). See coreva_logistics_brokerage_dashboard_back_end's
// vision module.
export async function overrideLoadSecuredCompliance(checklistPhotoId) {
  const { photo } = await apiPost('/api/vision/load-secured/override', { checklistPhotoId });
  return photo;
}
