import type { AppConfig, CalendarItem, Errors, MediaDetails, MediaRequest, MediaResult, RecentItem, Settings, SetupStatus, Stream, TestResult } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const ADMIN_KEY = 'cuesheet-admin';
export const adminPassword = {
  get: (): string => {
    try {
      return sessionStorage.getItem(ADMIN_KEY) ?? '';
    } catch {
      return '';
    }
  },
  set: (value: string) => {
    try {
      if (value) sessionStorage.setItem(ADMIN_KEY, value);
      else sessionStorage.removeItem(ADMIN_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const auth = adminPassword.get();
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(init?.headers ?? {}) },
  });
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
  requests: () => get<{ items: MediaRequest[] }>('/api/requests'),
  trending: () => get<{ items: MediaResult[] }>('/api/trending'),
  search: (q: string, signal?: AbortSignal) => get<{ items: MediaResult[] }>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),
  media: (type: 'movie' | 'tv', tmdbId: number) => get<MediaDetails>(`/api/media/${type}/${tmdbId}`),
  request: (body: { mediaType: 'movie' | 'tv'; tmdbId: number; seasons?: number[] }) =>
    get<{ id: number | null; requestStatus: string }>('/api/request', json('POST', body)),
  setupStatus: () => get<SetupStatus>('/api/setup/status'),
  settings: () => get<Settings>('/api/settings'),
  saveSettings: (patch: unknown) => get<{ settings: Settings; config: AppConfig }>('/api/settings', json('PUT', patch)),
  testConnection: (body: { service: string; url: string; token?: string; apiKey?: string }) => get<TestResult>('/api/settings/test', json('POST', body)),
};
