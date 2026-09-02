import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, Loader2, Lock, LogOut, Plug, ShieldCheck, Trash2, UserX, XCircle } from 'lucide-react';
import { ApiError, adminToken, api } from '../api';
import Avatar from './Avatar';
import { Empty } from './Section';
import { timeAgo } from '../lib/format';
import type { AppConfig, PeopleState, ServiceName, Settings, TestResult } from '../types';

interface Props {
  firstRun: boolean;
  locked: boolean;
  onSaved: (config: AppConfig) => void;
  onSignedIn: () => void;
  onCancel: () => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}

type ServiceDraft = { url: string; secret: string; secretSet: boolean; userId: string };
type Draft = { general: Settings['general'] & { adminPassword: string; clearAdminPassword: boolean } } & Record<ServiceName, ServiceDraft>;

const SERVICE_META: Record<
  ServiceName,
  { label: string; blurb: string; urlExample: string; secretLabel: string; secretHelp: string; userLabel?: string; userHelp?: string }
> = {
  plex: {
    label: 'Plex',
    blurb: 'Now playing and recently added',
    urlExample: 'http://192.168.1.10:32400',
    secretLabel: 'Plex token',
    secretHelp: 'Plex Web → any item → ⋯ → Get Info → View XML, then copy X-Plex-Token from the address bar.',
  },
  jellyfin: {
    label: 'Jellyfin',
    blurb: 'Now playing and recently added',
    urlExample: 'http://192.168.1.10:8096',
    secretLabel: 'API key',
    secretHelp: 'Jellyfin → Dashboard → API Keys → +',
    userLabel: 'Library user (optional)',
    userHelp: 'Recently Added uses this user’s view, grouped by series.',
  },
  radarr: { label: 'Radarr', blurb: 'Movie releases on the calendar', urlExample: 'http://192.168.1.10:7878', secretLabel: 'API key', secretHelp: 'Radarr → Settings → General → Security → API Key' },
  sonarr: { label: 'Sonarr', blurb: 'Episode air dates on the calendar', urlExample: 'http://192.168.1.10:8989', secretLabel: 'API key', secretHelp: 'Sonarr → Settings → General → Security → API Key' },
  seerr: {
    label: 'Seerr',
    blurb: 'Search and request through Overseerr or Jellyseerr',
    urlExample: 'http://192.168.1.10:5055',
    secretLabel: 'API key',
    secretHelp: 'Overseerr / Jellyseerr → Settings → General → API Key',
    userLabel: 'Request as (optional)',
    userHelp: 'Requests are made by the API key’s owner unless you pick another user.',
  },
};

const STEPS: { id: string; title: string; caption: string; services: ServiceName[] }[] = [
  { id: 'welcome', title: 'Welcome', caption: 'Name and basics', services: [] },
  { id: 'media', title: 'Media servers', caption: 'Plex and Jellyfin', services: ['plex', 'jellyfin'] },
  { id: 'library', title: 'Library', caption: 'Radarr and Sonarr', services: ['radarr', 'sonarr'] },
  { id: 'requests', title: 'Requests', caption: 'Overseerr or Jellyseerr', services: ['seerr'] },
  { id: 'people', title: 'People', caption: 'Sign-in and admins', services: [] },
  { id: 'review', title: 'Review', caption: 'Check and save', services: [] },
];

const fromSettings = (s: Settings): Draft => ({
  general: { ...s.general, adminPassword: '', clearAdminPassword: false },
  plex: { url: s.plex.url, secret: '', secretSet: Boolean(s.plex.tokenSet), userId: '' },
  jellyfin: { url: s.jellyfin.url, secret: '', secretSet: Boolean(s.jellyfin.apiKeySet), userId: s.jellyfin.userId ?? '' },
  radarr: { url: s.radarr.url, secret: '', secretSet: Boolean(s.radarr.apiKeySet), userId: '' },
  sonarr: { url: s.sonarr.url, secret: '', secretSet: Boolean(s.sonarr.apiKeySet), userId: '' },
  seerr: { url: s.seerr.url, secret: '', secretSet: Boolean(s.seerr.apiKeySet), userId: s.seerr.userId ?? '' },
});

const secretField = (s: ServiceName) => (s === 'plex' ? 'token' : 'apiKey');
const isFilled = (d: ServiceDraft) => Boolean(d.url.trim() && (d.secret.trim() || d.secretSet));

