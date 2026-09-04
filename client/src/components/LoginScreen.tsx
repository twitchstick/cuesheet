import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { CueMark } from './Logo';
import { ApiError } from '../api';

interface Props {
  title: string;
  serverName: string;
  onLogin: (password: string) => Promise<void>;
}

/** The whole app behind a password: nothing else renders until this resolves. */
export default function LoginScreen({ title, serverName, onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError(null);
    try {
      await onLogin(password);
      // On success the parent's own auth status flips and this component
      // unmounts -- nothing left to update here.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach Cuesheet');
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <CueMark className="h-12 w-12 shadow-accent rounded-2xl" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {serverName && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fog-500">{serverName}</p>}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fog-300">
            <Lock className="h-3.5 w-3.5" /> Password
          </span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-xl border border-line bg-night-900 px-3 py-2 text-sm placeholder:text-fog-700 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

        <button type="submit" className="btn-primary mt-5 w-full justify-center" disabled={!password || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Unlock
        </button>
      </form>
    </div>
  );
}
