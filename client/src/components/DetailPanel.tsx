import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The drawer everything opens into: a side panel on a wide screen, a sheet
 * that rises from the bottom on a narrow one. Escape closes it, so does the
 * backdrop, and the page behind it does not scroll while it is open.
 */
export default function DetailPanel({ title, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Hold the page still behind the panel, then give the scrollbar back.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-night-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="detail-panel relative flex max-h-[88vh] w-full flex-col border-line bg-night-900 sm:max-h-none sm:w-[30rem] sm:border-l"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <p className="label truncate">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-lg p-1.5 text-fog-300 hover:bg-white/5 hover:text-fog-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-col flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/** A labelled readout. The value is set in mono so columns of them line up. */
export function Readout({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="label">{label}</dt>
      <dd className={`mt-1 font-mono text-sm tabular-nums ${value ? '' : 'text-fog-700'}`}>{value || '—'}</dd>
    </div>
  );
}

export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-line pt-5 first:mt-0 first:border-0 first:pt-0">
      <h3 className="label mb-3">{title}</h3>
      {children}
    </section>
  );
}
