import { config } from './config.js';
import * as radarr from './services/radarr.js';
import * as sonarr from './services/sonarr.js';
import { sendPushover } from './services/pushover.js';
import {
  flush,
  observation,
  openIncident,
  removeObservationsExcept,
  resolveIncident,
  setObservation,
  snapshot as storeSnapshot,
} from './notification-store.js';

const adapters = { radarr, sonarr };
const minutes = (value) => value * 60_000;
const incidentKinds = ['failed', 'warning', 'stuck', 'import'];

function baseKey(item) {
  return `queue:${item.source}:${item.downloadId || item.id}`;
}

function incidentKey(item, kind) {
  return `${baseKey(item)}:${kind}`;
}

async function deliver(event, deps) {
  const opened = openIncident(event);
  if (!opened) return null;
  const n = deps.config.notifications;
  if (n.pushoverAppToken && n.pushoverUserKey) {
    try {
      await deps.sendPushover({
        appToken: n.pushoverAppToken,
        userKey: n.pushoverUserKey,
        title: event.title,
        message: event.message,
        priority: 0,
      });
    } catch (err) {
      console.warn(`[notifications] Pushover delivery failed: ${err.message}`);
    }
  }
  return opened;
}

async function recoverItem(item, deps, message = 'The download is moving normally again.') {
  for (const kind of incidentKinds) {
    const recovered = resolveIncident(incidentKey(item, kind), message);
    if (recovered && deps.config.notifications.recovered && deps.config.notifications.pushoverAppToken && deps.config.notifications.pushoverUserKey) {
      try {
        await deps.sendPushover({
          appToken: deps.config.notifications.pushoverAppToken,
          userKey: deps.config.notifications.pushoverUserKey,
          title: recovered.title,
          message: recovered.message,
          priority: -1,
        });
      } catch (err) {
        console.warn(`[notifications] Pushover recovery delivery failed: ${err.message}`);
      }
    }
  }
}

async function inspectQueueItem(item, now, deps) {
  const n = deps.config.notifications;
  const key = baseKey(item);
  const previous = observation(key);
  const progressed = previous && item.sizeLeftBytes < previous.sizeLeftBytes;
  const statusChanged = !previous || previous.status !== item.status;
  const current = {
    source: item.source,
    id: item.id,
    downloadId: item.downloadId,
    title: item.title,
    subtitle: item.subtitle,
    status: item.status,
    sizeLeftBytes: item.sizeLeftBytes,
    seenAt: now,
    progressChangedAt: progressed || !previous ? now : previous.progressChangedAt,
    statusSince: statusChanged ? now : previous.statusSince,
  };
  setObservation(key, current);

  const label = [item.title, item.subtitle].filter(Boolean).join(' · ');
  const source = item.source === 'radarr' ? 'Radarr' : 'Sonarr';
  const open = (kind, title, message) => deliver({ key: incidentKey(item, kind), kind, source: item.source, itemId: item.id, title, message }, deps);

  if (item.status === 'failed' && n.failed) {
    await open('failed', `${source} download failed`, `${label}${item.statusDetail ? `\n${item.statusDetail}` : ''}`);
    return;
  }
  if ((item.status === 'warning' || item.status === 'stalled') && n.warning && now - current.statusSince >= minutes(n.warningMinutes)) {
    await open('warning', `${source} download warning`, `${label}${item.statusDetail ? `\n${item.statusDetail}` : ''}`);
    return;
  }
  if (item.status === 'importing' && n.stuck && now - current.statusSince >= minutes(n.importMinutes)) {
    await open('import', `${source} import may be stuck`, `${label} has been importing for ${n.importMinutes} minutes.`);
    return;
  }
  if (item.status === 'downloading' && n.stuck && item.sizeBytes > 0 && now - current.progressChangedAt >= minutes(n.stuckMinutes)) {
    await open('stuck', `${source} download may be stuck`, `${label} has made no progress for ${n.stuckMinutes} minutes.`);
    return;
  }

  if (progressed || item.status === 'downloading' || item.status === 'queued' || item.status === 'paused') await recoverItem(item, deps);
}

