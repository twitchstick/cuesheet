import { useState } from 'react';
import { User } from 'lucide-react';

interface Props {
  name?: string | null;
  src?: string | null;
  className?: string;
}

/** Round avatar: the person's picture if there is one, else their initial. */
export default function Avatar({ name, src, className = 'h-8 w-8 text-xs' }: Props) {
  const [failed, setFailed] = useState(false);
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '';
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-500/25 font-bold text-accent-300 ${className}`} title={name ?? undefined}>
      {src && !failed ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : initial ? (
        initial
      ) : (
        <User className="h-1/2 w-1/2" />
      )}
    </span>
  );
}
