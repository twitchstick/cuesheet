import { useEffect, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { adminToken, api } from '../api';

interface Props {
  onClose: () => void;
  onSignedIn: () => void;
}

export default function AdminLogin({ onClose, onSignedIn }: Props) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(password);
      adminToken.set(token);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog" aria-modal="true">
      <form onSubmit={submit} className="card w-full max-w-sm animate-rise p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold leading-tight">Admin sign in</h3>
              <p className="text-xs text-fog-500">See who is watching and change settings.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          className="mt-4 w-full rounded-xl border border-line bg-night-900 px-3 py-2 text-sm placeholder:text-fog-700 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
        />
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        <button type="submit" className="btn-primary mt-3 w-full" disabled={!password || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sign in
        </button>
      </form>
    </div>
  );
}
