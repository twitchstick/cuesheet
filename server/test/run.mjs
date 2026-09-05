/**
 * `node --test server/test/*.test.js server/test/integration/*.test.js`
 * (the previous `test` script) relies on the *shell* expanding those globs
 * before Node ever sees them -- true on bash/sh (every Linux/macOS runner
 * this ran on), but PowerShell (Windows CI's default shell for npm
 * scripts) doesn't expand argument globs the same way, so `node --test`
 * received the literal, unexpanded string `server/test/*.test.js` and
 * failed outright: "Could not find '...\*.test.js'".
 *
 * This resolves the exact same file list itself, in plain JS, so which
 * shell invoked it never matters. Deliberately not `node --test
 * server/test` (letting Node's own recursive directory search find
 * everything) -- server/test/ also holds non-test helpers (helpers.js,
 * support/*.mjs) and server/test/integration/ holds upstream.js/
 * fixtures.js, which Node's default test-file patterns (anything under a
 * directory literally named "test") would happily try to run as tests too.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DIRS = ['server/test', 'server/test/integration'];

const files = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.test.js'))
    .map((name) => `${dir}/${name}`),
);

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
