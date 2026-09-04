/**
 * The other half of the settings-persistence subprocess pair: boots
 * config.js in its own fresh process (same DATA_DIR a real restart would
 * use) and applies one settings patch, the way the setup wizard's PUT
 * /api/settings handler does. Takes the patch as a JSON string in argv[2].
 * `{ "links": [...] }` goes to saveLinks(); anything else goes to
 * saveSettings() as-is.
 */
import { saveSettings, saveLinks } from '../../config.js';

const patch = JSON.parse(process.argv[2] ?? '{}');
if (Object.prototype.hasOwnProperty.call(patch, 'links')) saveLinks(patch.links);
else saveSettings(patch);

process.stdout.write('ok');
