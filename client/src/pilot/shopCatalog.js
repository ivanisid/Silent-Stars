// Каталог магазину й особистих покращень. Живе в базі (таблиці shop_items і shop_settings —
// див. 20261017_shop_catalog.sql): ГМ змінює ціни, тексти й параметри, додає позиції й
// покращення та ховає будь-які з них (розділ «МАГАЗИН» у ГМ-панелі).
//
// Редюсер читає каталог синхронно, тож він тримається в модулі й вантажиться один раз на
// сесію; компоненти підписуються через useShopCatalog. Поки каталог не прийшов (або не
// прийшов зовсім), діють значення з constants.js — з них же наповнено базу.
//
// Механіку мають лише вбудовані ключі (kit, kitsfull, refill, prfull, mfull, core, prpack,
// recover, structure, reactor, clone, buffer, insure, insure2, parking). Позиція, додана ГМом,
// лише списує ціну й пише запис у журнал; нове покращення — позначка «придбано» й тексти.
//
// Приховане (archived) не продається, але те, що пілот уже має (покращення, внесок,
// поліс), лишається видимим і діє.
//
// Форма позицій:
//   printer / shop  { key, kind, title, pr, mana, archived, tiers? (refill), size? (prpack) }
//   insurance       { key, kind, title, desc, pr, mana, mech, upgraded?, archived }
//   upgrade         { key, kind, group, title, mana, pr, quote, effect[], notes[], requires,
//                     packs, cap? (buffer), archived }

import { useEffect, useSyncExternalStore } from 'react';
import {
  INSURANCE_PACKS,
  LIMITED_REFILL_PR,
  PR_CAP_BASE,
  PR_CAP_BUFFER,
  PR_PACK_SIZE,
  PR_SERVICES,
  PR_START,
  SHOP_DATA,
  UPGRADES,
  UPGRADE_GROUPS,
} from './constants';
import { api } from '../api';

// Категорії каталогу в порядку показу. Ціна будь-якої позиції — PR і мана разом.
export const SHOP_KINDS = [
  { key: 'printer', title: 'PRINTER' },
  { key: 'shop', title: 'SHOP' },
  { key: 'insurance', title: 'INSURANCE' },
  { key: 'upgrade', title: 'ОСОБИСТІ ПОКРАЩЕННЯ' },
];

// Вбудовані ключі з механікою — у редакторі їм не можна змінити вкладку.
export const BUILTIN_KEYS = [
  'kit', 'kitsfull', 'refill', 'prfull', 'mfull', 'core', 'prpack',
  'recover', 'structure', 'reactor', 'clone',
  'buffer', 'insure', 'insure2', 'parking', 'quantum',
];

const MECH_PACKS = ['recover', 'structure', 'reactor'];

const svc = (k) => PR_SERVICES.find((s) => s.key === k);
const lux = (k) => SHOP_DATA.find((s) => s.key === k);

export function defaultCatalog() {
  const items = [
    { key: 'kit', kind: 'printer', title: '1 ремонтний комплект', pr: svc('kit').cost, mana: 0 },
    { key: 'kitsfull', kind: 'printer', title: svc('kitsfull').title, pr: svc('kitsfull').cost, mana: 0 },
    { key: 'refill', kind: 'printer', title: svc('refillone').title, pr: 0, mana: 0, tiers: { ...LIMITED_REFILL_PR } },
    { key: 'prfull', kind: 'printer', title: svc('fullrepair').title, pr: svc('fullrepair').cost, mana: 0 },
    { key: 'mfull', kind: 'shop', title: lux('fullrepair').title, pr: 0, mana: lux('fullrepair').price },
    { key: 'core', kind: 'shop', title: lux('core').title, pr: 0, mana: lux('core').price },
    { key: 'prpack', kind: 'shop', title: 'Printer Requisition', pr: 0, mana: lux('prpack').price, size: PR_PACK_SIZE },
    ...INSURANCE_PACKS.map((p) => ({
      key: p.key,
      kind: 'insurance',
      title: p.title,
      desc: p.desc,
      pr: p.pr,
      mana: p.mana,
      mech: p.mech,
      ...(p.upgraded ? { upgraded: { ...p.upgraded } } : {}),
    })),
    ...UPGRADES.map((u) => ({
      key: u.key,
      kind: 'upgrade',
      group: u.group,
      title: u.title,
      mana: u.mana,
      pr: u.pr,
      quote: u.quote,
      effect: [...u.effect],
      notes: [...u.notes],
      requires: u.requires || '',
      packs: !!u.packs,
      ...(u.key === 'buffer' ? { cap: PR_CAP_BUFFER } : {}),
    })),
  ].map((it, i) => ({ archived: false, sort: i + 1, ...it }));
  return { items, settings: { prStart: PR_START, prCapBase: PR_CAP_BASE } };
}

// Що з рядка бази лишити, а що доповнити: механічні прапорці вбудованих ключів
// беруться з коду, а не з бази.
export function normalizeItem(it) {
  const out = { ...it };
  if (out.kind === 'insurance') out.mech = MECH_PACKS.includes(out.key);
  if (out.kind === 'upgrade') {
    out.packs = out.key === 'insure';
    out.effect = out.effect || [];
    out.notes = out.notes || [];
    out.requires = out.requires || '';
    out.group = out.group || '';
  }
  return out;
}

const DEFAULT = defaultCatalog();
let catalog = { ...DEFAULT, loaded: false, error: '' };
let pending = null;
const listeners = new Set();

function setCatalog(next) {
  catalog = next;
  listeners.forEach((fn) => fn());
}

