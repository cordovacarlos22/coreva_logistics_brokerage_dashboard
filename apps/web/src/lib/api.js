import { supabase } from './supabaseClient.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Request to ${path} failed`);
  }
  return body;
}

// Unlike apiGet, this attaches the signed-in staff member's Supabase
// session token -- needed for routes behind requireAuth, like the
// dispatch-only /api/vision/load-secured/override. Mirrors
// coreva_driver_app/lib/api.js's apiPost.
export async function apiPost(path, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
