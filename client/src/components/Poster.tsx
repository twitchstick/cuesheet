import { useState } from 'react';
import { Film, Tv } from 'lucide-react';

interface Props {
  src: string | null;
  alt: string;
  kind?: 'movie' | 'tv';
  className?: string;
}

/** A 2:3 poster with a quiet placeholder when there's no artwork (or it fails to load). */
export default function Poster({ src, alt, kind = 'movie', className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const Icon = kind === 'tv' ? Tv : Film;
  const showImage = src && !failed;
  return (
    <div className={`poster-frame ${className}`}>
      {showImage ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-night-600 to-night-800 text-fog-700">
          <Icon className="h-1/4 w-1/4 opacity-60" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
