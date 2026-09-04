import { LogOut } from 'lucide-react';
import { Logo } from './Sidebar';

interface Props {
  title: string;
  serverName: string;
  greeting: string;
  /** Present only when a password is set -- shown on every view, not just overview, so logging out is never buried behind navigation. */
  onLogout?: () => void;
}

// "Request media" used to live here too, on every page -- but the Requests
// section already carries its own copy of that button wherever it actually
// renders (the front page tile, the Requests tab), so this one was just a
// second, out-of-context copy of the same button on every other page.
export default function TopBar({ title, serverName, greeting, onLogout }: Props) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-4">
      <div className="lg:hidden">
        <Logo title={title} />
      </div>
      <div className="hidden lg:block">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fog-500">{serverName}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{greeting}</h1>
      </div>
      {onLogout && (
        <button type="button" onClick={onLogout} className="btn-quiet ml-auto shrink-0" title="Log out">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Log out</span>
        </button>
      )}
    </header>
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
