import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, enabledServices } from './config.js';
import { securityHeaders, noStore, checkOrigin, notFound, errorHandler } from './middleware.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import mediaRoutes from './routes/media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('query parser', 'simple');
// Behind a reverse proxy, set TRUST_PROXY (e.g. "1") so per-address sign-in
// limits see the real client and not the proxy.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
app.use(express.json({ limit: '32kb' }));
app.use(securityHeaders);

const api = express.Router();
api.use(noStore);
api.use(checkOrigin);
api.use(settingsRoutes);
api.use(dashboardRoutes);
api.use(mediaRoutes);
api.get('/health', (_req, res) => res.json({ ok: true }));
api.use(notFound);
api.use(errorHandler);

app.use('/api', api);

// Serve the built client (client/dist) with an SPA fallback.
const clientDir = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDir, { maxAge: '1h', index: false }));
// Final catch-all: hand every other GET the single-page app.
// A plain middleware (rather than a wildcard route) keeps "/" covered and
// behaves the same on Express 4 and 5.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).end();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientDir, 'index.html'), (err) => {
    if (err) res.status(503).type('text').send('Cuesheet client has not been built. Run `npm run build`.');
  });
});

// Exported so integration tests can mount `app` on their own listener
// (a fixture DATA_DIR, mock upstreams) without this module also binding
// the real configured port itself. Only bind here when this file is the
// one actually launched -- `node server/index.js` / `--watch server/index.js`,
// both of which set argv[1] to this file -- not when it's merely imported.
export { app };

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  app.listen(config.port, () => {
    const services = Object.entries(enabledServices())
      .filter(([, on]) => on)
      .map(([name]) => name);
    console.log(`${config.title} listening on http://0.0.0.0:${config.port} (tz ${config.timeZone})`);
    console.log(services.length ? `Connected services: ${services.join(', ')}` : 'No services configured yet — open the web UI to run the setup wizard.');
    console.log(`Settings file: ${config.settingsFile}`);
  });
}
