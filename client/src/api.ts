import type { AppConfig, AuthStatus, CalendarItem, DownloadClientStats, DownloadItem, Errors, HistoryEvent, LifecycleItem, MediaDetail, MediaRequest, QuickLink, RecentItem, Settings, SetupStatus, Stream, TestResult } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  config: () => get<AppConfig>('/api/config'),
  streams: () => get<{ items: Stream[]; errors: Errors }>('/api/streams'),
  recent: () => get<{ items: RecentItem[]; errors: Errors }>('/api/recent'),
  calendar: (start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString();
    return get<{ start: string; end: string; today: string; items: CalendarItem[]; errors: Errors }>(`/api/calendar${qs ? `?${qs}` : ''}`);
  },
  details: (id: string) => get<MediaDetail>(`/api/details?id=${encodeURIComponent(id)}`),
  queue: () => get<{ items: DownloadItem[]; errors: Errors; client: DownloadClientStats | null }>('/api/queue'),
  links: () => get<{ items: QuickLink[] }>('/api/links'),
  saveLinks: (items: QuickLink[]) => get<{ items: QuickLink[] }>('/api/links', json('PUT', { items })),
  requests: () => get<{ items: MediaRequest[] }>('/api/requests'),
  lifecycle: () => get<{ items: LifecycleItem[] }>('/api/lifecycle'),
  // Fetched behind a click, not on every poll -- see server/routes/dashboard.js.
  lifecycleHistory: (item: Pick<LifecycleItem, 'mediaType' | 'tmdbId' | 'tvdbId'>) => {
    const params = new URLSearchParams({ mediaType: item.mediaType });
    const id = item.mediaType === 'movie' ? item.tmdbId : item.tvdbId;
    if (id != null) params.set(item.mediaType === 'movie' ? 'tmdbId' : 'tvdbId', String(id));
    return get<{ items: HistoryEvent[] }>(`/api/lifecycle/history?${params}`);
  },
  setupStatus: () => get<SetupStatus>('/api/setup/status'),
  settings: () => get<Settings>('/api/settings'),
  saveSettings: (patch: unknown) => get<{ settings: Settings; config: AppConfig }>('/api/settings', json('PUT', patch)),
  testConnection: (body: { service: string; url: string; token?: string; apiKey?: string }) => get<TestResult>('/api/settings/test', json('POST', body)),
  authStatus: () => get<AuthStatus>('/api/auth/status'),
  login: (password: string) => get<{ ok: true }>('/api/auth/login', json('POST', { password })),
  logout: () => get<{ ok: true }>('/api/auth/logout', json('POST', {})),
  changePassword: (body: { currentPassword?: string; newPassword: string }) => get<{ enabled: boolean }>('/api/auth/password', json('PUT', body)),
};
