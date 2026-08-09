import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { user, profile, profileError, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-text/60">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profileError || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded border border-border bg-white p-6 text-center">
          <p className="font-semibold text-primary">No profile found</p>
          <p className="mt-2 text-sm text-text/70">
            Your account signed in, but there&apos;s no matching profile record. Contact an admin
            to get one created.
          </p>
        </div>
      </div>
    );
  }

  if (profile.role === 'driver') {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded border border-border bg-white p-6 text-center">
          <p className="font-semibold text-primary">Driver access is mobile-only</p>
          <p className="mt-2 text-sm text-text/70">
            This dashboard is for dispatch and admin staff. Use the Coreva Driver app on your
            phone to view your loads and complete checklists.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-4 text-sm font-medium text-primary hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return children;
}