// force — після правки ГМа; інакше повторні виклики ділять один запит.
export function loadShopCatalog(force = false) {
  if (pending && !force) return pending;
  if (catalog.loaded && !force) return Promise.resolve(catalog);
  pending = api
    .listShopCatalog()
    .then(({ items, settings }) => {
      // Порожня таблиця (міграцію ще не наповнено) — лишаємо значення з коду.
      if (!items.length) {
        setCatalog({ ...DEFAULT, loaded: true, error: '' });
      } else {
        setCatalog({ items: items.map(normalizeItem), settings: { ...DEFAULT.settings, ...settings }, loaded: true, error: '' });
      }
      return catalog;
    })
    .catch((err) => {
      setCatalog({ ...catalog, error: err.message });
      return catalog;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useShopCatalog() {
  const snap = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => catalog,
  );
  useEffect(() => {
    if (!snap.loaded) loadShopCatalog();
  }, [snap.loaded]);
  return snap;
}

const bySort = (a, b) => a.sort - b.sort || a.key.localeCompare(b.key);

// Усі позиції вкладки, разом із прихованими (для редактора й того, що пілот уже має).
export function catalogItems(kind) {
  return catalog.items.filter((it) => it.kind === kind).sort(bySort);
}

export function shopItem(key) {
  return catalog.items.find((it) => it.key === key) || null;
}

// Позицію можна купити: є в каталозі й не прихована.
export function onSale(key) {
  const it = shopItem(key);
  return !!it && !it.archived;
}

export function shopSettings() {
  return catalog.settings;
}

// ---------- Ціни й параметри вбудованих позицій ----------
const fallback = (key) => DEFAULT.items.find((it) => it.key === key);
// Вбудована позиція: з каталогу, а якщо рядка в базі немає — з коду.
export const builtinItem = (key) => shopItem(key) || fallback(key);
const item = builtinItem;

// Ціна — { pr, mana }: покупка списує обидві суми.
export const costOfItem = (it) => ({ pr: it?.pr || 0, mana: it?.mana || 0 });
export const costOf = (key) => costOfItem(item(key));

export function costText(c) {
  return [c.pr ? `${c.pr} PR` : '', c.mana ? `${c.mana} М` : ''].filter(Boolean).join(' + ') || '0 PR';
}

export function canAfford(state, c) {
  return c.pr <= state.pr && c.mana <= state.mana.balance;
}

// Як зміниться гаманець: «PR 70 → 60 · М 500 → 450» — лише валюти, які списуються.
// wallet — { pr, mana }.
export function txText(wallet, c) {
  return [c.pr ? `PR ${wallet.pr} → ${wallet.pr - c.pr}` : '', c.mana ? `М ${wallet.mana} → ${wallet.mana - c.mana}` : '']
    .filter(Boolean)
    .join(' · ');
}

// Чого бракує на покупку — текст для неактивної кнопки, або ''.
export function lackText(state, c) {
  if (c.pr > state.pr) return 'Недостатньо PR';
  if (c.mana > state.mana.balance) return 'Недостатньо мани';
  return '';
}

export const prPackSize = () => item('prpack').size ?? PR_PACK_SIZE;
export const prStart = () => catalog.settings.prStart;

export function refillTiers() {
  return item('refill').tiers || LIMITED_REFILL_PR;
}

// Ціна поповнення лімітних зарядів однієї системи, за її базовим запасом.
// Правила задають 1/2/3 заряди; 4+ трактуємо як 3 (найдешевший щабель).
export function limitedRefillPr(baseMax) {
  const n = Math.max(1, Math.min(3, Number(baseMax) || 1));
  return Number(refillTiers()[n]) || 0;
}

// Повна ціна поповнення: PR за щаблем і мана позиції refill (однакова для всіх щаблів).
export function refillCost(baseMax) {
  return { pr: limitedRefillPr(baseMax), mana: item('refill').mana || 0 };
}

// Назва позиції так, як її бачить гравець: у пачки PR — з розміром.
export function itemTitle(it) {
  return it.key === 'prpack' ? `${it.title} · ${prPackSize()} шт` : it.title;
}

// Кап PR: «Трастовий фонд» (buffer) піднімає його до свого cap. Діє і прихований.
export function prCapFor(owned) {
  const base = catalog.settings.prCapBase;
  if ((owned?.buffer || 0) >= 1) return item('buffer').cap ?? PR_CAP_BUFFER;
  return base;
}

// ---------- Страхові пакети ----------
// Пакет з урахуванням покращення фонду.
export function insurancePack(p, owned) {
  return owned?.insure2 && p.upgraded ? { ...p, ...p.upgraded } : p;
}

// Пакети, які бачить пілот: у продажу, а також ті, поліс яких він уже тримає.
export function insurancePacks(owned, policies = {}) {
  return catalogItems('insurance')
    .filter((p) => !p.archived || policies[p.key])
    .map((p) => insurancePack(p, owned));
}

// ---------- Особисті покращення ----------
export function upgradeByKey(key) {
  const it = shopItem(key);
  return it && it.kind === 'upgrade' ? it : null;
}

// Покращення, які бачить пілот: не приховані, а приховані — лише якщо вже придбані
// або в них є внесок.
export function upgradesFor(hangar) {
  return catalogItems('upgrade').filter((u) => {
    if (!u.archived) return true;
    const d = hangar?.deposits?.[u.key];
    return !!hangar?.owned?.[u.key] || !!(d && (d.mana || d.pr));
  });
}

// Групи — у порядку першої появи; групи з коду йдуть першими.
export function upgradeGroups(list = catalogItems('upgrade')) {
  const seen = [...UPGRADE_GROUPS];
  list.forEach((u) => {
    if (u.group && !seen.includes(u.group)) seen.push(u.group);
  });
  return seen.filter((g) => list.some((u) => u.group === g));
}
