import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import RecentlyAdded from './components/RecentlyAdded';
import DownloadQueue from './components/DownloadQueue';
import QuickLinks from './components/QuickLinks';
import SetupWizard from './components/SetupWizard';
import Requests from './components/Requests';
import Sidebar, { MobileNav, ServicesCard } from './components/Sidebar';
import StreamGrid from './components/StreamGrid';
import Toasts, { type ToastMessage } from './components/Toast';
import TopBar, { MobileGreeting } from './components/TopBar';
import LoginScreen from './components/LoginScreen';
import MonthCalendar from './components/MonthCalendar';
import WeekCalendar from './components/WeekCalendar';
import MediaDetailPanel from './components/MediaDetailPanel';
import StreamDetailPanel from './components/StreamDetailPanel';
import { useDashboardData } from './hooks/useDashboardData';
import { useAuth } from './hooks/useAuth';
import { greeting } from './lib/format';
import type { AppConfig, CalendarItem, LifecycleItem, RecentItem, Stream, View } from './types';

/** What the detail panel is showing. A stream is held by id so it stays live. */
type Selection =
  | { kind: 'stream'; id: string }
  | { kind: 'media'; id: string; title: string; subtitle: string; poster: string | null; type: string };

// Now Playing leads the overview, so there is no separate streams route; an
// old #streams link falls through to the overview.
const VIEWS: View[] = ['overview', 'recent', 'calendar', 'queue', 'requests', 'setup'];
const viewFromHash = (): View => {
  const v = window.location.hash.replace(/^#\/?/, '') as View;
  return VIEWS.includes(v) ? v : 'overview';
};

export default function App() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [view, setView] = useState<View>(viewFromHash);
  // What the detail panel is showing: a live session, or a library/calendar item.
  const [selected, setSelected] = useState<Selection | null>(null);

  const d = useDashboardData(view);
  const auth = useAuth();

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A first-load nudge, not a redirect that follows you around: this only
  // ever fires once, since d.setup only ever moves from unset to a real
  // value once (and again to needsSetup: false after a save, which trips
  // this same effect but no longer meets the condition below).
  useEffect(() => {
    if (d.setup?.needsSetup && viewFromHash() === 'overview') setView('setup');
  }, [d.setup]);

  useEffect(() => {
    if (d.config?.title) document.title = d.config.title;
  }, [d.config?.title]);

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

  const onSettingsSaved = (next: AppConfig) => {
    d.setConfig(next);
    d.setSetup((s) => (s ? { ...s, needsSetup: false } : s));
    d.streams.refresh();
    d.recent.refresh();
    d.calendar.refresh();
    d.monthCalendar.refresh();
    d.requests.refresh();
    navigate('overview');
  };

  const handleLogin = async (password: string) => {
    await auth.login(password);
    // Every one of these read as a 401 while locked out (useDashboardData's
    // polls don't know about auth, only the server does) -- refresh them
    // for real now instead of waiting on whatever each poll's own interval
    // happens to schedule next, which for links is as long as 30 minutes.
    d.streams.refresh();
    d.recent.refresh();
    d.calendar.refresh();
    d.monthCalendar.refresh();
    d.queue.refresh();
    d.requests.refresh();
    d.links.refresh();
  };

  const handleLogout = () => {
    auth.logout();
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
  const openQueueItem = useCallback((item: LifecycleItem) => {
    // Every trace shown on Downloads is currently in the queue, so it always
    // has one -- Requests' non-downloading rows just don't pass onSelect at all.
    if (!item.queueId) return;
    setSelected({ kind: 'media', id: item.queueId, title: item.title, subtitle: item.subtitle ?? '', poster: item.poster, type: item.mediaType === 'tv' ? 'episode' : 'movie' });
  }, []);
  const closePanel = useCallback(() => setSelected(null), []);

  // The session is looked up fresh each render so the panel keeps ticking with
  // the poll, and closes itself if the stream stops while it is open.
  const openStreamData = selected?.kind === 'stream' ? (d.streams.data?.items ?? []).find((s) => s.id === selected.id) : undefined;
  useEffect(() => {
    if (selected?.kind === 'stream' && d.streams.data && !openStreamData) setSelected(null);
  }, [selected, d.streams.data, openStreamData]);

  const title = d.config?.title ?? 'Cuesheet';
  const hello = greeting(d.config?.userName ?? '', d.now);
  const serverName = d.config?.serverName ?? '';

  const streamErrors = d.streams.data?.errors ?? (d.streams.error ? { server: d.streams.error } : null);
  const queueErrors = d.queue.data?.errors ?? (d.queue.error ? { server: d.queue.error } : null);
  const weekView = d.hasCalendar && (
    <WeekCalendar
      start={d.weekStart}
      today={d.calendar.data?.today ?? d.today}
      items={d.calendar.data?.items ?? null}
      errors={d.calendar.data?.errors ?? null}
      loading={d.calendar.loading}
      onShift={(days) => d.setWeekOffset((o) => (days === 0 ? 0 : o + days))}
      onSelect={openCalendar}
    />
  );
  const monthView = d.hasCalendar && (
    <MonthCalendar
      month={d.month}
      today={d.monthCalendar.data?.today ?? d.today}
      items={d.monthCalendar.data?.items ?? null}
      errors={d.monthCalendar.data?.errors ?? null}
      loading={d.monthCalendar.loading}
      onMonth={d.setMonth}
      onSelect={openCalendar}
    />
  );
  const requestsView = (full: boolean) =>
    d.hasSeerr && (
      <Requests
        requests={d.requests.data?.items ?? null}
        requestsError={d.requests.error}
        seerrUrl={d.config?.seerrUrl ?? ''}
        full={full}
        onOpen={() => navigate('requests')}
        updatedAt={d.requests.updatedAt}
      />
    );

  // The whole-app gate: nothing below this renders until the auth check
  // resolves, and a failed check is treated as "unknown," never as
  // "must be open" -- the one place in this component where erring toward
  // showing less, not more, is the correct default.
  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-fog-500" />
      </div>
    );
  }
  if (!auth.status) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-rose-300">
        Couldn’t reach {d.config?.title ?? 'Cuesheet'}{auth.error ? `: ${auth.error}` : ''}.
      </div>
    );
  }
  const authStatus = auth.status;
  if (authStatus.enabled && !authStatus.authenticated) {
    return <LoginScreen title={d.config?.title ?? 'Cuesheet'} serverName={d.config?.serverName ?? ''} onLogin={handleLogin} />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar title={title} view={view} available={d.available} onNavigate={navigate} services={d.health} />

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <TopBar title={title} serverName={serverName} greeting={hello} onLogout={authStatus.enabled ? handleLogout : undefined} />
        <MobileNav view={view} available={d.available} onNavigate={navigate} />
        {view === 'overview' && <MobileGreeting serverName={serverName} greeting={hello} />}

        {d.configError && <div className="card mb-6 p-4 text-sm text-rose-300">Couldn’t load configuration: {d.configError}</div>}

        {d.nothingConfigured && view !== 'setup' && (
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
              <QuickLinks items={d.links.data?.items ?? null} loading={d.links.loading} onChange={d.links.refresh} notify={notify} />
              {d.hasMediaServer && <StreamGrid streams={d.streams.data?.items ?? null} errors={streamErrors} loading={d.streams.loading} onSelect={openStream} />}
              {d.hasMediaServer && (
                <RecentlyAdded items={d.recent.data?.items ?? null} errors={d.recent.data?.errors ?? null} loading={d.recent.loading} limit={d.config?.recentLimit ?? 15} onSelect={openRecent} />
              )}
              {/* Release calendar, download queue and requests are all "check when
                  curious" rather than "glance right now" -- and each already has its
                  own full tab -- so on a phone, where they stack into a long scroll
                  instead of a compact grid, they stay tab-only. */}
              {d.hasCalendar && <div className="hidden md:block">{weekView}</div>}
              {d.hasQueue && (
                <div className="hidden md:block">
                  <DownloadQueue
                    items={d.requests.data ? d.downloadItems : null}
                    errors={queueErrors}
                    loading={d.requests.loading}
                    client={d.queue.data?.client ?? null}
                    onSelect={openQueueItem}
                    updatedAt={d.requests.updatedAt}
                  />
                </div>
              )}
              {d.hasSeerr && <div className="hidden md:block">{requestsView(false)}</div>}
            </>
          )}
          {view === 'recent' && d.hasMediaServer && (
            <RecentlyAdded items={d.recent.data?.items ?? null} errors={d.recent.data?.errors ?? null} loading={d.recent.loading} full onSelect={openRecent} />
          )}
          {view === 'calendar' && monthView}
          {view === 'queue' && d.hasQueue && (
            <DownloadQueue
              items={d.requests.data ? d.downloadItems : null}
              errors={queueErrors}
              loading={d.requests.loading}
              client={d.queue.data?.client ?? null}
              full
              onSelect={openQueueItem}
              updatedAt={d.requests.updatedAt}
            />
          )}
          {view === 'requests' && requestsView(true)}
          {view === 'setup' && (
            <SetupWizard firstRun={Boolean(d.setup?.needsSetup)} auth={authStatus} onAuthChanged={auth.refresh} onSaved={onSettingsSaved} onCancel={() => navigate('overview')} notify={notify} />
          )}
          {view !== 'overview' && !d.available.has(view) && <div className="card p-6 text-sm text-fog-500">That section isn’t enabled. Configure the matching service to turn it on.</div>}
        </div>

        <div className="mt-8 lg:hidden">
          <ServicesCard services={d.health} />
        </div>

        <footer className="mt-10 text-center text-[11px] text-fog-500">
          {title}
          {d.streams.updatedAt ? ` · updated ${new Date(d.streams.updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
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
