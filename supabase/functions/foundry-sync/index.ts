// Двостороння синхронізація пілотів і мехів з акторами Lancer у Foundry.
//
// Ініціатор — модуль silent-stars-sync у Foundry (foundry-module/), який працює в клієнті
// ГМа, поки світ відкритий. Ця функція — лише його доступ до бази: віддає пілотів і
// приймає зміни, що сталися у Foundry. Хто що міняв і що перемагає при конфлікті,
// вирішує модуль (у нього є «база» — останні узгоджені значення в прапорцях актора).
//
//   POST { action: 'pull' }
//     → { pilots: [...] } — усі пілоти з полями, які синхронізуються (див. toSyncPilot).
//
//   POST { action: 'push', updates: [{ pilotId, updatedAt, pilot?, mechs?, log? }] }
//     Кожне оновлення накладається на state пілота лише якщо updated_at у базі досі той,
//     що бачив модуль (оптимістичне блокування). Інакше — conflict, і модуль повторить
//     на наступному циклі вже зі свіжими даними.
//     → { results: [{ pilotId, ok, updatedAt?, conflict?, error? }] }
//
// Поля у push — в одиницях апки (не Foundry):
//   pilot: { hpCurrent?, stress? }
//   mechs: { [mechId]: { hpCurrent?, hpMax?, repairCurrent?, repairMax?, structureFilled?,
//                        reactorFilled?, overcharge?, corePower?,
//                        limited?: { [назва системи в нижньому регістрі]: { current?, max? } } } }
//   (limited накладається на лімітні записи mech.items, або mech.limited у старій формі)
//
// Доступ: заголовок x-foundry-key має збігатися з секретом foundry_sync_key у vault.
// Розгортається з verify_jwt = false.

import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// Модуль ходить сюди з браузера ГМа (інший origin — сервер Foundry), тож потрібен CORS.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-foundry-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

let key: string | null = null;
async function loadKey() {
  for (let attempt = 1; !key && attempt <= 4; attempt++) {
    const { data } = await db.rpc('foundry_sync_key');
    if (data) key = data as string;
    else await new Promise((r) => setTimeout(r, 250 * attempt));
  }
  return key;
}

// ----- pull -----

const STRUCTURE_MAX = 4; // у апці 4 клітинки структури і 4 реактора (MechsPanel)

function toSyncMech(m: any, art: Map<string, string>, pilotId: string) {
  return {
    id: String(m.id),
    name: m.name || '',
    frame: m.frame || '',
    hpCurrent: num(m.hpCurrent),
    hpMax: num(m.hpMax),
    repairCurrent: num(m.repairCurrent),
    repairMax: num(m.repairMax),
    structureFilled: num(m.structureFilled),
    reactorFilled: num(m.reactorFilled),
    overcharge: num(m.overcharge),
    corePower: m.corePower !== false,
    // Лімітна зброя й системи. Новіша форма — mech.items (уся зброя й системи, лімітні мають
    // max), старіша — mech.limited; рядки, які ще не пересохранялись з апки, мають саме її.
    limited: itemsOf(m).filter((l: any) => l.max != null)
      .map((l: any) => ({ name: l.name || '', current: num(l.current), max: num(l.max) })),
    art: art.get(`${pilotId}:mech:${m.id}`) || null,
  };
}

function toSyncPilot(p: any, nicks: Map<string, string>, art: Map<string, string>) {
  const s = p.state || {};
  return {
    id: p.id,
    name: p.name,
    callsign: p.callsign,
    player: nicks.get(p.user_id) || '',
    status: s.status || 'active',
    ll: s.ll ?? 2,
    hpCurrent: num(s.hp?.current),
    hpMax: num(s.hp?.max),
    stress: num(s.stress),
    stressMax: num(s.stressMax ?? 8),
    portrait: art.get(`${p.id}:portrait`) || null,
    mechs: (s.mechs || []).map((m: any) => toSyncMech(m, art, p.id)),
    updatedAt: p.updated_at,
  };
}

