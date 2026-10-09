// Страховка від «німих кнопок».
//
// Двічі траплялося, що блок case-ів зникав із редюсера разом із сусідньою секцією,
// яку вирізали навмисно. Збірка не падає — компонент просто диспатчить у порожнечу,
// і кнопка мовчки не працює. Цей скрипт звіряє два переліки: що диспатчать компоненти
// і що обробляє редюсер.
//
// Запуск: node client/src/pilot/__actions.test.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(srcDir).filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.endsWith('__actions.test.mjs'));

// Що обробляє редюсер.
const reducer = readFileSync(join(srcDir, 'pilot/reducer.js'), 'utf8');
const handled = new Set([...reducer.matchAll(/(?:case |action\.type === )'([A-Z_]+)'/g)].map((m) => m[1]));

// Що диспатчать компоненти: будь-який літерал дії { type: 'X' } — і прямо в dispatch(…),
// і зібраний наперед (action: { type: … }), який диспатчиться після вікна підтвердження.
const dispatched = new Map();
for (const file of files) {
  if (file.endsWith('reducer.js')) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\{\s*type:\s*'([A-Z_]+)'/g)) {
    if (!dispatched.has(m[1])) dispatched.set(m[1], new Set());
    dispatched.get(m[1]).add(file.slice(srcDir.length + 1));
  }
}

const orphans = [...dispatched.keys()].filter((t) => !handled.has(t) && t !== '__INIT__');
const unused = [...handled].filter((t) => !dispatched.has(t));

if (orphans.length) {
  console.log('FAIL — ці екшени диспатчаться, але редюсер їх не обробляє:');
  for (const t of orphans) console.log(`  ${t}  ←  ${[...dispatched.get(t)].join(', ')}`);
} else {
  console.log(`PASS — усі ${dispatched.size} екшенів, що диспатчать компоненти, обробляються редюсером`);
}

// Не помилка: екшени можуть викликатись лише з тестів або лишатись про запас.
if (unused.length) {
  console.log(`\n(до відома) у редюсері є ${unused.length} обробників, яких не диспатчить жоден компонент:`);
  console.log('  ' + unused.join(', '));
}

process.exit(orphans.length ? 1 : 0);
