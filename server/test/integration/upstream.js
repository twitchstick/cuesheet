import http from 'node:http';

/**
 * A minimal fake upstream server for integration tests: routes a request by
 * `METHOD pathname` (falling back to a bare `pathname` entry) to a canned
 * response. Query strings are deliberately ignored -- what Cuesheet sends
 * as a param is already covered at the unit level (each service's own
 * *.test.js mocks fetch directly); this exists to prove the real Express
 * app, the real HTTP client, and the real response mapping work together
 * end to end over an actual socket.
 *
 * A route entry is `{ status?, headers?, body }`, or a function of the
 * incoming request returning that shape, for the handful of cases that
 * need to look at the method or a header. `body` is JSON-stringified
 * unless it's already a Buffer or string (the image-proxy tests hand back
 * raw bytes).
 */
export function startUpstream(routes) {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const key = `${req.method} ${pathname}`;
    const handler = routes[key] ?? routes[pathname];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `no fixture route for ${key}` }));
      return;
    }
    const resolved = typeof handler === 'function' ? handler(req) : handler;
    const { status = 200, body, headers = {} } = resolved;
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    if (Buffer.isBuffer(body) || typeof body === 'string') res.end(body);
    else res.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