async function pull() {
  const [{ data: pilots, error }, { data: profiles }, { data: arts }] = await Promise.all([
    db.from('pilots').select('id, user_id, name, callsign, state, updated_at'),
    db.from('profiles').select('id, nick'),
    db.from('art_uploads').select('pilot_id, kind, mech_id, foundry_path')
      .is('deleted_at', null).not('foundry_path', 'is', null),
  ]);
  if (error) throw new Error(error.message);
  const nicks = new Map((profiles || []).map((r) => [r.id, r.nick]));
  const art = new Map<string, string>();
  for (const a of arts || []) {
    art.set(a.kind === 'portrait' ? `${a.pilot_id}:portrait` : `${a.pilot_id}:mech:${a.mech_id}`, a.foundry_path);
  }
  return { pilots: (pilots || []).map((p) => toSyncPilot(p, nicks, art)) };
}

const itemsKey = (m: any) => (Array.isArray(m.items) ? 'items' : 'limited');
const itemsOf = (m: any) => m[itemsKey(m)] || [];

// ----- push -----

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const has = (o: any, k: string) => o && Object.prototype.hasOwnProperty.call(o, k);

function pad(n: number) {
  return String(n).padStart(2, '0');
}
// Той самий формат, що й logEntry у клієнті (дд.мм.рррр гг:хх:сс), за київським часом.
function nowTs() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Накладає зміни з Foundry на state. Повертає новий state і список змін для журналу.
function applyPatch(state: any, u: any) {
  const next = { ...state, hp: { ...(state.hp || {}) }, mechs: [...(state.mechs || [])] };
  const changes: string[] = [];
  const set = (label: string, from: unknown, to: unknown) => {
    if (from !== to) changes.push(`${label} ${from ?? '—'} → ${to}`);
  };

  if (has(u.pilot, 'hpCurrent')) {
    const v = Math.max(0, num(u.pilot.hpCurrent));
    set('ХП пілота', next.hp.current, v);
    next.hp.current = v;
  }
  if (has(u.pilot, 'stress')) {
    const v = clamp(num(u.pilot.stress), 0, num(next.stressMax ?? 8) || 8);
    set('стрес', next.stress, v);
    next.stress = v;
  }

  for (const [mechId, mp] of Object.entries<any>(u.mechs || {})) {
    const idx = next.mechs.findIndex((m: any) => String(m.id) === mechId);
    if (idx < 0) continue; // меха прибрали в апці, поки Foundry його міняв
    const m = { ...next.mechs[idx] };
    const name = m.name || 'мех';
    // Максимуми спершу: Foundry рахує їх з повного лоадауту, і поточні значення
    // мають лягти вже під новий максимум.
    if (has(mp, 'hpMax')) { const v = Math.max(1, num(mp.hpMax)); set(`${name}: макс. ХП`, m.hpMax, v); m.hpMax = v; }
    if (has(mp, 'repairMax')) { const v = Math.max(0, num(mp.repairMax)); set(`${name}: макс. рем. комплектів`, m.repairMax, v); m.repairMax = v; }
    if (has(mp, 'hpCurrent')) { const v = clamp(num(mp.hpCurrent), 0, m.hpMax ?? 999); set(`${name}: ХП`, m.hpCurrent, v); m.hpCurrent = v; }
    if (has(mp, 'repairCurrent')) { const v = clamp(num(mp.repairCurrent), 0, m.repairMax ?? 99); set(`${name}: рем. комплекти`, m.repairCurrent, v); m.repairCurrent = v; }
    if (has(mp, 'structureFilled')) { const v = clamp(num(mp.structureFilled), 0, STRUCTURE_MAX); set(`${name}: структура`, m.structureFilled, v); m.structureFilled = v; }
    if (has(mp, 'reactorFilled')) { const v = clamp(num(mp.reactorFilled), 0, STRUCTURE_MAX); set(`${name}: реактор`, m.reactorFilled, v); m.reactorFilled = v; }
    if (has(mp, 'overcharge')) { const v = clamp(num(mp.overcharge), 0, 3); set(`${name}: Overcharge крок`, m.overcharge, v); m.overcharge = v; }
    if (has(mp, 'corePower')) {
      const v = !!mp.corePower;
      if (v !== (m.corePower !== false)) changes.push(`${name}: Core Power ${v ? 'заряджено' : 'витрачено'}`);
      m.corePower = v;
    }
    if (mp.limited && typeof mp.limited === 'object') {
      m[itemsKey(m)] = itemsOf(m).map((l: any) => {
        const lp = l.max != null && mp.limited[(l.name || '').trim().toLowerCase()];
        if (!lp) return l;
        const out = { ...l };
        if (has(lp, 'max')) { const v = Math.max(0, num(lp.max)); set(`${name} / ${l.name}: макс. зарядів`, out.max, v); out.max = v; }
        if (has(lp, 'current')) { const v = clamp(num(lp.current), 0, out.max ?? 99); set(`${name} / ${l.name}: заряди`, out.current, v); out.current = v; }
        return out;
      });
    }
    next.mechs[idx] = m;
  }

  if (changes.length) {
    const entries = changes.map((c) => ({ ts: nowTs(), msg: `Foundry: ${c}` }));
    next.actionLog = [...entries.reverse(), ...(state.actionLog || [])].slice(0, 300);
    // Позначка для відкритого профілю: цю зміну зробила Foundry, а не він сам, тож її
    // треба влити в стан у пам'яті (mergeFoundryState у клієнті), а не ігнорувати як луну.
    next.foundrySyncAt = new Date().toISOString();
  }
  return { next, changes };
}

