// Синхронізатор артів: апка (Supabase) → файлова система Foundry VTT.
//
// Працює на сервері Foundry. Кожні POLL_SECONDS:
//   1. нові рядки art_uploads → файл із бакета pilot-art лягає в
//      <FOUNDRY_DATA>/<ART_ROOT>/<папка гравця>/<ім'я файлу>; рядку проставляються
//      synced_at і foundry_path (шлях відносно Data — саме його вставляють у Foundry);
//   2. рядки з deleted_at (гравець видалив арт в апці) → файл прибирається з Foundry
//      і зі сховища, рядок видаляється.
// Папка гравця — його нік латиницею; створюється при першому арті.

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// .env поруч зі скриптом. Свій розбір, а не node --env-file: той є лише з Node 20.6,
// а Foundry буває і на Node 18. Змінні, задані ззовні (systemd тощо), мають пріоритет.
try {
  for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {
  // .env необов'язковий, якщо змінні задано інакше.
}

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.error(`Не задано змінну середовища ${name} (див. .env.example).`);
    process.exit(1);
  }
  return v;
};

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const FOUNDRY_DATA = path.resolve(env('FOUNDRY_DATA'));
const ART_ROOT = env('ART_ROOT', 'pilots');
const POLL_SECONDS = Number(env('POLL_SECONDS', '15'));
const BUCKET = 'pilot-art';

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ----- Імена папок і файлів -----

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i',
  ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '',
};

// Латиниця без пробілів: кирилиця в шляхах Foundry працює, але в URL токенів дає
// %-кодування й зайві сюрпризи, тож простіше одразу тримати ASCII.
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .split('')
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function safeFileName(name) {
  const ext = path.extname(name).toLowerCase();
  const base = slug(path.basename(name, path.extname(name))) || 'art';
  return `${base.slice(0, 80)}${ext}`;
}

// Шлях усередині Data — і ніде інакше, хоч би що прийшло з бази.
function insideData(rel) {
  const abs = path.resolve(FOUNDRY_DATA, rel);
  if (abs !== FOUNDRY_DATA && !abs.startsWith(FOUNDRY_DATA + path.sep)) {
    throw new Error(`Шлях поза Data: ${rel}`);
  }
  return abs;
}

const exists = (p) => access(p).then(() => true, () => false);

// Папка гравця: та, що вже використовувалась для його артів, інакше — нік латиницею.
// Якщо такий нік уже зайнятий іншим гравцем, додаємо хвіст з його ID.
const folderCache = new Map();
async function folderFor(userId) {
  if (folderCache.has(userId)) return folderCache.get(userId);

  const { data: prev } = await db.from('art_uploads').select('foundry_path')
    .eq('user_id', userId).not('foundry_path', 'is', null).limit(1);
  let folder = prev?.[0]?.foundry_path?.split('/')[1];

  if (!folder) {
    const { data: profile } = await db.from('profiles').select('nick').eq('id', userId).maybeSingle();
    folder = slug(profile?.nick) || `player-${userId.slice(0, 8)}`;
    const { data: taken } = await db.from('art_uploads').select('user_id')
      .like('foundry_path', `${ART_ROOT}/${folder}/%`).neq('user_id', userId).limit(1);
    if (taken?.length) folder = `${folder}-${userId.slice(0, 4)}`;
  }

  folderCache.set(userId, folder);
  return folder;
}

// ----- Синхронізація -----

async function syncNew() {
  const { data: rows, error } = await db.from('art_uploads')
    .select('id, user_id, storage_path, file_name')
    .is('synced_at', null).is('deleted_at', null)
    .order('created_at').limit(50);
  if (error) throw new Error(error.message);

  for (const row of rows) {
    try {
      const folder = await folderFor(row.user_id);
      const dirRel = `${ART_ROOT}/${folder}`;
      await mkdir(insideData(dirRel), { recursive: true });

      // Не перезаписуємо: однакові імена отримують -2, -3…
      const base = safeFileName(row.file_name);
      const ext = path.extname(base);
      let name = base;
      for (let n = 2; await exists(insideData(`${dirRel}/${name}`)); n++) {
        name = `${path.basename(base, ext)}-${n}${ext}`;
      }

      const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(row.storage_path);
      if (dlErr) throw new Error(`download: ${dlErr.message}`);
      const rel = `${dirRel}/${name}`;
      await writeFile(insideData(rel), Buffer.from(await blob.arrayBuffer()));

      const { error: upErr } = await db.from('art_uploads')
        .update({ synced_at: new Date().toISOString(), foundry_path: rel }).eq('id', row.id);
      if (upErr) throw new Error(`update: ${upErr.message}`);
      console.log(`+ ${rel}`);
    } catch (err) {
      console.error(`! ${row.file_name} (${row.id}):`, err.message);
    }
  }
}

async function syncDeleted() {
  const { data: rows, error } = await db.from('art_uploads')
    .select('id, storage_path, foundry_path')
    .not('deleted_at', 'is', null).limit(50);
  if (error) throw new Error(error.message);

  for (const row of rows) {
    try {
      if (row.foundry_path) {
        await unlink(insideData(row.foundry_path)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
      }
      await db.storage.from(BUCKET).remove([row.storage_path]);
      await db.from('art_uploads').delete().eq('id', row.id);
      console.log(`- ${row.foundry_path || row.storage_path}`);
    } catch (err) {
      console.error(`! видалення ${row.id}:`, err.message);
    }
  }
}

async function tick() {
  try {
    await syncDeleted();
    await syncNew();
  } catch (err) {
    console.error('Помилка проходу:', err.message);
  }
}

console.log(`foundry-sync: ${FOUNDRY_DATA}/${ART_ROOT}, кожні ${POLL_SECONDS} с`);
let running = false;
const loop = async () => {
  if (running) return;
  running = true;
  await tick();
  running = false;
};
await loop();
setInterval(loop, POLL_SECONDS * 1000);
