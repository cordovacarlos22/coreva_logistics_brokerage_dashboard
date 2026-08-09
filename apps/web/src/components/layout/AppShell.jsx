import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { Avatar, AvatarFallback } from '../ui/avatar.jsx';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const NAV_ITEMS = [
  { to: '/', label: 'Loads', icon: 'local_shipping', staffOnly: false },
  { to: '/map', label: 'Map', icon: 'map', staffOnly: false },
  { to: '/trailers', label: 'Trailers', icon: 'rv_hookup', staffOnly: true },
  { to: '/analytics', label: 'Analytics', icon: 'analytics', staffOnly: false },
  { to: '/team-chat', label: 'Team Chat', icon: 'forum', staffOnly: true },
];

export default function AppShell({ children }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const isStaff = profile?.role === 'admin' || profile?.role === 'dispatcher';

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-white md:flex">
        <div className="border-b border-border p-6">
          <p className="font-semibold text-primary">Coreva Logistics</p>
          <p className="text-sm text-text/60">Brokerage Portal</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.filter((item) => !item.staffOnly || isStaff).map((item) => {
            const active = item.to === location.pathname;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-surface text-primary' : 'text-text/70 hover:bg-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6">
          <p className="font-semibold text-primary">
            {isStaff ? 'Coreva Logistics Brokerage' : profile?.customer_company}
          </p>
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{initials(profile?.full_name)}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-text/70">{profile?.full_name}</span>
            <button type="button" onClick={signOut} className="text-sm font-medium text-primary hover:underline">
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