async function inspectHealth(source, checks, now, deps) {
  const seen = new Set();
  for (const check of checks) {
    const normalized = String(check.message ?? 'Health warning').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 120);
    const key = `health:${source}:${normalized}`;
    seen.add(key);
    const firstSeen = observation(key)?.firstSeen ?? now;
    setObservation(key, { firstSeen, seenAt: now });
    if (now - firstSeen >= minutes(deps.config.notifications.warningMinutes)) {
      await deliver({ key, kind: 'health', source, title: `${source === 'radarr' ? 'Radarr' : 'Sonarr'} health warning`, message: check.message }, deps);
    }
  }
  // A previously active warning absent from this healthy response recovered.
  for (const event of Object.values(deps.snapshot().active)) {
    if (event.kind !== 'health' || event.source !== source || seen.has(event.key)) continue;
    const recovered = resolveIncident(event.key, 'The health warning has cleared.');
    if (recovered && deps.config.notifications.recovered) await sendRecovery(recovered, deps);
  }
}

async function sendRecovery(recovered, deps) {
  const n = deps.config.notifications;
  if (!n.pushoverAppToken || !n.pushoverUserKey) return;
  try {
    await deps.sendPushover({ appToken: n.pushoverAppToken, userKey: n.pushoverUserKey, title: recovered.title, message: recovered.message, priority: -1 });
  } catch (err) {
    console.warn(`[notifications] Pushover recovery delivery failed: ${err.message}`);
  }
}

async function inspectOutage(source, error, now, deps) {
  const key = `service:${source}:unreachable`;
  if (!error) {
    const recovered = resolveIncident(key, `${source === 'radarr' ? 'Radarr' : 'Sonarr'} is reachable again.`);
    if (recovered && deps.config.notifications.recovered) await sendRecovery(recovered, deps);
    return;
  }
  const firstSeen = observation(key)?.firstSeen ?? now;
  setObservation(key, { firstSeen, seenAt: now });
  if (now - firstSeen >= minutes(deps.config.notifications.outageMinutes)) {
    await deliver({ key, kind: 'outage', source, title: `${source === 'radarr' ? 'Radarr' : 'Sonarr'} is unreachable`, message: error.message ?? String(error) }, deps);
  }
}

export async function runNotificationCheck(now = Date.now(), overrides = {}) {
  const deps = {
    config,
    adapters,
    sendPushover,
    snapshot: storeSnapshot,
    ...overrides,
  };
  if (!deps.config.notifications.enabled) return { checked: false };

  const presentQueueKeys = [];
  const successfulQueueSources = new Set();
  for (const source of ['radarr', 'sonarr']) {
    if (!deps.config[source].enabled) continue;
    const queueResult = await Promise.allSettled([deps.adapters[source].queue(deps.config[source])]);
    const queueError = queueResult[0].status === 'rejected' ? queueResult[0].reason : null;
    if (deps.config.notifications.health) await inspectOutage(source, queueError, now, deps);
    if (queueError) continue;
    successfulQueueSources.add(source);
    const items = queueResult[0].value;
    for (const item of items) {
      presentQueueKeys.push(baseKey(item));
      await inspectQueueItem(item, now, deps);
    }
    if (deps.config.notifications.health) {
      try {
        await inspectHealth(source, await deps.adapters[source].health(deps.config[source]), now, deps);
      } catch (err) {
        console.warn(`[notifications] ${source} health check failed: ${err.message}`);
      }
    }
  }

  // Queue entries vanish on a successful import. Resolve any incident that
  // belonged to an item no longer present, rather than alerting forever.
  for (const event of deps.snapshot().active) {
    if (!event.key.startsWith('queue:')) continue;
    if (!successfulQueueSources.has(event.source)) continue;
    const eventBase = event.key.split(':').slice(0, -1).join(':');
    if (!presentQueueKeys.includes(eventBase)) {
      const recovered = resolveIncident(event.key, 'The item left the active queue; it was completed or removed.');
      if (recovered && deps.config.notifications.recovered) await sendRecovery(recovered, deps);
    }
  }
  removeObservationsExcept(presentQueueKeys, successfulQueueSources);
  flush();
  return { checked: true };
}

export function startNotificationMonitor() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runNotificationCheck();
    } catch (err) {
      console.warn(`[notifications] monitor failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(run, 5_000);
  const timer = setInterval(run, 60_000);
  initial.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
