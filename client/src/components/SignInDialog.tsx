import { useEffect, useRef, useState } from 'react';
import { ExternalLink, KeyRound, Loader2, LogIn, X } from 'lucide-react';
import { adminToken, api, type Session } from '../api';
import type { SignInProviders } from '../types';

interface Props {
  providers: SignInProviders;
  onClose: () => void;
  onSignedIn: (session: Session) => void;
}

type Method = 'plex' | 'jellyfin' | 'password';

const LABEL: Record<Method, string> = { plex: 'Plex', jellyfin: 'Jellyfin', password: 'Admin password' };

export default function SignInDialog({ providers, onClose, onSignedIn }: Props) {
  const available = (['plex', 'jellyfin', 'password'] as Method[]).filter((m) => providers[m]);
  const [method, setMethod] = useState<Method>(available[0] ?? 'password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finish = (session: Session) => {
    adminToken.set(session.token);
    onSignedIn(session);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog" aria-modal="true">
      <div className="card w-full max-w-sm animate-rise p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300">
              <LogIn className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold leading-tight">Sign in</h3>
              <p className="text-xs text-fog-500">See your name, and who else is watching if you’re an admin.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {available.length > 1 && (
          <div className="seg mt-4 w-full" role="group" aria-label="Sign-in method">
            {available.map((m) => (
              <button
                key={m}
                type="button"
                className="flex-1"
                aria-pressed={method === m}
                onClick={() => {
                  setMethod(m);
                  setError(null);
                }}
              >
                {m === 'password' ? 'Password' : LABEL[m]}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">
          {method === 'plex' && <PlexSignIn busy={busy} setBusy={setBusy} onError={setError} onSignedIn={finish} />}
          {method === 'jellyfin' && <CredentialForm kind="jellyfin" busy={busy} setBusy={setBusy} onError={setError} onSignedIn={finish} />}
          {method === 'password' && <CredentialForm kind="password" busy={busy} setBusy={setBusy} onError={setError} onSignedIn={finish} />}
        </div>

        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      </div>
    </div>
  );
}

function PlexSignIn({
  busy,
  setBusy,
  onError,
  onSignedIn,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (m: string | null) => void;
  onSignedIn: (s: Session) => void;
}) {
  const [waiting, setWaiting] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const start = async () => {
    onError(null);
    setBusy(true);
    // Open the popup from inside the click so browsers don't block it.
    const popup = window.open('', 'cuesheet-plex', 'width=620,height=720');
    try {
      const { pinId, pinSecret, authUrl } = await api.plexStart();
      if (popup) popup.location.href = authUrl;
      else window.location.href = authUrl;
      setWaiting(true);

      // plex.tv PINs last a few minutes; poll until one is claimed.
      for (let i = 0; i < 90 && !cancelled.current; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled.current) return;
        const result = await api.plexFinish(pinId, pinSecret);
        if (!('pending' in result)) {
          popup?.close();
          onSignedIn(result);
          return;
        }
        if (popup?.closed && i > 2) break;
      }
      if (!cancelled.current) onError('Plex sign-in timed out. Try again.');
    } catch (err) {
      popup?.close();
      if (!cancelled.current) onError(err instanceof Error ? err.message : 'Plex sign-in failed');
    } finally {
      if (!cancelled.current) {
        setBusy(false);
        setWaiting(false);
      }
    }
  };

  return (
    <div>
      <button type="button" className="btn-primary w-full" onClick={start} disabled={busy}>
        {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        {waiting ? 'Waiting for Plex…' : 'Continue with Plex'}
      </button>
      <p className="mt-2 text-[11px] text-fog-500">
        {waiting
          ? 'Approve the sign-in in the Plex window, then come back here.'
          : 'Opens plex.tv in a new window. Cuesheet never sees your Plex password, and only accounts with access to this server can sign in.'}
      </p>
    </div>
  );
}

function CredentialForm({
  kind,
  busy,
  setBusy,
  onError,
  onSignedIn,
}: {
  kind: 'jellyfin' | 'password';
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (m: string | null) => void;
  onSignedIn: (s: Session) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      onSignedIn(kind === 'jellyfin' ? await api.jellyfinLogin(username, password) : await api.login(password));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-xl border border-line bg-night-900 px-3 py-2 text-sm placeholder:text-fog-700 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/25';

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {kind === 'jellyfin' && (
        <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Jellyfin username" className={input} autoComplete="username" />
      )}
      <input
        type="password"
        autoFocus={kind === 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={kind === 'jellyfin' ? 'Password' : 'Admin password'}
        className={input}
        autoComplete="current-password"
      />
      <button type="submit" className="btn-primary mt-1 w-full" disabled={busy || (kind === 'jellyfin' ? !username : !password)}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Sign in
      </button>
      {kind === 'password' && <p className="mt-1 text-[11px] text-fog-500">The shared admin password from Settings.</p>}
    </form>
  );
}
