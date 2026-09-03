import type { AppConfig, CalendarItem, Errors, MediaDetail, MediaRequest, RecentItem, Settings, SetupStatus, Stream, TestResult } from './types';

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
  requests: () => get<{ items: MediaRequest[] }>('/api/requests'),
  setupStatus: () => get<SetupStatus>('/api/setup/status'),
  settings: () => get<Settings>('/api/settings'),
  saveSettings: (patch: unknown) => get<{ settings: Settings; config: AppConfig }>('/api/settings', json('PUT', patch)),
  testConnection: (body: { service: string; url: string; token?: string; apiKey?: string }) => get<TestResult>('/api/settings/test', json('POST', body)),
};
