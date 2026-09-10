import express from 'express';
import { config } from '../config.js';
import { markAllRead, snapshot } from '../notification-store.js';
import { sendPushover } from '../services/pushover.js';

const router = express.Router();

router.get('/notifications', (_req, res) => res.json(snapshot()));

router.post('/notifications/read', (_req, res) => res.json(markAllRead()));

router.post('/notifications/test', async (req, res, next) => {
  const n = config.notifications;
  const appToken = String(req.body?.appToken ?? '').trim() || n.pushoverAppToken;
  const userKey = String(req.body?.userKey ?? '').trim() || n.pushoverUserKey;
  if (!appToken || !userKey) return res.status(400).json({ error: 'Enter a Pushover app token and user key first' });
  try {
    await sendPushover({
      appToken,
      userKey,
      title: 'Cuesheet test',
      message: 'Notifications are connected and ready.',
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
