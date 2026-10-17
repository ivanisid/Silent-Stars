// Спільне для foundry-sync (ГМ, ключ синхронізації) і foundry-hub (гравець, сесія апки):
// пілоти у формі, яку бачить модуль Foundry, файл COMP/CON меха і звіт зв'язків мехів.

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export const itemsKey = (m: any) => (Array.isArray(m.items) ? 'items' : 'limited');
export const itemsOf = (m: any) => m[itemsKey(m)] || [];

export type Art = Map<string, { id: string; path: string }>;

function toSyncMech(m: any, art: Art, pilotId: string, profiles: Map<string, number>) {
  const a = art.get(`${pilotId}:mech:${m.id}`);
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
    // Уся зброя й системи — для позначки «знищено» (зіставлення за назвою).
    items: itemsOf(m).map((l: any) => ({ name: l.name || '', destroyed: !!l.destroyed })),
    art: a?.path || null,
    artId: a?.id || null,
    // Є файл COMP/CON — з нього модуль може створити актора.
    hasProfile: profiles.has(`${pilotId}:${m.id}`),
    // Версія білду — час файлу COMP/CON (мс); модуль порівнює її з прапорцем build актора.
    build: profiles.get(`${pilotId}:${m.id}`) || 0,
  };
}

// Адреса апки (той самий секрет, що й для кнопок у Discord) — для кнопки МАГАЗИН у Foundry.
const APP_URL = (Deno.env.get('APP_URL') || '').replace(/\/+$/, '');

// Каталог магазину (shop_items, shop_settings) — для капу PR і назв страхових полісів.
type Shop = { items: Map<string, any>; capBase: number };

export const loadShopItems = (db: SupabaseClient) => db.from('shop_items').select('key, kind, title, params, updated_at');
export const loadShopSettings = (db: SupabaseClient) => db.from('shop_settings').select('pr_cap_base, updated_at').maybeSingle();

function shopOf(items: any[], settings: any): Shop {
  return { items: new Map(items.map((it) => [it.key, it])), capBase: num(settings?.pr_cap_base) || 100 };
}

// Кап PR — як private.pr_cap() і prCapFor() в апці: «Трастовий фонд» (buffer) піднімає його
// до свого cap.
function prCapOf(s: any, shop: Shop) {
  if (num(s.hangar?.owned?.buffer) >= 1) return num(shop.items.get('buffer')?.params?.cap) || 200;
  return shop.capBase;
}

// Куплені й ще не використані поліси — назвами з каталогу; з «Страховим фондом
// покращення» (insure2) пакет із upgraded показується під новою назвою, як insurancePack() в апці.
function policiesOf(s: any, shop: Shop) {
  const owned = s.hangar?.owned || {};
  return Object.keys(s.hangar?.policies || {})
    .filter((k) => s.hangar.policies[k])
    .map((k) => {
      const it = shop.items.get(k);
      if (!it) return k;
      return (owned.insure2 && it.params?.upgraded?.title) || it.title;
    });
}

function toSyncPilot(p: any, nicks: Map<string, string>, art: Art, profiles: Map<string, number>, shop: Shop) {
  const s = p.state || {};
  const portrait = art.get(`${p.id}:portrait`);
  return {
    id: p.id,
    // Акаунт апки власника — модуль за ним знаходить користувача Foundry (прапорець appUserId)
    // і робить його власником акторів.
    userId: p.user_id,
    name: p.name,
    callsign: p.callsign,
    player: nicks.get(p.user_id) || '',
    status: s.status || 'active',
    ll: s.ll ?? 2,
    hpCurrent: num(s.hp?.current),
    hpMax: num(s.hp?.max),
    stress: num(s.stress),
    stressMax: num(s.stressMax ?? 8),
    // Лише для показу в чаркуші пілота у Foundry, назад не синхронізуються.
    mana: num(s.mana?.balance),
    pr: num(s.pr),
    prCap: prCapOf(s, shop),
    // Поліси показуються лише зі «Страховим фондом» (insure) — без нього вкладки страховки немає.
    insured: num(s.hangar?.owned?.insure) >= 1,
    policies: policiesOf(s, shop),
    shopUrl: APP_URL ? `${APP_URL}/pilots/${p.id}?shop=repair` : null,
    // Прив'язка до COMP/CON за share code — як ccStatus() в апці (client/src/pilot/compconLink.js).
    ccActive: !!(s.compcon?.code && !s.compcon?.error && s.compcon?.version),
    bondXp: num(s.bond?.xp),
    bondChecks: Array.from({ length: 5 }, (_, i) => !!s.bond?.checks?.[i]),
    bondPick: num(s.bond?.pick),
    minorIdeals: Array.isArray(s.bond?.minorIdeals) ? s.bond.minorIdeals : [],
    portrait: portrait?.path || null,
    portraitId: portrait?.id || null,
    mechs: (s.mechs || []).map((m: any) => toSyncMech(m, art, p.id, profiles)),
    updatedAt: p.updated_at,
  };
}

