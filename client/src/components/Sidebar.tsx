import { CalendarDays, Home, LogIn, LogOut, Play, Plus, Settings, Sparkles } from 'lucide-react';
import Avatar from './Avatar';
import type { SessionUser } from '../types';
import { sourceLabel } from '../lib/format';
import Logo from './Logo';
import type { View } from '../types';

export { Logo };

export const NAV: { view: View; label: string; icon: typeof Home }[] = [
  { view: 'overview', label: 'Overview', icon: Home },
  { view: 'streams', label: 'Now Playing', icon: Play },
  { view: 'recent', label: 'Recently Added', icon: Sparkles },
  { view: 'calendar', label: 'Release Calendar', icon: CalendarDays },
  { view: 'requests', label: 'Requests', icon: Plus },
  { view: 'setup', label: 'Settings', icon: Settings },
];

export interface ServiceHealth {
  name: string;
  ok: boolean | undefined;
}

export interface AdminState {
  protected: boolean;
  admin: boolean;
  user: SessionUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

interface Props {
  title: string;
  view: View;
  available: Set<View>;
  onNavigate: (view: View) => void;
  services: ServiceHealth[];
  auth: AdminState;
}

export default function Sidebar({ title, view, available, onNavigate, services, auth }: Props) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-night-900 px-4 py-6 lg:flex">
      <div className="px-2">
        <Logo title={title} />
      </div>
      <nav className="mt-8 flex flex-col gap-1">
        {NAV.filter((n) => available.has(n.view)).map(({ view: v, label, icon: Icon }) => (
          <button key={v} type="button" className="nav-item" aria-current={view === v ? 'page' : undefined} onClick={() => onNavigate(v)}>
            <Icon className="h-4 w-4 text-fog-500" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <AdminBadge auth={auth} />
        <ServicesCard services={services} />
      </div>
    </aside>
  );
}

export function AdminBadge({ auth }: { auth: AdminState }) {
  if (!auth.protected) return null;
  if (!auth.user) {
    return (
      <button type="button" onClick={auth.onSignIn} className="nav-item justify-center text-xs">
        <LogIn className="h-3.5 w-3.5 text-fog-500" /> Sign in
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-night-800 px-3 py-2">
      <Avatar name={auth.user.name} src={auth.user.avatar} className="h-8 w-8 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{auth.user.name}</p>
        <p className={`text-[11px] ${auth.admin ? 'text-accent-300' : 'text-fog-500'}`}>{auth.admin ? 'Admin' : 'Viewer'}</p>
      </div>
      <button type="button" onClick={auth.onSignOut} className="rounded-md p-1.5 text-fog-500 hover:bg-white/5 hover:text-fog-100" title="Sign out" aria-label="Sign out">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ServicesCard({ services }: { services: ServiceHealth[] }) {
  return (
    <div className="card p-4">
      <p className="mb-2 text-sm font-semibold">Services</p>
      {services.length === 0 && <p className="text-xs text-fog-500">None configured</p>}
      <ul className="flex flex-col gap-1.5">
        {services.map(({ name, ok }) => (
          <li key={name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-fog-300">
              <span className={`h-1.5 w-1.5 rounded-full ${ok === false ? 'bg-amber-400' : ok ? 'bg-emerald-400' : 'bg-fog-700'}`} />
              {sourceLabel[name] ?? name}
            </span>
            <span className="text-xs text-fog-500">{ok === false ? 'Offline' : ok ? 'Online' : 'Checking'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MobileNav({ view, available, onNavigate }: Pick<Props, 'view' | 'available' | 'onNavigate'>) {
  return (
    <nav className="scroll-row -mx-4 mb-6 flex gap-1 overflow-x-auto px-4 lg:hidden">
      {NAV.filter((n) => available.has(n.view)).map(({ view: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onNavigate(v)}
          aria-current={view === v ? 'page' : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${view === v ? 'border-accent-500/50 bg-accent-500/15 text-fog-100' : 'border-line bg-night-800 text-fog-500'}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </nav>
  );
}
