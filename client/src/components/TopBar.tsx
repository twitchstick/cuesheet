import { Plus, Search } from 'lucide-react';
import { Logo } from './Sidebar';

interface Props {
  title: string;
  serverName: string;
  greeting: string;
  canRequest: boolean;
  onSearch: () => void;
  onRequest: () => void;
}

export default function TopBar({ title, serverName, greeting, canRequest, onSearch, onRequest }: Props) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="lg:hidden">
          <Logo title={title} />
        </div>
        <div className="hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fog-500">{serverName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{greeting}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canRequest && (
          <>
            <button type="button" className="btn-ghost !px-2.5 sm:!px-3.5" onClick={onSearch} aria-label="Search">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
            <button type="button" className="btn-primary" onClick={onRequest}>
              <Plus className="h-4 w-4" />
              <span>Request<span className="hidden sm:inline"> media</span></span>
            </button>
          </>
        )}
      </div>
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
