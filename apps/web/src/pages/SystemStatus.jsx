import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { supabase } from '../lib/supabaseClient.js';

export default function SystemStatus() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet('/api/health')
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  const webSupabaseConfigured = Boolean(supabase);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-lg rounded border border-border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-primary">Coreva Logistics Brokerage</h1>
        <p className="mt-1 text-sm text-text/70">System status</p>

        <dl className="mt-6 space-y-4">
          <StatusRow
            label="Backend API"
            ok={health?.status === 'ok'}
            detail={error ? error : (health ? health.status : 'checking…')}
          />
          <StatusRow
            label="Supabase (backend)"
            ok={health?.supabase === 'connected'}
            detail={health?.supabase ?? 'checking…'}
          />
          <StatusRow
            label="Supabase (web client)"
            ok={webSupabaseConfigured}
            detail={
              webSupabaseConfigured
                ? 'configured'
                : 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set'
            }
          />
        </dl>
      </div>
    </main>
  );
}

function StatusRow({ label, ok, detail }) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-4 first:border-t-0 first:pt-0">
      <dt className="font-medium">{label}</dt>
      <dd className="flex items-center gap-2 font-mono text-sm">
        <span
          className={`h-2 w-2 rounded-full ${ok ? 'bg-status-delivered' : 'bg-secondary'}`}
          aria-hidden="true"
        />
        {detail}
      </dd>
    </div>
  );
}
