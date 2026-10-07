// Арти пілотів і мехів з апки → папка Data Foundry через File Browser на сервері Foundry.
// Нічого не треба встановлювати на сам сервер: функція заходить у File Browser під
// окремим користувачем і кладе файли через його API.
//
// Викликається тригером на art_uploads (новий арт / видалення) і pg_cron кожні 5 хв
// (дотягує те, що не вдалося). Кожен виклик:
//   1. арти мехів, яких уже немає в пілота, позначаються видаленими;
//   2. видалені арти (замінені, прибрані, пілот видалений) прибираються з Foundry і сховища;
//   3. нові арти кладуться в <FILEBROWSER_DATA_PATH>/<ART_ROOT>/<нік>/ так:
//        <ПОЗИВНИЙ>/<ПОЗИВНИЙ>.<ext>                — портрет, у папці пілота
//        <ПОЗИВНИЙ>/<МЕХ>/<МЕХ>.<ext>               — арт меха, кожен мех у своїй папці
//      рядку ставиться foundry_path (шлях відносно Data — його й вставляють у Foundry);
//   4. уже синхронізовані арти, чий шлях застарів (перейменували пілота чи меха, змінилась
//      схема папок), переїжджають на новий шлях.
// Видалення йде перед записом, тож новий портрет лягає під тим самим ім'ям, що й старий.
//
// Секрети: FILEBROWSER_URL, FILEBROWSER_USER, FILEBROWSER_PASSWORD, FILEBROWSER_DATA_PATH
// (шлях до Data Foundry всередині File Browser), необов'язковий ART_ROOT (= pilots).
// Розгортається з verify_jwt = false; перевіряє x-sync-secret із vault, як discord-sync.

import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const BUCKET = 'pilot-art';
const ART_ROOT = Deno.env.get('ART_ROOT') || 'pilots';
let secret: string | null = null;

// ----- Імена папок і файлів (латиницею: кирилиця в шляхах токенів дає %-кодування) -----

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i',
  ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '',
};

