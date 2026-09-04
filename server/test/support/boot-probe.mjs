/**
 * Run in a fresh `node` subprocess by settings-persistence.test.js -- the
 * only way to actually exercise config.js's "read settings.json and
 * envDefaults() once, at import time" boot behavior, since within a single
 * process that module is imported (and its side effect run) exactly once.
 * Every "restart with these env vars against this DATA_DIR" scenario is a
 * separate real process, the same as a real container restart would be.
 * Prints one line of JSON: the caller parses stdout.
 */
import { config, getSettings, anyServiceConfigured, verifyAdminPassword } from '../../config.js';

// An optional argv[2]: a candidate password to check verifyAdminPassword()
// against on this boot, since config.auth itself never exposes the hash.
const candidate = process.argv[2];
const verifies = candidate === undefined ? null : verifyAdminPassword(candidate);

process.stdout.write(JSON.stringify({ config, settings: getSettings(), anyServiceConfigured: anyServiceConfigured(), verifies }));
