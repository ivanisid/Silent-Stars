// Збирає модуль для сервера Foundry: dist/silent-stars-sync/ і dist/silent-stars-sync.zip.
//
// Версія з module.json вписується в імена скриптів (silent-stars-sync.0.2.0.js, sync.0.2.0.js).
// Перед сервером Foundry стоїть кеш (Cloudflare), який віддавав старий скрипт навіть після
// заміни файлу на диску; нове ім'я файлу кешу ще незнайоме. Тож при кожній зміні модуля:
// підняти version у module.json → node foundry-module/build.mjs → залити теку з dist.
//
// Для встановлення й оновлень у Foundry за посиланням: manifest у module.json вказує на
// module.json останнього релізу GitHub, download — на архів цієї версії (тег sync-v<версія>).
// Архів — вміст теки модуля без самої теки: так його розпаковує інсталятор Foundry.
// Релізи публікує .github/workflows/foundry-module.yml, коли в main змінюється version.
//
// Запуск: node foundry-module/build.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'silent-stars-sync');
const dist = join(root, 'dist');
const out = join(dist, 'silent-stars-sync');

const manifest = JSON.parse(readFileSync(join(src, 'module.json'), 'utf8'));
const v = manifest.version;
const entry = `scripts/silent-stars-sync.${v}.js`;
const lib = `sync.${v}.js`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(out, 'scripts'), { recursive: true });

const main = readFileSync(join(src, 'scripts/silent-stars-sync.js'), 'utf8');
if (!main.includes("from './sync.js'")) throw new Error("Не знайдено import from './sync.js' у silent-stars-sync.js");
writeFileSync(join(out, entry), main.replace("from './sync.js'", `from './${lib}'`));
writeFileSync(join(out, 'scripts', lib), readFileSync(join(src, 'scripts/sync.js'), 'utf8'));
const built = { ...manifest, esmodules: [entry], download: manifest.download.replace('{version}', v) };
const json = JSON.stringify(built, null, 2) + '\n';
writeFileSync(join(out, 'module.json'), json);
// Окремий module.json поруч з архівом — асет релізу, на який дивиться manifest.
writeFileSync(join(dist, 'module.json'), json);

execFileSync('zip', ['-q', '-r', join(dist, 'silent-stars-sync.zip'), '.'], { cwd: out });
console.log(`dist/silent-stars-sync (${v}): module.json, ${entry}, scripts/${lib}`);
console.log(`dist/silent-stars-sync.zip, dist/module.json → ${built.download}`);
