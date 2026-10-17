// Збирає foundry-module/silent-stars-sync/scripts/compcon-core.js — логіку прийняття нової
// версії з COMP/CON з коду апки (client/src/pilot), щоб модуль приймав версію так само, як
// апка: ті самі мехи, слоти ангару, злиття стану і файли для Foundry. Файл згенерований і
// лежить у репозиторії (збірці модуля й релізу не потрібен npm). Після зміни цих файлів апки:
//   node foundry-module/bundle-compcon.mjs
// CI (job client) запускає з --check і падає, якщо згенерований файл застарів.
//
// shopCatalog.js тягне React і клієнт Supabase лише заради стартового PR у
// createDefaultPilotState — для мехів він не потрібен, тож підміняється заглушкою.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pilot = join(root, 'client/src/pilot');
const out = join(root, 'foundry-module/silent-stars-sync/scripts/compcon-core.js');
const esbuild = createRequire(join(root, 'client/package.json'))('esbuild');

const entry = `
export { mapCompconPilot } from './compconImport.js';
export { defaultAssignment, isObvious, applyAssignment, profilesFor, changesText, slotCount } from './slotImport.js';
export { mechSlots } from './constants.js';
export { mechDiff, wrapCloudPilot } from './compconLink.js';
`;

const stub = {
  name: 'shop-catalog-stub',
  setup(build) {
    build.onResolve({ filter: /shopCatalog(\.js)?$/ }, () => ({ path: 'shopCatalog', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const prStart = () => 0;', loader: 'js' }));
  },
};

const res = await esbuild.build({
  stdin: { contents: entry, resolveDir: pilot, sourcefile: 'compcon-core-entry.js' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  legalComments: 'none',
  plugins: [stub],
});
const banner = '// ЗГЕНЕРОВАНО foundry-module/bundle-compcon.mjs з client/src/pilot — не редагувати вручну.\n';
const code = banner + res.outputFiles[0].text;

if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(out, 'utf8'); } catch { /* немає файлу */ }
  if (cur !== code) {
    console.error('compcon-core.js застарів: node foundry-module/bundle-compcon.mjs');
    process.exit(1);
  }
  console.log('compcon-core.js актуальний');
} else {
  writeFileSync(out, code);
  console.log(`compcon-core.js: ${code.length} байт`);
}
