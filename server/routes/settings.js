/** Setup wizard / settings: reading and writing config.js's persisted state. */
import express from 'express';
import { config, anyServiceConfigured, publicConfig, getSettings, saveSettings, saveLinks, effectiveSecret, SECRET_FIELD, SERVICES } from '../config.js';
import { probes } from '../services/probe.js';
import { invalidate } from '../cache.js';
import { assertReachableUrl } from '../http.js';

const router = express.Router();

router.get('/config', (_req, res) => res.json(publicConfig()));

router.get('/setup/status', (_req, res) => {
  res.json({ needsSetup: !anyServiceConfigured(), settingsFile: config.settingsFile });
});

router.get('/settings', (_req, res) => res.json(getSettings()));

router.put('/settings', (req, res, next) => {
  try {
    const settings = saveSettings(req.body);
    invalidate('');
    res.json({ settings, config: publicConfig() });
  } catch (err) {
    next(err);
  }
});

router.get('/links', (_req, res) => res.json({ items: config.links }));

router.put('/links', (req, res, next) => {
  try {
    const items = saveLinks(req.body?.items);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/test', async (req, res) => {
  const { service, url } = req.body ?? {};
  if (!SERVICES.includes(service)) return res.status(400).json({ ok: false, error: 'Unknown service' });
  const secretField = SECRET_FIELD[service];
  const target = String(url ?? '').trim();
  if (!target) return res.status(400).json({ ok: false, error: 'Enter the server URL first' });
  if (!/^https?:\/\//i.test(target)) return res.status(400).json({ ok: false, error: 'URL must start with http:// or https://' });
  try {
    assertReachableUrl(target);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  const secret = effectiveSecret(service, req.body?.[secretField], target);
  if (!secret) return res.status(400).json({ ok: false, error: `Enter the ${service === 'plex' ? 'token' : 'API key'} first` });
  try {
    const result = await probes[service]({ url: target, [secretField]: secret });
    res.json(result);
  } catch (err) {
    const status = err?.status;
    const hint = status === 401 || status === 403 ? ' — check the credential' : status === 404 ? ' — check the URL (is this the right app and port?)' : '';
    res.json({ ok: false, error: `${err.message ?? 'Connection failed'}${hint}` });
  }
});

export default router;
