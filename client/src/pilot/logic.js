import { MANA_BASE_COST, TIER_MANA_STEP, MAX_LL } from './constants';

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function nowTs() {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Тір 1 — LL2–LL5, Тір 2 — LL6–LL10, Тір 3 — LL11–LL12. Гра починається з LL2,
// тож нижче другого рівня ліцензії тіру немає.
export function llTier(ll) {
  if (ll <= 1) return '0';
  if (ll <= 5) return '1';
  if (ll <= 10) return '2';
  return '3';
}

// Скільки мани коштує підвищення з ll на ll+1.
//
// Перший перехід коштує MANA_BASE_COST, кожен наступний — на крок дорожче за попередній,
// а крок береться за тіром рівня, З ЯКОГО йде підвищення. Тому підвищення, що переводить
// у наступний тір, дорожчає ще кроком поточного тіру, а не нового: LL5→LL6 крокує на +100
// як решта Тіру 1, а не на +200.
//
// Повертає null для ll поза межами LL2..MAX_LL-1 — підвищувати нема з чого або нема куди.
export function manaLevelCost(ll) {
  if (!Number.isInteger(ll) || ll < 2 || ll >= MAX_LL) return null;
  let cost = MANA_BASE_COST;
  for (let target = 3; target <= ll; target++) {
    cost += TIER_MANA_STEP[llTier(target)];
  }
  return cost;
}

// Накопичена мана, потрібна щоб дійти з LL2 до вказаного рівня.
export function manaTotalToLevel(ll) {
  if (!Number.isInteger(ll) || ll < 2 || ll > MAX_LL) return null;
  let total = 0;
  for (let from = 2; from < ll; from++) total += manaLevelCost(from);
  return total;
}

export function skillCapMax(ll, skillCapBonus) {
  return 6 + Math.max(0, ll - 2) + (skillCapBonus || 0);
}

export function skillCapUsed(skillTriggers) {
  return (skillTriggers || []).reduce((sum, t) => sum + t.level, 0);
}

// Classic "click to set level, click the topmost filled again to reduce by one" segment track.
export function toggleFilled(cur, idx) {
  return cur === idx + 1 ? idx : idx + 1;
}

// Builds `count` segment descriptors for a fillable track (stress, burdens, bond XP, mech
// structure/reactor). Consumers render one box per descriptor and call onClick(i) on click.
export function buildSegs(filled, count) {
  return Array.from({ length: count }, (_, i) => ({ filled: i < filled, idx: i }));
}

// Ідентифікатор для нового елемента списку. Date.now() сам по собі не годиться:
// два елементи, створені в одну мілісекунду, дістають однаковий id, і видалення
// одного прибирає обидва. Тримаємось часової мітки, але гарантуємо унікальність.
export function newId(items) {
  const maxExisting = (items || []).reduce((m, it) => Math.max(m, Number(it.id) || 0), 0);
  return Math.max(Date.now(), maxExisting + 1);
}

// Розмір лічильника burden-а задається не вибором, а порядковим номером серед
// невилікуваних: перший — 4 сегменти, другий — 6, третій — 8. Вилікуваний burden
// звільняє місце, тож наступний знову починається з меншого.
export const BURDEN_SIZES = [4, 6, 8];

// Скільки сегментів матиме наступний burden при activeCount невилікуваних.
// null означає, що наступний був би четвертим — а це смерть персонажа.
export function nextBurdenSize(activeCount) {
  return activeCount < BURDEN_SIZES.length ? BURDEN_SIZES[activeCount] : null;
}

export function burdenLabel(size) {
  return `${size} СЕГМЕНТІВ`;
}

export function shopPrice(item) {
  return item ? item.price : 0;
}

export function rollTier(total) {
  if (total >= 20) return '20+';
  if (total >= 10) return '10–19';
  return '1–9';
}

export function relationshipLabel(rel) {
  if (rel === 'good') return 'ГАРНО';
  if (rel === 'bad') return 'ПОГАНО';
  return 'НЕЙТРАЛЬНО';
}

export function nextRelationship(rel) {
  const order = ['bad', 'neutral', 'good'];
  const idx = order.indexOf(rel);
  return order[(idx + 1) % order.length];
}

export function logEntry(msg) {
  return { ts: nowTs(), msg };
}

export function pushLog(actionLog, msg) {
  return [logEntry(msg), ...actionLog].slice(0, 300);
}
