/**
 * Run in a fresh `node` subprocess by settings-persistence.test.js -- the
 * only way to actually exercise config.js's "read settings.json and
 * envDefaults() once, at import time" boot behavior, since within a single
 * process that module is imported (and its side effect run) exactly once.
 * Every "restart with these env vars against this DATA_DIR" scenario is a
 * separate real process, the same as a real container restart would be.
 * Prints one line of JSON: the caller parses stdout.
 */
import { config, getSettings, anyServiceConfigured } from '../../config.js';

process.stdout.write(JSON.stringify({ config, settings: getSettings(), anyServiceConfigured: anyServiceConfigured() }));