function slug(s: unknown) {
  return String(s || '')
    .toLowerCase()
    .split('')
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

// Ім'я пілота / меха для папки й файлу: зберігає регістр (CHEMBER → CHEMBER), кирилицю
// переводить у латиницю, пробіли — у «_»; решту неприпустимого прибирає.
function displayName(s: unknown) {
  return String(s || '')
    .split('')
    .map((ch) => {
      const low = ch.toLowerCase();
      if (!(low in TRANSLIT)) return ch;
      const t = TRANSLIT[low];
      return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
}

// Назви папок мехів одного пілота: однакові назви отримують -2, -3… за порядком у списку.
function mechFolderNames(pilot: any) {
  const used = new Map<string, number>();
  const out = new Map<string, string>();
  for (const m of pilot?.state?.mechs || []) {
    const base = displayName(m.name) || `MECH-${m.id}`;
    const n = (used.get(base.toLowerCase()) || 0) + 1;
    used.set(base.toLowerCase(), n);
    out.set(String(m.id), n === 1 ? base : `${base}-${n}`);
  }
  return out;
}

// Де арт має лежати зараз (шлях відносно Data). null — пілота чи меха вже немає.
async function desiredPath(row: any) {
  if (!row.pilot_id) return null;
  const { data: pilot } = await db.from('pilots').select('callsign, state').eq('id', row.pilot_id).maybeSingle();
  if (!pilot) return null;
  const folder = await folderFor(row.user_id);
  const pilotName = displayName(pilot.callsign) || `PILOT-${row.pilot_id.slice(0, 8)}`;
  const ext = extOf(row.file_name);
  if (row.kind === 'portrait') return `${ART_ROOT}/${folder}/${pilotName}/${pilotName}${ext}`;
  const mechName = mechFolderNames(pilot).get(String(row.mech_id));
  if (!mechName) return null;
  return `${ART_ROOT}/${folder}/${pilotName}/${mechName}/${mechName}${ext}`;
}

async function upload(rel: string, storagePath: string) {
  const { data: blob, error } = await db.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`download: ${error.message}`);
  // override: шлях належить цьому арту (ім'я пілота/меха), а File Browser сам створить папки.
  const res = await fb('POST', rel, new Uint8Array(await blob.arrayBuffer()), '?override=true');
  if (!res.ok) throw new Error(`File Browser upload ${res.status}: ${await res.text()}`);
}

function extOf(name: string) {
  const m = /\.[a-z0-9]{1,5}$/i.exec(name);
  return m ? m[0].toLowerCase() : '.png';
}

// ----- File Browser API -----

const FB_URL = (Deno.env.get('FILEBROWSER_URL') || '').replace(/\/+$/, '');
const FB_DATA = '/' + (Deno.env.get('FILEBROWSER_DATA_PATH') || '').replace(/^\/+|\/+$/g, '');

let fbToken: string | null = null;
async function fbLogin() {
  const res = await fetch(`${FB_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: Deno.env.get('FILEBROWSER_USER'),
      password: Deno.env.get('FILEBROWSER_PASSWORD'),
      recaptcha: '',
    }),
  });
  if (!res.ok) throw new Error(`File Browser login ${res.status}: ${await res.text()}`);
  fbToken = (await res.text()).trim();
}

// Шлях у File Browser: /<Data>/<rel>, кожен сегмент закодований окремо.
const fbPath = (rel: string) =>
  `${FB_DATA === '/' ? '' : FB_DATA}/${rel}`.split('/').map(encodeURIComponent).join('/');

async function fb(method: string, rel: string, body?: Uint8Array<ArrayBuffer>, query = '') {
  if (!fbToken) await fbLogin();
  const call = () => fetch(`${FB_URL}/api/resources${fbPath(rel)}${query}`, {
    method,
    headers: { 'X-Auth': fbToken!, ...(body ? { 'Content-Type': 'application/octet-stream' } : {}) },
    body,
  });
  let res = await call();
  if (res.status === 401) { // токен прострочився — увійти ще раз
    await fbLogin();
    res = await call();
  }
  return res;
}

// ----- Папка гравця -----

const folderCache = new Map<string, string>();
async function folderFor(userId: string) {
  if (folderCache.has(userId)) return folderCache.get(userId)!;
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

// ----- Проходи -----

async function cleanupRemovedMechs() {
  const { data: rows, error } = await db.from('art_uploads')
    .select('id, pilot_id, mech_id').eq('kind', 'mech').is('deleted_at', null).not('pilot_id', 'is', null);
  if (error) throw new Error(error.message);
  const pilotIds = [...new Set(rows.map((r) => r.pilot_id))];
  if (!pilotIds.length) return;
  const { data: pilots } = await db.from('pilots').select('id, state').in('id', pilotIds);
  const mechIds = new Map((pilots || []).map((p) => [p.id, new Set((p.state?.mechs || []).map((m: any) => String(m.id)))]));
  // ID мехів у state — числа, mech_id у таблиці — текст; Set вище вже з рядків.
  const orphans = rows.filter((r) => !mechIds.get(r.pilot_id)?.has(r.mech_id)).map((r) => r.id);
  if (orphans.length) await db.from('art_uploads').update({ deleted_at: new Date().toISOString() }).in('id', orphans);
}

async function syncDeleted(log: string[]) {
  const { data: rows, error } = await db.from('art_uploads')
    .select('id, storage_path, foundry_path').not('deleted_at', 'is', null).limit(30);
  if (error) throw new Error(error.message);
  if (!rows.length) return;
  // Замінений портрет мав той самий шлях, що й новий. Якщо новий уже лежить там, файл
  // не чіпаємо — інакше видалення старого стерло б новий.
  const { data: live } = await db.from('art_uploads').select('foundry_path')
    .is('deleted_at', null).not('foundry_path', 'is', null);
  const inUse = new Set((live || []).map((r) => r.foundry_path));
  for (const row of rows) {
    try {
      if (row.foundry_path && !inUse.has(row.foundry_path)) {
        const res = await fb('DELETE', row.foundry_path);
        if (!res.ok && res.status !== 404) throw new Error(`File Browser DELETE ${res.status}: ${await res.text()}`);
      }
      await db.storage.from(BUCKET).remove([row.storage_path]);
      await db.from('art_uploads').delete().eq('id', row.id);
      log.push(`- ${row.foundry_path || row.storage_path}`);
    } catch (err) {
      log.push(`! delete ${row.id}: ${(err as Error).message}`);
    }
  }
}

async function syncNew(log: string[]) {
  const { data: rows, error } = await db.from('art_uploads')
    .select('id, user_id, pilot_id, kind, mech_id, storage_path, file_name')
    .is('synced_at', null).is('deleted_at', null).order('created_at').limit(20);
  if (error) throw new Error(error.message);

  for (const row of rows) {
    try {
      const rel = await desiredPath(row);
      if (!rel) continue; // мех ще не збережений у пілота — наступний прохід
      await upload(rel, row.storage_path);
      await db.from('art_uploads').update({ synced_at: new Date().toISOString(), foundry_path: rel }).eq('id', row.id);
      log.push(`+ ${rel}`);
    } catch (err) {
      log.push(`! ${row.file_name} (${row.id}): ${(err as Error).message}`);
    }
  }
}

// Перейменували пілота чи меха (або змінилась схема папок) — переносимо файл на новий шлях:
// кладемо копію зі сховища туди, де треба, і прибираємо стару.
async function relocate(log: string[]) {
  const { data: rows, error } = await db.from('art_uploads')
    .select('id, user_id, pilot_id, kind, mech_id, storage_path, file_name, foundry_path')
    .not('synced_at', 'is', null).is('deleted_at', null);
  if (error) throw new Error(error.message);

  for (const row of rows) {
    try {
      const rel = await desiredPath(row);
      if (!rel || rel === row.foundry_path) continue;
      await upload(rel, row.storage_path);
      if (row.foundry_path) {
        const res = await fb('DELETE', row.foundry_path);
        if (!res.ok && res.status !== 404) throw new Error(`File Browser DELETE ${res.status}: ${await res.text()}`);
      }
      await db.from('art_uploads').update({ foundry_path: rel }).eq('id', row.id);
      log.push(`~ ${row.foundry_path} → ${rel}`);
    } catch (err) {
      log.push(`! move ${row.id}: ${(err as Error).message}`);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  for (let attempt = 1; !secret && attempt <= 4; attempt++) {
    const { data } = await db.rpc('discord_sync_secret');
    if (data) secret = data as string;
    else await new Promise((r) => setTimeout(r, 250 * attempt));
  }
  if (!secret || req.headers.get('x-sync-secret') !== secret) return new Response('Forbidden', { status: 403 });

  if (!FB_URL || !Deno.env.get('FILEBROWSER_USER') || !Deno.env.get('FILEBROWSER_DATA_PATH')) {
    return Response.json({ skipped: 'File Browser ще не налаштовано (секрети FILEBROWSER_*)' });
  }

  const log: string[] = [];
  try {
    await cleanupRemovedMechs();
    await syncDeleted(log);
    await relocate(log);
    await syncNew(log);
  } catch (err) {
    console.error('foundry-art-sync', err);
    return Response.json({ error: String(err), log }, { status: 500 });
  }
  if (log.some((l) => l.startsWith('!'))) console.error('foundry-art-sync', log);
  return Response.json({ log });
});
