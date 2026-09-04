/**
 * Starts a fully-configured Cuesheet instance for Playwright to drive: the
 * same fake-upstream fixtures the server integration test uses (server/test/
 * integration/{upstream,fixtures}.js), so the dashboard actually has real
 * requests/queue/streams data to render instead of an empty setup wizard.
 * Run directly (`node e2e/fixture-server.mjs`) -- playwright.config.ts's
 * webServer launches this and waits for /api/health.
 */
import http from 'node:http';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startUpstream } from '../server/test/integration/upstream.js';
import { plexRoutes, jellyfinRoutes, radarrRoutes, sonarrRoutes, seerrRoutes, sabnzbdRoutes } from '../server/test/integration/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? '4173';

const dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-e2e-'));
const upstreams = {
  plex: await startUpstream(plexRoutes),
  jellyfin: await startUpstream(jellyfinRoutes),
  radarr: await startUpstream(radarrRoutes),
  sonarr: await startUpstream(sonarrRoutes),
  seerr: await startUpstream(seerrRoutes),
  sabnzbd: await startUpstream(sabnzbdRoutes),
};

process.env.DATA_DIR = dataDir;
process.env.TZ = 'UTC';
process.env.PORT = PORT;
process.env.SERVER_NAME = 'Apollo (e2e)';
process.env.PLEX_URL = upstreams.plex.url;
process.env.PLEX_TOKEN = 'plex-tok';
process.env.JELLYFIN_URL = upstreams.jellyfin.url;
process.env.JELLYFIN_API_KEY = 'jf-key';
process.env.RADARR_URL = upstreams.radarr.url;
process.env.RADARR_API_KEY = 'radarr-key';
process.env.SONARR_URL = upstreams.sonarr.url;
process.env.SONARR_API_KEY = 'sonarr-key';
process.env.SEERR_URL = upstreams.seerr.url;
process.env.SEERR_API_KEY = 'seerr-key';
process.env.SABNZBD_URL = upstreams.sabnzbd.url;
process.env.SABNZBD_API_KEY = 'sab-key';

// Imported, not executed directly, so server/index.js's own `isMain` guard
// leaves the binding to us -- this process also owns the upstream fixtures
// and needs to close them together on shutdown.
const { app } = await import(path.join(__dirname, '../server/index.js'));
const server = http.createServer(app);
server.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`e2e fixture server listening on http://127.0.0.1:${PORT}`);
});

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
  await Promise.all(Object.values(upstreams).map((u) => u.close()));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
