import { useState } from 'react';
import { Bell, CheckCircle2, CircleAlert, LogOut, X } from 'lucide-react';
import { Logo } from './Sidebar';
import { api } from '../api';
import type { NotificationFeed } from '../types';

interface Props {
  title: string;
  serverName: string;
  greeting: string;
  notifications: NotificationFeed | null;
  onNotificationsChanged: () => void;
  /** Present only when a password is set -- shown on every view, not just overview, so logging out is never buried behind navigation. */
  onLogout?: () => void;
}

// "Request media" used to live here too, on every page -- but the Requests
// section already carries its own copy of that button wherever it actually
// renders (the front page tile, the Requests tab), so this one was just a
// second, out-of-context copy of the same button on every other page.
export default function TopBar({ title, serverName, greeting, notifications, onNotificationsChanged, onLogout }: Props) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-4">
      <div className="lg:hidden">
        <Logo title={title} />
      </div>
      <div className="hidden lg:block">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fog-500">{serverName}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{greeting}</h1>
      </div>
      <div className="relative ml-auto flex shrink-0 items-center gap-2">
        <NotificationBell feed={notifications} onChanged={onNotificationsChanged} />
        {onLogout && (
          <button type="button" onClick={onLogout} className="btn-quiet shrink-0" title="Log out">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        )}
      </div>
    </header>
  );
}

function NotificationBell({ feed, onChanged }: { feed: NotificationFeed | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const show = async () => {
    setOpen(true);
    if ((feed?.unread ?? 0) > 0) {
      try {
        await api.markNotificationsRead();
        onChanged();
      } catch {
        // Reading the local history is still useful if the acknowledgement write fails.
      }
    }
  };
  return (
    <>
      <button type="button" className="btn-quiet relative px-2.5" onClick={() => (open ? setOpen(false) : show())} aria-label="Notifications" aria-expanded={open}>
        <Bell className="h-4 w-4" />
        {(feed?.unread ?? 0) > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{Math.min(feed?.unread ?? 0, 99)}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-night-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-[11px] text-fog-500">{feed?.active.length ?? 0} active incident{feed?.active.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" className="rounded-lg p-1.5 text-fog-500 hover:bg-white/5 hover:text-fog-100" onClick={() => setOpen(false)} aria-label="Close notifications"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!feed?.history.length && <p className="px-4 py-8 text-center text-sm text-fog-500">No incidents yet.</p>}
            {feed?.history.slice(0, 20).map((item) => (
              <div key={item.id} className="flex gap-3 border-b border-line/70 px-4 py-3 last:border-0">
                {item.status === 'resolved' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 whitespace-pre-line text-xs text-fog-400">{item.message}</p>
                  <p className="mt-1 text-[10px] text-fog-600">{new Date(item.openedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function MobileGreeting({ serverName, greeting }: { serverName: string; greeting: string }) {
  return (
    <div className="mb-5 lg:hidden">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fog-500">{serverName}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{greeting}</h1>
    </div>
  );
}
