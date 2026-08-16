import { apiPost } from './api.js';

function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchLoadDetail(supabaseClient, loadId) {
  const [load, stops, checklists, discrepancies, notes] = await Promise.all([
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
  ]);

  return { load, stops, checklists, discrepancies, notes };
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

// Dispatch-only (backend enforces via requireRole) -- clears a hard-gated
// load whose photo the AI got wrong, without a client-side RLS update
// (checklist_photos has no UPDATE policy; the backend writes via
// supabaseAdmin). See coreva_logistics_brokerage_dashboard_back_end's
// vision module.
export async function overrideLoadSecuredCompliance(checklistPhotoId) {
  const { photo } = await apiPost('/api/vision/load-secured/override', { checklistPhotoId });
  return photo;
}
