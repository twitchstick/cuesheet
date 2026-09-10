import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './config.js';

const FILE = path.join(DATA_DIR, 'notifications.json');
const MAX_HISTORY = 100;

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      observations: parsed?.observations && typeof parsed.observations === 'object' ? parsed.observations : {},
      incidents: parsed?.incidents && typeof parsed.incidents === 'object' ? parsed.incidents : {},
      history: Array.isArray(parsed?.history) ? parsed.history.slice(0, MAX_HISTORY) : [],
    };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Could not read ${FILE}: ${err.message}`);
    return { observations: {}, incidents: {}, history: [] };
  }
}

let state = load();

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...state }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

export function snapshot() {
  const active = Object.values(state.incidents).filter((item) => item.status === 'active');
  return { active, history: state.history, unread: state.history.filter((item) => !item.read).length };
}

export function observation(key) {
  return state.observations[key] ?? null;
}

export function setObservation(key, value) {
  state.observations[key] = value;
}

export function removeObservationsExcept(keys, checkedSources = null) {
  const keep = new Set(keys);
  for (const key of Object.keys(state.observations)) {
    if (!key.startsWith('queue:') || keep.has(key)) continue;
    const source = key.split(':')[1];
    if (!checkedSources || checkedSources.has(source)) delete state.observations[key];
  }
}

export function activeIncident(key) {
  return state.incidents[key]?.status === 'active' ? state.incidents[key] : null;
}

export function openIncident(event) {
  if (activeIncident(event.key)) return null;
  const item = { id: crypto.randomUUID(), status: 'active', openedAt: Date.now(), ...event };
  state.incidents[event.key] = item;
  state.history.unshift({ ...item, read: false });
  state.history = state.history.slice(0, MAX_HISTORY);
  persist();
  return item;
}

export function resolveIncident(key, message) {
  const current = activeIncident(key);
  if (!current) return null;
  const resolvedAt = Date.now();
  state.incidents[key] = { ...current, status: 'resolved', resolvedAt };
  const item = {
    ...current,
    id: crypto.randomUUID(),
    status: 'resolved',
    kind: 'recovered',
    title: `${current.title} recovered`,
    message,
    openedAt: resolvedAt,
    resolvedAt,
    read: false,
  };
  state.history.unshift(item);
  state.history = state.history.slice(0, MAX_HISTORY);
  persist();
  return item;
}

export function markAllRead() {
  state.history = state.history.map((item) => ({ ...item, read: true }));
  persist();
  return snapshot();
}

export function flush() {
  persist();
}

/** Test-only reset without importing a fresh process. */
export function resetForTest(next = { observations: {}, incidents: {}, history: [] }) {
  state = structuredClone(next);
}
