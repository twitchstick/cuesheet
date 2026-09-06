import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export interface SpawnedServer {
  base: string;
  stop: () => Promise<void>;
}

/**
 * Runs server/index.js as a genuinely separate OS process, not a dynamic
 * import() sharing this Playwright worker's own Node process.
 *
 * The bug that made this necessary: config.js computes its exported
 * `config` object once, as a module-top-level side effect, from
 * process.env at the moment anything first imports it. server/index.js
 * reaches config.js through a plain static `import ... from './config.js'`
 * -- not the dynamic import() with its own cache-busting query string --
 * so Node's module cache resolves every `server/index.js?instance=X`
 * variant's own `./config.js` import to the exact same cached singleton
 * regardless of X. The first isolated-server test in a given worker
 * process gets a config matching its own env vars; every later one in
 * that same worker silently inherits the first test's already-torn-down
 * config instead, since nothing ever re-evaluates config.js a second time.
 * Confirmed by running two isolated-server specs back to back -- even
 * with a single worker, the second one's requests always went to the
 * first test's closed upstream.
 *
 * A real child process has its own independent memory, so this can't
 * recur no matter how many isolated-server tests exist -- the same
 * guarantee server/test/integration/*.test.js gets for free from
 * `node --test` running each file in its own process.
 */
export async function spawnServer(env: Record<string, string>): Promise<SpawnedServer> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.resolve('server/index.js')], {
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr.on('data', (d: Buffer) => (output += d.toString()));

  const deadline = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Not listening yet -- keep polling.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) {
    child.kill();
    throw new Error(`server/index.js never became healthy at ${base} (exit code ${child.exitCode})\n${output}`);
  }

  return {
    base,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}
