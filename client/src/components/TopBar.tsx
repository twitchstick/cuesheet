import { ArrowUpRight } from 'lucide-react';
import { Logo } from './Sidebar';

interface Props {
  title: string;
  serverName: string;
  greeting: string;
  /** Seerr's address, empty when it isn't configured. */
  seerrUrl: string;
}

export default function TopBar({ title, serverName, greeting, seerrUrl }: Props) {
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
        {seerrUrl && (
          <a href={seerrUrl} target="_blank" rel="noreferrer noopener" className="btn-primary" title="Opens Seerr in a new tab">
            <span>Request<span className="hidden sm:inline"> media</span></span>
            <ArrowUpRight className="h-4 w-4" />
          </a>
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
