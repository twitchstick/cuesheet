/** The Cuesheet mark: a "C" drawn as a playhead sweeping a ring, cyan dot at the head. */
export function CueMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cue-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8d6dff" />
          <stop offset="1" stopColor="#5a3fe0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#cue-tile)" />
      <path d="M32 15 A17 17 0 1 1 15 32" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" opacity="0.95" />
      <circle cx="15" cy="32" r="5.5" fill="#22d3ee" />
    </svg>
  );
}

export default function Logo({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <CueMark className="h-9 w-9 shadow-accent rounded-xl" />
      <span className="text-xl font-bold tracking-tight">{title}</span>
    </div>
  );
}
