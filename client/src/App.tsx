import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import HeroStream from './components/HeroStream';
import RecentlyAdded from './components/RecentlyAdded';
import SetupWizard from './components/SetupWizard';
import Requests from './components/Requests';
import Sidebar, { MobileNav, ServicesCard, type ServiceHealth } from './components/Sidebar';
import StreamGrid from './components/StreamGrid';
import StreamsPanel from './components/StreamsPanel';
import Toasts, { type ToastMessage } from './components/Toast';
import TopBar, { MobileGreeting } from './components/TopBar';
import WeekCalendar from './components/WeekCalendar';
import { usePoll } from './hooks/usePoll';
import { addDays, greeting, mondayOf, toIsoDate } from './lib/format';
import type { AppConfig, SetupStatus, View } from './types';

const VIEWS: View[] = ['overview', 'streams', 'recent', 'calendar', 'requests', 'setup'];
const viewFromHash = (): View => {
  const v = window.location.hash.replace(/^#\/?/, '') as View;
  return VIEWS.includes(v) ? v : 'overview';
};

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [view, setView] = useState<View>(viewFromHash);
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [setup, setSetup] = useState<SetupStatus | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch((err) => setConfigError(err.message));
    api
      .setupStatus()
      .then((s) => {
        setSetup(s);
        if (s.needsSetup && viewFromHash() === 'overview') setView('setup');
      })
      .catch(() => setSetup(null));
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    if (config?.title) document.title = config.title;
  }, [config?.title]);

  const navigate = useCallback((v: View) => {
    window.location.hash = v === 'overview' ? '' : `/${v}`;
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const notify = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const services = config?.services;
  const hasMediaServer = Boolean(services?.plex || services?.jellyfin);
  const hasCalendar = Boolean(services?.radarr || services?.sonarr);
  const hasSeerr = Boolean(services?.seerr);

  const streams = usePoll(api.streams, Math.max(5, config?.refreshSeconds ?? 15) * 1000, hasMediaServer);
  const recent = usePoll(api.recent, 5 * 60_000, hasMediaServer);

  const today = toIsoDate(now);
  const weekStart = useMemo(() => addDays(mondayOf(today), weekOffset), [today, weekOffset]);
  const calendarFetcher = useCallback(() => api.calendar(weekStart, addDays(weekStart, 6)), [weekStart]);
  const calendar = usePoll(calendarFetcher, 15 * 60_000, hasCalendar);

  const requests = usePoll(api.requests, 60_000, hasSeerr);

  // Sidebar service health: green when the last call succeeded, amber when it errored.
  const health = useMemo<ServiceHealth[]>(() => {
    if (!services) return [];
    const list: ServiceHealth[] = [];
    for (const name of ['plex', 'jellyfin'] as const) {
      if (!services[name]) continue;
      const err = streams.data?.errors?.[name] ?? recent.data?.errors?.[name];
      list.push({ name, ok: streams.data || recent.data ? !err : undefined });
    }
    for (const name of ['radarr', 'sonarr'] as const) {
      if (!services[name]) continue;
      list.push({ name, ok: calendar.data ? !calendar.data.errors?.[name] : undefined });
    }
    if (services.seerr) list.push({ name: 'seerr', ok: requests.data ? true : requests.error ? false : undefined });
    return list;
  }, [services, streams.data, recent.data, calendar.data, requests.data, requests.error]);

  const available = useMemo(() => {
    const set = new Set<View>(['overview', 'setup']);
    if (hasMediaServer) {
      set.add('streams');
      set.add('recent');
    }
    if (hasCalendar) set.add('calendar');
    if (hasSeerr) set.add('requests');
    return set;
  }, [hasMediaServer, hasCalendar, hasSeerr]);

  const activeStreams = streams.data?.items ?? [];
  const featured = useMemo(() => activeStreams.find((s) => s.state === 'playing') ?? activeStreams[0] ?? null, [activeStreams]);
  const sources = (['plex', 'jellyfin'] as const).filter((s) => services?.[s]);

  const nothingConfigured = config && !hasMediaServer && !hasCalendar && !hasSeerr && view !== 'setup';
  const onSettingsSaved = (next: AppConfig) => {
    setConfig(next);
    setSetup((s) => (s ? { ...s, needsSetup: false } : s));
    streams.refresh();
    recent.refresh();
    calendar.refresh();
    requests.refresh();
    navigate('overview');
  };
  const title = config?.title ?? 'Cuesheet';
  const hello = greeting(config?.userName ?? '', now);
  const serverName = config?.serverName ?? '';

  const streamErrors = streams.data?.errors ?? (streams.error ? { server: streams.error } : null);
  const calendarView = hasCalendar && (
    <WeekCalendar start={weekStart} today={calendar.data?.today ?? today} items={calendar.data?.items ?? null} errors={calendar.data?.errors ?? null} loading={calendar.loading} onShift={(days) => setWeekOffset((o) => (days === 0 ? 0 : o + days))} />
  );
  const requestsView = (full: boolean) =>
    hasSeerr && <Requests requests={requests.data?.items ?? null} requestsError={requests.error} seerrUrl={config?.seerrUrl ?? ''} full={full} />;

  return (
    <div className="flex min-h-screen">
      <Sidebar title={title} view={view} available={available} onNavigate={navigate} services={health} />

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <TopBar title={title} serverName={serverName} greeting={hello} seerrUrl={config?.seerrUrl ?? ''} />
        <MobileNav view={view} available={available} onNavigate={navigate} />
        {view === 'overview' && <MobileGreeting serverName={serverName} greeting={hello} />}

        {configError && <div className="card mb-6 p-4 text-sm text-rose-300">Couldn’t load configuration: {configError}</div>}

        {nothingConfigured && (
          <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-6 text-sm text-fog-300">
            <div>
              <p className="mb-1 text-base font-semibold text-fog-100">{title} isn’t connected to anything yet.</p>
              <p>Add your Plex, Jellyfin, Radarr, Sonarr or Seerr details in Settings to bring the dashboard to life.</p>
            </div>
            <button type="button" className="btn-primary" onClick={() => navigate('setup')}>
              Open setup
            </button>
          </div>
        )}

        <div className="flex flex-col gap-10">
          {view === 'overview' && (
            <>
              {hasMediaServer && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                  <HeroStream stream={featured} loading={streams.loading && !streams.data} />
                  <StreamsPanel streams={activeStreams} featuredId={featured?.id ?? null} sources={sources} onViewAll={() => navigate('streams')} />
                </div>
              )}
              {hasMediaServer && <RecentlyAdded items={recent.data?.items ?? null} errors={recent.data?.errors ?? null} loading={recent.loading} limit={config?.recentLimit ?? 15} />}
              {calendarView}
              {requestsView(false)}
            </>
          )}
          {view === 'streams' && hasMediaServer && <StreamGrid streams={streams.data?.items ?? null} errors={streamErrors} loading={streams.loading} />}
          {view === 'recent' && hasMediaServer && <RecentlyAdded items={recent.data?.items ?? null} errors={recent.data?.errors ?? null} loading={recent.loading} full />}
          {view === 'calendar' && calendarView}
          {view === 'requests' && requestsView(true)}
          {view === 'setup' && <SetupWizard firstRun={Boolean(setup?.needsSetup)} onSaved={onSettingsSaved} onCancel={() => navigate('overview')} notify={notify} />}
          {view !== 'overview' && !available.has(view) && <div className="card p-6 text-sm text-fog-500">That section isn’t enabled. Configure the matching service to turn it on.</div>}
        </div>

        <div className="mt-8 lg:hidden">
          <ServicesCard services={health} />
        </div>

        <footer className="mt-10 text-center text-[11px] text-fog-700">
          {title}
          {streams.updatedAt ? ` · updated ${new Date(streams.updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
        </footer>
      </main>

      <Toasts items={toasts} />
    </div>
  );
}
