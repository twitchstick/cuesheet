import type { ReactNode } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { sourceLabel } from '../lib/format';
import type { Errors } from '../types';

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  errors?: Errors | null;
  children: ReactNode;
  /** Makes the title itself a link to somewhere with more -- Recently
   * Added's full page, say. Separate from `action`, which stays for
   * controls (a filter, a "Request media" button) rather than navigation. */
  onTitleClick?: () => void;
}

export default function Section({ title, subtitle, action, errors, children, onTitleClick }: Props) {
  const errorEntries = errors ? Object.entries(errors) : [];
  return (
    <section className="animate-rise">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {onTitleClick ? (
              <button type="button" onClick={onTitleClick} className="group/title inline-flex items-center gap-1 hover:text-accent-300">
                {title}
                <ChevronRight className="h-4 w-4 text-fog-500 transition-transform group-hover/title:translate-x-0.5 group-hover/title:text-accent-300" />
              </button>
            ) : (
              title
            )}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-fog-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {errorEntries.map(([service, message]) => (
            <span key={service} title={message} className="inline-flex items-center gap-1 text-xs text-amber-300/90">
              <AlertTriangle className="h-3.5 w-3.5" />
              {sourceLabel[service] ?? service} unreachable
            </span>
          ))}
          {action}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card flex min-h-[96px] items-center justify-center px-4 py-6 text-sm text-fog-500">{children}</div>;
}

export function SkeletonRow({ count = 6, className = 'w-36' }: { count?: number; className?: string }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${className} shrink-0`}>
          <div className="poster-frame animate-pulse bg-night-700" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-night-700" />
        </div>
      ))}
    </div>
  );
}