async function pushOne(u: any) {
  if (!u?.pilotId || !u?.updatedAt) return { pilotId: u?.pilotId, ok: false, error: 'pilotId і updatedAt обов\'язкові' };
  const { data: row, error } = await db.from('pilots').select('state, updated_at').eq('id', u.pilotId).maybeSingle();
  if (error) return { pilotId: u.pilotId, ok: false, error: error.message };
  if (!row) return { pilotId: u.pilotId, ok: false, error: 'пілота не знайдено' };
  if (new Date(row.updated_at).getTime() !== new Date(u.updatedAt).getTime()) {
    return { pilotId: u.pilotId, ok: false, conflict: true };
  }

  const { next, changes } = applyPatch(row.state || {}, u);
  if (!changes.length) return { pilotId: u.pilotId, ok: true, updatedAt: row.updated_at, changes: 0 };

  // Умова на updated_at робить перевірку вище атомарною: якщо між select і update хтось
  // зберіг пілота в апці, рядок не оновиться і буде conflict.
  const { data: saved, error: upErr } = await db.from('pilots').update({ state: next })
    .eq('id', u.pilotId).eq('updated_at', row.updated_at).select('updated_at');
  if (upErr) return { pilotId: u.pilotId, ok: false, error: upErr.message };
  if (!saved?.length) return { pilotId: u.pilotId, ok: false, conflict: true };
  return { pilotId: u.pilotId, ok: true, updatedAt: saved[0].updated_at, changes: changes.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = await loadKey();
  if (!expected || req.headers.get('x-foundry-key') !== expected) return json({ error: 'Forbidden' }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Очікувався JSON' }, 400);
  }

  try {
    if (body.action === 'pull') return json(await pull());
    if (body.action === 'push') {
      const updates = Array.isArray(body.updates) ? body.updates.slice(0, 100) : [];
      const results = [];
      for (const u of updates) results.push(await pushOne(u));
      return json({ results });
    }
    return json({ error: `Невідома дія: ${body.action}` }, 400);
  } catch (err) {
    console.error('foundry-sync', err);
    return json({ error: String(err) }, 500);
  }
});