export const loadArts = (db: SupabaseClient) =>
  db.from('art_uploads').select('id, pilot_id, kind, mech_id, foundry_path')
    .is('deleted_at', null).not('foundry_path', 'is', null);

// Сирі рядки для pull: пілоти (усі або лише власника userId), ніки, арти, файли COMP/CON,
// магазин. foundry-sync рахує з них ще й відбиток.
export async function loadPull(db: SupabaseClient, userId?: string) {
  let pilotsQ = db.from('pilots').select('id, user_id, name, callsign, state, updated_at');
  if (userId) pilotsQ = pilotsQ.eq('user_id', userId);
  const [{ data: pilots, error }, { data: users }, { data: arts }, { data: cc }, { data: items }, { data: settings }] = await Promise.all([
    pilotsQ,
    db.from('profiles').select('id, nick'),
    loadArts(db),
    db.from('pilot_compcon').select('pilot_id, mech_id, updated_at'),
    loadShopItems(db),
    loadShopSettings(db),
  ]);
  if (error) throw new Error(error.message);
  return { pilots: pilots || [], users: users || [], arts: arts || [], cc: cc || [], items: items || [], settings };
}

export function toSyncPilots(raw: Awaited<ReturnType<typeof loadPull>>) {
  const nicks = new Map(raw.users.map((r: any) => [r.id, r.nick]));
  const art: Art = new Map();
  for (const a of raw.arts) {
    art.set(a.kind === 'portrait' ? `${a.pilot_id}:portrait` : `${a.pilot_id}:mech:${a.mech_id}`, { id: a.id, path: a.foundry_path });
  }
  const profiles = new Map(raw.cc.map((r: any) => [`${r.pilot_id}:${r.mech_id}`, Date.parse(r.updated_at) || 0]));
  const shop = shopOf(raw.items, raw.settings);
  return raw.pilots.map((p: any) => toSyncPilot(p, nicks, art, profiles, shop));
}

// Файл COMP/CON для цього меха (pilot_compcon), з якого модуль створює актора-пілота й меха
// імпортом системи Lancer.
export async function loadProfile(db: SupabaseClient, pilotId: string, mechId: string) {
  const { data, error } = await db.from('pilot_compcon').select('data')
    .eq('pilot_id', pilotId).eq('mech_id', String(mechId)).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { error: 'Для цього меха немає файлу COMP/CON — гравцю треба завантажити його в апці.' };
  return { data: data.data };
}

// Звіт зв'язків мехів світу Foundry → foundry_mech_links. Без onlyPilots — замінює весь список
// світу (ГМ бачить усіх акторів); з onlyPilots — лише рядки цих пілотів (звіт гравця про своїх).
export async function saveLinks(db: SupabaseClient, world: string, list: any[], onlyPilots?: string[]) {
  if (!world) return { error: 'world обов\'язковий' };
  const seen = new Date().toISOString();
  const allowed = onlyPilots ? new Set(onlyPilots) : null;
  const rows = new Map<string, any>();
  for (const l of list) {
    const pilotId = String(l?.pilotId || '');
    const mechId = String(l?.mechId || '');
    if (!pilotId || !mechId || (allowed && !allowed.has(pilotId))) continue;
    rows.set(`${pilotId}:${mechId}`, {
      world, pilot_id: pilotId, mech_id: mechId, actor_name: String(l?.actor || '').slice(0, 200), seen_at: seen,
      // Версія білду актора (мс) — для статусу «зміна потребує підтвердження» в апці.
      build: Number.isFinite(Number(l?.build)) && l?.build != null ? Math.round(Number(l.build)) : null,
    });
  }
  // Зв'язки до пілотів, яких уже немає, відкидає FK — тому пілоти перевіряються заздалегідь.
  const ids = [...new Set([...rows.values()].map((r) => r.pilot_id))];
  const { data: alive, error: e1 } = ids.length
    ? await db.from('pilots').select('id').in('id', ids)
    : { data: [], error: null };
  if (e1) throw new Error(e1.message);
  const ok = new Set((alive || []).map((p: any) => p.id));
  const fresh = [...rows.values()].filter((r) => ok.has(r.pilot_id));

  let del = db.from('foundry_mech_links').delete().eq('world', world);
  if (onlyPilots) {
    if (!onlyPilots.length) return { ok: true, count: 0 };
    del = del.in('pilot_id', onlyPilots);
  }
  const { error: e2 } = await del;
  if (e2) throw new Error(e2.message);
  if (fresh.length) {
    let { error: e3 } = await db.from('foundry_mech_links').insert(fresh);
    // Колонки build ще немає (міграція 20261017c не застосована) — зв'язки без версії.
    if (e3 && /build/.test(e3.message)) {
      ({ error: e3 } = await db.from('foundry_mech_links').insert(fresh.map(({ build: _b, ...r }) => r)));
    }
    if (e3) throw new Error(e3.message);
  }
  return { ok: true, count: fresh.length };
}
