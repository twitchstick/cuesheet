import { Logo } from './Sidebar';

interface Props {
  title: string;
  serverName: string;
  greeting: string;
}

// "Request media" used to live here too, on every page -- but the Requests
// section already carries its own copy of that button wherever it actually
// renders (the front page tile, the Requests tab), so this one was just a
// second, out-of-context copy of the same button on every other page.
export default function TopBar({ title, serverName, greeting }: Props) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-4">
      <div className="lg:hidden">
        <Logo title={title} />
      </div>
      <div className="hidden lg:block">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fog-500">{serverName}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{greeting}</h1>
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