export default function SetupWizard({ firstRun, locked, onSaved, onSignedIn, onCancel, notify }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(0);
  const [tests, setTests] = useState<Partial<Record<ServiceName, TestResult | 'pending'>>>({});
  const [users, setUsers] = useState<Partial<Record<ServiceName, { id: string; name: string }[]>>>({});
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<PeopleState | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const s = await api.settings();
      setDraft(fromSettings(s));
      setNeedsPassword(false);
      api.people().then(setPeople).catch(() => setPeople(null));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsPassword(true);
      else setLoadError(err instanceof Error ? err.message : 'Could not load settings');
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [unlockError, setUnlockError] = useState<string | null>(null);
  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    try {
      const { token } = await api.login(password);
      adminToken.set(token);
      onSignedIn();
      await load();
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Sign in failed');
    }
  };

  const update = (service: ServiceName, patch: Partial<ServiceDraft>) => {
    setDraft((d) => (d ? { ...d, [service]: { ...d[service], ...patch } } : d));
    // Changing the URL or credential invalidates the last test; picking a user does not.
    if ('url' in patch || 'secret' in patch) setTests((t) => ({ ...t, [service]: undefined }));
  };

  const test = async (service: ServiceName) => {
    if (!draft) return;
    const d = draft[service];
    setTests((t) => ({ ...t, [service]: 'pending' }));
    try {
      const result = await api.testConnection({ service, url: d.url, [secretField(service)]: d.secret });
      setTests((t) => ({ ...t, [service]: result }));
      if (result.ok && result.users) setUsers((u) => ({ ...u, [service]: result.users }));
    } catch (err) {
      setTests((t) => ({ ...t, [service]: { ok: false, error: err instanceof Error ? err.message : 'Test failed' } }));
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { adminPassword: newPassword, clearAdminPassword, adminPasswordSet, adminPasswordFromEnv, ...general } = draft.general;
      void adminPasswordSet;
      void adminPasswordFromEnv;
      const patch: Record<string, unknown> = {
        general: { ...general, ...(newPassword.trim() ? { adminPassword: newPassword.trim() } : {}), ...(clearAdminPassword ? { clearAdminPassword: true } : {}) },
      };
      for (const s of Object.keys(SERVICE_META) as ServiceName[]) {
        const d = draft[s];
        const entry: Record<string, unknown> = { url: d.url.trim() };
        if (d.secret.trim()) entry[secretField(s)] = d.secret.trim();
        else if (!d.url.trim()) entry[secretField(s)] = '';
        if (s === 'jellyfin' || s === 'seerr') entry.userId = d.userId;
        patch[s] = entry;
      }
      const { config, token } = await api.saveSettings(patch);
      adminToken.set(token);
      notify('Settings saved');
      onSaved(config);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    if (!draft) return [];
    return (Object.keys(SERVICE_META) as ServiceName[]).map((s) => {
      const t = tests[s];
      const filled = isFilled(draft[s]);
      const state = !filled ? 'off' : t && t !== 'pending' ? (t.ok ? 'ok' : 'fail') : 'untested';
      return { service: s, state, detail: t && t !== 'pending' ? (t.ok ? [t.name, t.version].filter(Boolean).join(' · ') : t.error) : '' };
    });
  }, [draft, tests]);

  if (needsPassword) {
    return (
      <Shell firstRun={firstRun} onCancel={onCancel}>
        <form onSubmit={unlock} className="mx-auto max-w-sm py-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-300">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold">Settings are locked</h3>
          <p className="mt-1 text-sm text-fog-500">Enter the admin password to change connections.</p>
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" className={inputCls + ' mt-4'} />
          {unlockError && <p className="mt-2 text-xs text-rose-300">{unlockError}</p>}
          <button type="submit" className="btn-primary mt-3 w-full" disabled={!password}>
            Unlock
          </button>
        </form>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell firstRun={firstRun} onCancel={onCancel}>
        <div className="py-6 text-center text-sm text-rose-300">{loadError}</div>
      </Shell>
    );
  }

  if (!draft) {
    return (
      <Shell firstRun={firstRun} onCancel={onCancel}>
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-fog-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
        </div>
      </Shell>
    );
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Shell firstRun={firstRun} onCancel={onCancel} locked={locked}>
      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <ol className="scroll-row flex gap-2 overflow-x-auto md:flex-col">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-left ${i === step ? 'bg-night-700 ring-1 ring-line' : 'hover:bg-white/5'}`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i < step ? 'bg-emerald-400/20 text-emerald-300' : i === step ? 'bg-accent-500 text-white' : 'bg-night-600 text-fog-500'}`}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="hidden text-[11px] text-fog-500 md:block">{s.caption}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="min-w-0">
          {current.id === 'welcome' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-lg font-bold">Let’s get Cuesheet set up</h3>
                <p className="mt-1 text-sm text-fog-500">
                  Every service is optional. Fill in the ones you run, test each connection, and save. Keys are stored on the server and never sent back to the browser.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name" hint="Shown in the greeting">
                  <input className={inputCls} value={draft.general.userName} onChange={(e) => setDraft({ ...draft, general: { ...draft.general, userName: e.target.value } })} placeholder="Christopher" />
                </Field>
                <Field label="Server name" hint="Small label above the greeting">
                  <input className={inputCls} value={draft.general.serverName} onChange={(e) => setDraft({ ...draft, general: { ...draft.general, serverName: e.target.value } })} placeholder="Apollo Media" />
                </Field>
                <Field label="Recently added items" hint="How many posters the row holds, 3 to 40. Scroll sideways to reach the rest.">
                  <input
                    type="number"
                    min={3}
                    max={40}
                    className={inputCls}
                    value={draft.general.recentLimit}
                    onChange={(e) => setDraft({ ...draft, general: { ...draft.general, recentLimit: Number(e.target.value) } })}
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-line bg-night-700/60 p-4">
                <p className="text-sm font-medium">Admin access</p>
                <p className="mt-0.5 text-xs text-fog-500">
                  With a password set, only signed-in admins can open Settings. Everyone else still gets the dashboard.
                  {draft.general.adminPasswordFromEnv && ' A password is also set by the ADMIN_PASSWORD variable and keeps working.'}
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label={draft.general.adminPasswordSet ? 'Change admin password' : 'Admin password'} hint={draft.general.adminPasswordSet ? 'Leave blank to keep the current one.' : 'Optional. At least 4 characters.'}>
                    <input
                      type="password"
                      className={inputCls}
                      value={draft.general.adminPassword}
                      autoComplete="new-password"
                      onChange={(e) => setDraft({ ...draft, general: { ...draft.general, adminPassword: e.target.value, clearAdminPassword: false } })}
                      placeholder={draft.general.adminPasswordSet ? 'Saved — leave blank to keep' : 'Choose a password'}
                    />
                  </Field>
                  {draft.general.adminPasswordSet && !draft.general.adminPasswordFromEnv && (
                    <label className="flex cursor-pointer items-start gap-3 pt-6 text-sm">
                      <input type="checkbox" className="mt-0.5 accent-accent-500" checked={draft.general.clearAdminPassword} onChange={(e) => setDraft({ ...draft, general: { ...draft.general, clearAdminPassword: e.target.checked, adminPassword: '' } })} />
                      <span>
                        <span className="block font-medium">Remove the password</span>
                        <span className="block text-xs text-fog-500">Everyone becomes an admin again.</span>
                      </span>
                    </label>
                  )}
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-0.5 accent-accent-500" checked={draft.general.hideViewers} onChange={(e) => setDraft({ ...draft, general: { ...draft.general, hideViewers: e.target.checked } })} />
                  <span>
                    <span className="block text-sm font-medium">Hide who is watching from non-admins</span>
                    <span className="block text-xs text-fog-500">Viewers still see what is playing and its progress, but not the user or device name. Needs a password to have any effect.</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {current.services.length > 0 && (
            <div className="flex flex-col gap-4">
              {current.services.map((s) => (
                <ServiceCard
                  key={s}
                  service={s}
                  draft={draft[s]}
                  test={tests[s]}
                  users={users[s]}
                  onChange={(patch) => update(s, patch)}
                  onTest={() => test(s)}
                  onClear={() => {
                    update(s, { url: '', secret: '', secretSet: false, userId: '' });
                  }}
                />
              ))}
            </div>
          )}

          {current.id === 'people' && <PeopleStep state={people} onChange={setPeople} notify={notify} draft={draft} />}

          {current.id === 'review' && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold">Ready to save</h3>
                <p className="mt-1 text-sm text-fog-500">Here’s what will be connected. You can come back to Settings any time.</p>
              </div>
              <ul className="card divide-y divide-line">
                {summary.map(({ service, state, detail }) => (
                  <li key={service} className="flex items-center gap-3 p-3">
                    <StateDot state={state} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{SERVICE_META[service].label}</p>
                      <p className="truncate text-xs text-fog-500">
                        {state === 'off' ? 'Not configured' : state === 'ok' ? `Connected · ${detail}` : state === 'fail' ? detail : `${draft[service].url} · not tested`}
                      </p>
                    </div>
                  </li>
                ))}
                <li className="flex items-center gap-3 p-3">
                  <StateDot state={people && (people.providers.plex || people.providers.jellyfin || people.providers.password) ? 'ok' : 'off'} />
                  <p className="text-sm">
                    Sign-in{' '}
                    <span className="text-fog-500">
                      {people
                        ? [people.providers.plex && 'Plex', people.providers.jellyfin && 'Jellyfin', people.providers.password && 'password'].filter(Boolean).join(', ') || 'off — everyone is an admin'
                        : '—'}
                    </span>
                  </p>
                </li>
                <li className="flex items-center gap-3 p-3">
                  <StateDot state="ok" />
                  <p className="text-sm">
                    Recently added <span className="text-fog-500">{draft.general.recentLimit} items</span>
                  </p>
                </li>
              </ul>
              {summary.every((s) => s.state === 'off') && (
                <p className="text-xs text-amber-300">Nothing is configured yet — the dashboard will stay empty until a service is added.</p>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
            <button type="button" className="btn-quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex items-center gap-2">
              {!firstRun && step < STEPS.length - 1 && (
                <button type="button" className="btn-quiet" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save now
                </button>
              )}
              {last ? (
                <button type="button" className="btn-primary" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save & finish
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => setStep((s) => s + 1)}>
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ firstRun, onCancel, locked, children }: { firstRun: boolean; onCancel: () => void; locked?: boolean; children: React.ReactNode }) {
  return (
    <section className="animate-rise">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{firstRun ? 'Setup' : 'Settings'}</h2>
          <p className="mt-0.5 text-sm text-fog-500">{firstRun ? 'Connect your services to bring the dashboard to life' : 'Connections, names and who can sign in'}</p>
        </div>
        <div className="flex items-center gap-2">
          {locked && (
            <span className="inline-flex items-center gap-1 text-xs text-fog-500">
              <Lock className="h-3 w-3" /> Password protected
            </span>
          )}
          {!firstRun && (
            <button type="button" className="btn-quiet" onClick={onCancel}>
              Close
            </button>
          )}
        </div>
      </header>
      <div className="card p-5 sm:p-6">{children}</div>
    </section>
  );
}

const inputCls = 'w-full rounded-xl border border-line bg-night-900 px-3 py-2 text-sm placeholder:text-fog-700 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/25';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-fog-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fog-500">{hint}</span>}
    </label>
  );
}

function StateDot({ state }: { state: string }) {
  const cls = state === 'ok' ? 'bg-emerald-400' : state === 'fail' ? 'bg-rose-400' : state === 'untested' ? 'bg-amber-400' : 'bg-fog-700';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function ServiceCard({
  service,
  draft,
  test,
  users,
  onChange,
  onTest,
  onClear,
}: {
  service: ServiceName;
  draft: ServiceDraft;
  test: TestResult | 'pending' | undefined;
  users?: { id: string; name: string }[];
  onChange: (patch: Partial<ServiceDraft>) => void;
  onTest: () => void;
  onClear: () => void;
}) {
  const meta = SERVICE_META[service];
  const [show, setShow] = useState(false);
  const filled = isFilled(draft);
  const canTest = Boolean(draft.url.trim()) && (Boolean(draft.secret.trim()) || draft.secretSet);
  return (
    <div className="rounded-xl border border-line bg-night-700/50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${filled ? 'bg-accent-500/20 text-accent-300' : 'bg-night-600 text-fog-500'}`}>
            <Plug className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold leading-tight">{meta.label}</p>
            <p className="text-xs text-fog-500">{meta.blurb}</p>
          </div>
        </div>
        {(draft.url || draft.secretSet) && (
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-fog-500 hover:bg-white/5 hover:text-rose-300" title="Remove this connection">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Server URL" hint={`Example: ${meta.urlExample}`}>
          <input className={inputCls} value={draft.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="" inputMode="url" autoComplete="off" />
        </Field>
        <Field label={meta.secretLabel} hint={meta.secretHelp}>
          <div className="relative">
            <input
              className={inputCls + ' pr-9'}
              type={show ? 'text' : 'password'}
              value={draft.secret}
              onChange={(e) => onChange({ secret: e.target.value })}
              placeholder={draft.secretSet ? 'Saved — leave blank to keep' : 'Paste here'}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-fog-500 hover:text-fog-100" aria-label={show ? 'Hide' : 'Show'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        {meta.userLabel && (
          <Field label={meta.userLabel} hint={meta.userHelp}>
            {users && users.length > 0 ? (
              <select className={inputCls} value={draft.userId} onChange={(e) => onChange({ userId: e.target.value })}>
                <option value="">— none —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <input className={inputCls} value={draft.userId} onChange={(e) => onChange({ userId: e.target.value })} placeholder="Test the connection to pick from a list" />
            )}
          </Field>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={onTest} disabled={!canTest || test === 'pending'}>
          {test === 'pending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          Test connection
        </button>
        {test && test !== 'pending' && (
          <span className={`inline-flex items-center gap-1.5 text-xs ${test.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {test.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {test.ok ? `Connected to ${test.name}${test.version ? ` (${test.version})` : ''}` : test.error}
          </span>
        )}
        {!test && !filled && <span className="text-xs text-fog-700">Leave blank to skip</span>}
      </div>
    </div>
  );
}

function PeopleStep({
  state,
  onChange,
  notify,
  draft,
}: {
  state: PeopleState | null;
  onChange: (s: PeopleState) => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
  draft: Draft;
}) {
  const [busy, setBusy] = useState(false);

  const apply = async (patch: Parameters<typeof api.savePeople>[0]) => {
    setBusy(true);
    try {
      onChange(await api.savePeople(patch));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  const signOutEveryone = async () => {
    setBusy(true);
    try {
      const { token } = await api.signOutEveryone();
      adminToken.set(token);
      notify('Everyone has been signed out');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not sign everyone out', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-fog-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading people…
      </p>
    );
  }

  const toggleAdmin = (key: string, on: boolean) => {
    const admins = state.people.filter((p) => (p.key === key ? on : p.listed)).map((p) => p.key);
    apply({ admins });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-bold">Who can sign in</h3>
        <p className="mt-1 text-sm text-fog-500">
          Let people sign in with the accounts they already have. Everyone still sees the dashboard without signing in — signing in shows them their own name, and admins see who is watching.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Toggle
          checked={state.signIn.plex}
          disabled={busy || !draft.plex.url}
          onChange={(v) => apply({ signIn: { plex: v } })}
          title="Sign in with Plex"
          hint={draft.plex.url ? 'Opens plex.tv. Only accounts you have shared this server with can sign in. The server owner becomes an admin.' : 'Add your Plex server first.'}
        />
        <Toggle
          checked={state.signIn.jellyfin}
          disabled={busy || !draft.jellyfin.url}
          onChange={(v) => apply({ signIn: { jellyfin: v } })}
          title="Sign in with Jellyfin"
          hint={draft.jellyfin.url ? 'Username and password go straight to your Jellyfin server. Jellyfin administrators become admins.' : 'Add your Jellyfin server first.'}
        />
        <Toggle
          checked={state.autoAdmin}
          disabled={busy}
          onChange={(v) => apply({ autoAdmin: v })}
          title="Trust the provider’s admins"
          hint="The Plex server owner and Jellyfin administrators become Cuesheet admins automatically. Turn off to grant admin only from the list below."
        />
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Admins</p>
            <p className="text-xs text-fog-500">Tick anyone who should see everything and change settings. People appear here after they sign in once.</p>
          </div>
          {state.people.length > 0 && (
            <button type="button" className="btn-quiet !py-1.5 text-xs" onClick={signOutEveryone} disabled={busy}>
              <LogOut className="h-3.5 w-3.5" /> Sign everyone out
            </button>
          )}
        </div>
        {state.people.length === 0 ? (
          <Empty>Nobody has signed in yet.</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {state.people.map((p) => (
              <li key={p.key} className="flex items-center gap-3 p-3">
                <Avatar name={p.name} src={p.avatar} className="h-9 w-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.name}
                    {p.admin && (
                      <span className="chip ml-2 bg-accent-500/15 text-accent-300">
                        <ShieldCheck className="h-2.5 w-2.5" /> Admin
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-fog-500">
                    {p.provider === 'plex' ? 'Plex' : p.provider === 'jellyfin' ? 'Jellyfin' : p.provider}
                    {p.providerAdmin ? ` · ${p.provider === 'plex' ? 'server owner' : 'administrator'}` : ''}
                    {p.lastSeen ? ` · ${timeAgo(p.lastSeen)}` : ''}
                  </p>
                </div>
                {p.providerAdmin && state.autoAdmin && !p.listed ? (
                  <span className="text-[11px] text-fog-500" title="Admin because you trust the provider’s admins">
                    automatic
                  </span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-fog-300">
                    <input type="checkbox" className="accent-accent-500" checked={p.listed} disabled={busy} onChange={(e) => toggleAdmin(p.key, e.target.checked)} />
                    Admin
                  </label>
                )}
                <button
                  type="button"
                  className="rounded-md p-1.5 text-fog-500 hover:bg-white/5 hover:text-rose-300"
                  title={`Forget ${p.name}`}
                  disabled={busy}
                  onClick={() => apply({ forget: p.key })}
                >
                  <UserX className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, title, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border border-line bg-night-700/60 p-4 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5 accent-accent-500" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-fog-500">{hint}</span>
      </span>
    </label>
  );
}
