import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import RecentlyAdded from './components/RecentlyAdded';
import SetupWizard from './components/SetupWizard';
import Requests from './components/Requests';
import Sidebar, { MobileNav, ServicesCard, type ServiceHealth } from './components/Sidebar';
import StreamGrid from './components/StreamGrid';
import Toasts, { type ToastMessage } from './components/Toast';
import TopBar, { MobileGreeting } from './components/TopBar';
import MonthCalendar, { gridFor } from './components/MonthCalendar';
import WeekCalendar from './components/WeekCalendar';
import MediaDetailPanel from './components/MediaDetailPanel';
import StreamDetailPanel from './components/StreamDetailPanel';
import { usePoll } from './hooks/usePoll';
import { addDays, greeting, mondayOf, toIsoDate } from './lib/format';
import type { AppConfig, CalendarItem, RecentItem, SetupStatus, Stream, View } from './types';

/** What the detail panel is showing. A stream is held by id so it stays live. */
type Selection =
  | { kind: 'stream'; id: string }
  | { kind: 'media'; id: string; title: string; subtitle: string; poster: string | null; type: string };

// Now Playing leads the overview, so there is no separate streams route; an
// old #streams link falls through to the overview.
const VIEWS: View[] = ['overview', 'recent', 'calendar', 'requests', 'setup'];
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
  // What the detail panel is showing: a live session, or a library/calendar item.
  const [selected, setSelected] = useState<Selection | null>(null);

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
  // The overview shows the week ahead; the calendar tab shows a whole month.
  const weekStart = useMemo(() => addDays(mondayOf(today), weekOffset), [today, weekOffset]);
  const calendarFetcher = useCallback(() => api.calendar(weekStart, addDays(weekStart, 6)), [weekStart]);
  const calendar = usePoll(calendarFetcher, 15 * 60_000, hasCalendar && view !== 'calendar');

  const [month, setMonth] = useState(today);
  // Fetch the whole visible grid, not just the month, so the leading and
  // trailing days from the neighbouring months carry their releases too.
  const monthFetcher = useCallback(() => {
    const days = gridFor(month);
    return api.calendar(days[0], days[days.length - 1]);
  }, [month]);
  const monthCalendar = usePoll(monthFetcher, 15 * 60_000, hasCalendar && view === 'calendar');

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
    if (hasMediaServer) set.add('recent');
    if (hasCalendar) set.add('calendar');
    if (hasSeerr) set.add('requests');
    return set;
  }, [hasMediaServer, hasCalendar, hasSeerr]);


  const nothingConfigured = config && !hasMediaServer && !hasCalendar && !hasSeerr && view !== 'setup';
  const onSettingsSaved = (next: AppConfig) => {
    setConfig(next);
    setSetup((s) => (s ? { ...s, needsSetup: false } : s));
    streams.refresh();
    recent.refresh();
    calendar.refresh();
    monthCalendar.refresh();
    requests.refresh();
    navigate('overview');
  };
  const openStream = useCallback((stream: Stream) => setSelected({ kind: 'stream', id: stream.id }), []);
  const openRecent = useCallback(
    (item: RecentItem) => setSelected({ kind: 'media', id: item.id, title: item.title, subtitle: item.subtitle, poster: item.poster, type: item.type }),
    [],
  );
  const openCalendar = useCallback(
    (item: CalendarItem) => setSelected({ kind: 'media', id: item.id, title: item.title, subtitle: item.subtitle, poster: item.poster, type: item.type }),
    [],
  );
  const closePanel = useCallback(() => setSelected(null), []);

  // The session is looked up fresh each render so the panel keeps ticking with
  // the poll, and closes itself if the stream stops while it is open.
  const openStreamData = selected?.kind === 'stream' ? (streams.data?.items ?? []).find((s) => s.id === selected.id) : undefined;
  useEffect(() => {
    if (selected?.kind === 'stream' && streams.data && !openStreamData) setSelected(null);
  }, [selected, streams.data, openStreamData]);

  const title = config?.title ?? 'Cuesheet';
  const hello = greeting(config?.userName ?? '', now);
  const serverName = config?.serverName ?? '';

  const streamErrors = streams.data?.errors ?? (streams.error ? { server: streams.error } : null);
  const weekView = hasCalendar && (
    <WeekCalendar start={weekStart} today={calendar.data?.today ?? today} items={calendar.data?.items ?? null} errors={calendar.data?.errors ?? null} loading={calendar.loading} onShift={(days) => setWeekOffset((o) => (days === 0 ? 0 : o + days))} onSelect={openCalendar} />
  );
  const monthView = hasCalendar && (
    <MonthCalendar month={month} today={monthCalendar.data?.today ?? today} items={monthCalendar.data?.items ?? null} errors={monthCalendar.data?.errors ?? null} loading={monthCalendar.loading} onMonth={setMonth} onSelect={openCalendar} />
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
              {hasMediaServer && <StreamGrid streams={streams.data?.items ?? null} errors={streamErrors} loading={streams.loading} onSelect={openStream} />}
              {hasMediaServer && <RecentlyAdded items={recent.data?.items ?? null} errors={recent.data?.errors ?? null} loading={recent.loading} limit={config?.recentLimit ?? 15} onSelect={openRecent} />}
              {weekView}
              {requestsView(false)}
            </>
          )}
          {view === 'recent' && hasMediaServer && <RecentlyAdded items={recent.data?.items ?? null} errors={recent.data?.errors ?? null} loading={recent.loading} full onSelect={openRecent} />}
          {view === 'calendar' && monthView}
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

      {openStreamData && <StreamDetailPanel stream={openStreamData} onClose={closePanel} />}
      {selected?.kind === 'media' && (
        <MediaDetailPanel
          id={selected.id}
          fallback={{ title: selected.title, subtitle: selected.subtitle, poster: selected.poster, type: selected.type }}
          onClose={closePanel}
        />
      )}

      <Toasts items={toasts} />
    </div>
  );
}
