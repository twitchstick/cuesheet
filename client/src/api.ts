import type { AppConfig, CalendarItem, Errors, MediaDetails, MediaRequest, MediaResult, RecentItem, Settings, SetupStatus, Stream, TestResult } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'cuesheet-admin-token';
/** Admin session token, kept per browser so you stay signed in on your own devices. */
export const adminToken = {
  get: (): string => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  },
  set: (value: string | null) => {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const auth = adminToken.get();
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
  streams: () => get<{ items: Stream[]; errors: Errors; redacted?: boolean }>('/api/streams'),
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
  login: (password: string) => get<{ token: string | null; admin: boolean }>('/api/auth/login', json('POST', { password })),
  settings: () => get<Settings>('/api/settings'),
  saveSettings: (patch: unknown) => get<{ settings: Settings; config: AppConfig; token: string | null }>('/api/settings', json('PUT', patch)),
  testConnection: (body: { service: string; url: string; token?: string; apiKey?: string }) => get<TestResult>('/api/settings/test', json('POST', body)),
};
