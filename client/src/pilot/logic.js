import { GAMES_TABLE } from './constants';

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

export function computeLL(games) {
  let ll = 2;
  for (let i = 0; i < GAMES_TABLE.length; i++) {
    if (games >= GAMES_TABLE[i]) ll = i + 2;
  }
  return Math.min(ll, 12);
}

export function llTier(ll) {
  if (ll <= 1) return '0';
  if (ll <= 5) return '1';
  if (ll <= 8) return '2';
  return '3';
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

export function burdenSize(type) {
  if (type === 'minor4') return 4;
  if (type === 'middle6') return 6;
  return 8; // major8
}

export function burdenLabel(type) {
  if (type === 'minor4') return 'МІНОРНИЙ · 4';
  if (type === 'middle6') return 'МІДЛ · 6';
  return 'МЕЙДЖОР · 8';
}

export function dcrSpentOf(d) {
  return (d.kits || 0) + 2 * (d.packs || 0) + (d.allRefill ? 2 : 0);
}

export function shopPrice(item, sh) {
  if (!item) return 0;
  if (item.key === 'repair1') return item.price * (sh.qty || 1);
  return item.price;
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

export function nextProjectStatus(status) {
  const order = ['активний', 'призупинено', 'завершено'];
  const idx = order.indexOf(status);
  return order[(idx + 1) % order.length];
}

export function logEntry(msg) {
  return { ts: nowTs(), msg };
}

export function pushLog(actionLog, msg) {
  return [logEntry(msg), ...actionLog].slice(0, 300);
}
