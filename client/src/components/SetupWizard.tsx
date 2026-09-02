import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, Loader2, Plug, Trash2, XCircle } from 'lucide-react';
import { api } from '../api';
import type { AppConfig, ServiceName, Settings, TestResult } from '../types';

interface Props {
  firstRun: boolean;
  onSaved: (config: AppConfig) => void;
  onCancel: () => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}

type ServiceDraft = { url: string; secret: string; secretSet: boolean; userId: string };
type Draft = { general: Settings['general'] } & Record<ServiceName, ServiceDraft>;

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
  { id: 'review', title: 'Review', caption: 'Check and save', services: [] },
];

const fromSettings = (s: Settings): Draft => ({
  general: { ...s.general },
  plex: { url: s.plex.url, secret: '', secretSet: Boolean(s.plex.tokenSet), userId: '' },
  jellyfin: { url: s.jellyfin.url, secret: '', secretSet: Boolean(s.jellyfin.apiKeySet), userId: s.jellyfin.userId ?? '' },
  radarr: { url: s.radarr.url, secret: '', secretSet: Boolean(s.radarr.apiKeySet), userId: '' },
  sonarr: { url: s.sonarr.url, secret: '', secretSet: Boolean(s.sonarr.apiKeySet), userId: '' },
  seerr: { url: s.seerr.url, secret: '', secretSet: Boolean(s.seerr.apiKeySet), userId: s.seerr.userId ?? '' },
});

const secretField = (s: ServiceName) => (s === 'plex' ? 'token' : 'apiKey');
const isFilled = (d: ServiceDraft) => Boolean(d.url.trim() && (d.secret.trim() || d.secretSet));

export default function SetupWizard({ firstRun, onSaved, onCancel, notify }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [tests, setTests] = useState<Partial<Record<ServiceName, TestResult | 'pending'>>>({});
  const [users, setUsers] = useState<Partial<Record<ServiceName, { id: string; name: string }[]>>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      setDraft(fromSettings(await api.settings()));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load settings');
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const patch: Record<string, unknown> = { general: { ...draft.general } };
      for (const s of Object.keys(SERVICE_META) as ServiceName[]) {
        const d = draft[s];
        const entry: Record<string, unknown> = { url: d.url.trim() };
        if (d.secret.trim()) entry[secretField(s)] = d.secret.trim();
        else if (!d.url.trim()) entry[secretField(s)] = '';
        if (s === 'jellyfin' || s === 'seerr') entry.userId = d.userId;
        patch[s] = entry;
      }
      const { config } = await api.saveSettings(patch);
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
    <Shell firstRun={firstRun} onCancel={onCancel}>
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

function Shell({ firstRun, onCancel, children }: { firstRun: boolean; onCancel: () => void; children: React.ReactNode }) {
  return (
    <section className="animate-rise">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{firstRun ? 'Setup' : 'Settings'}</h2>
          <p className="mt-0.5 text-sm text-fog-500">{firstRun ? 'Connect your services to bring the dashboard to life' : 'Connections and names'}</p>
        </div>
        <div className="flex items-center gap-2">
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

