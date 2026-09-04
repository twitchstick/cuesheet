import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { ServiceHealth } from '../components/Sidebar';
import { usePoll } from './usePoll';
import { addDays, toIsoDate, mondayOf } from '../lib/format';
import { gridFor } from '../components/MonthCalendar';
import type { AppConfig, SetupStatus, View } from '../types';

// What needs a look floats to the top of Downloads; within a status, whatever's furthest along.
const DOWNLOAD_PRIORITY: Record<string, number> = { failed: 0, warning: 1, stalled: 2, downloading: 3, importing: 4, queued: 5, paused: 6 };

/**
 * Everything App.tsx needs that comes from the API: config/setup, every
 * polled resource, and the values derived from them (which services are
 * configured, sidebar health, Downloads' sorted item list, whether nothing
 * is configured at all). Kept separate from navigation, the detail-panel
 * selection, and toasts -- those are UI-interaction state, not data --
 * though the two calendar polls need `view` to know which one (week or
 * month) is the one actually on screen, so that comes in as a parameter.
 */
export function useDashboardData(view: View) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    api.config().then(setConfig).catch((err) => setConfigError(err.message));
    api.setupStatus().then(setSetup).catch(() => setSetup(null));
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const services = config?.services;
  const hasMediaServer = Boolean(services?.plex || services?.jellyfin);
  const hasCalendar = Boolean(services?.radarr || services?.sonarr);
  // Same services as the calendar today; kept separate since the two features
  // are conceptually distinct and may not always share that condition.
  const hasQueue = hasCalendar;
  const hasSeerr = Boolean(services?.seerr);

  const streams = usePoll(api.streams, Math.max(5, config?.refreshSeconds ?? 15) * 1000, hasMediaServer);
  const recent = usePoll(api.recent, 5 * 60_000, hasMediaServer);

  const today = toIsoDate(now);
  // The overview shows the week ahead; the calendar tab shows a whole month.
  const [weekOffset, setWeekOffset] = useState(0);
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

  const queue = usePoll(api.queue, 20_000, hasQueue);
  // Requests and Downloads share this one poll -- it carries every
  // Seerr-backed request plus any queue item with no request behind it, and
  // each view filters to what it actually shows.
  const requests = usePoll(api.lifecycle, 60_000, hasQueue || hasSeerr);
  // Rarely changes, so no live polling — the editor refreshes it after a save.
  const links = usePoll(api.links, 30 * 60_000, true);

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
      const err = calendar.data?.errors?.[name] ?? queue.data?.errors?.[name];
      list.push({ name, ok: calendar.data || queue.data ? !err : undefined });
    }
    if (services.seerr) list.push({ name: 'seerr', ok: requests.data ? true : requests.error ? false : undefined });
    if (services.sabnzbd) list.push({ name: 'sabnzbd', ok: queue.data ? !queue.data.errors?.sabnzbd : undefined });
    return list;
  }, [services, streams.data, recent.data, calendar.data, queue.data, requests.data, requests.error]);

  const available = useMemo(() => {
    const set = new Set<View>(['overview', 'setup']);
    if (hasMediaServer) set.add('recent');
    if (hasCalendar) set.add('calendar');
    if (hasQueue) set.add('queue');
    if (hasSeerr) set.add('requests');
    return set;
  }, [hasMediaServer, hasCalendar, hasQueue, hasSeerr]);

  const nothingConfigured = Boolean(config) && !hasMediaServer && !hasCalendar && !hasSeerr;

  // Downloads and Requests read the same poll -- this is just the slice
  // that's actually in the queue right now, worst-off first so a failed or
  // stalled item doesn't get lost among what's quietly moving.
  const downloadItems = useMemo(() => {
    const items = (requests.data?.items ?? []).filter((r) => r.stage === 'downloading' || r.stage === 'importing');
    return [...items].sort((a, b) => (DOWNLOAD_PRIORITY[a.downloadStatus ?? a.stage] ?? 9) - (DOWNLOAD_PRIORITY[b.downloadStatus ?? b.stage] ?? 9));
  }, [requests.data]);

  return {
    config, setConfig, configError, setup, setSetup, now, today,
    hasMediaServer, hasCalendar, hasQueue, hasSeerr,
    streams, recent, calendar, monthCalendar, queue, requests, links,
    weekOffset, setWeekOffset, weekStart, month, setMonth,
    health, available, nothingConfigured, downloadItems,
  };
}
