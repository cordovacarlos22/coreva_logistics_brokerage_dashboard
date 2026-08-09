const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Request to ${path} failed`);
  }
  return body;
}
