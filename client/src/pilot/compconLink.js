// Прив'язка пілота до COMP/CON за share code (див. docs/compcon-link-spec.md). Чиста логіка —
// тестується простим `node` (compconLink.test.mjs).
//
// state.compcon: { code, version, acceptedAt, level, checkedAt, error }
//   code       — share code пілота в COMP/CON (12 символів, v3);
//   version    — `updated` (мс) версії, яку гравець прийняв в апку;
//   acceptedAt — коли апка прийняла цю версію («остання зміна»);
//   level      — LL з прийнятого файлу (для попередження «рівень не збігається»);
//   checkedAt, error — остання перевірка коду й її помилка ('' — без помилки).

export const EMPTY_LINK = { code: '', version: 0, acceptedAt: '', level: null, checkedAt: '', error: '' };

export function normalizeShareCode(s) {
  return String(s || '').trim().toUpperCase();
}

export function isShareCode(s) {
  return /^[A-Z0-9]{12}$/.test(normalizeShareCode(s));
}

// Файл з хмари COMP/CON — пілот без обгортки експорту; імпорт апки приймає обгортку «Save Pilot».
export function wrapCloudPilot(data) {
  return { EXPORT_TYPE: 'Save Pilot', data };
}

// ---------- Статуси (рішення користувача 17.10.2026) ----------

export const CC_ACTIVE = 'КОД АКТИВНИЙ';
export const CC_INACTIVE = 'КОД НЕ АКТИВНИЙ';
export const FV_PENDING = 'ЗМІНА ПОТРЕБУЄ ПІДТВЕРДЖЕННЯ НА FOUNDRY';
export const FV_READY = 'ПІЛОТ ГОТОВИЙ ДО ЗАВДАННЯ';
export const FV_PARTIAL = 'ЧАСТКОВО ГОТОВИЙ';
export const FV_NONE = 'СИНХРОНІЗАЦІЯ ВІДСУТНЯ';

const pad = (n) => String(n).padStart(2, '0');
export function fmtStamp(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// COMP/CON: код є, остання перевірка без помилки і версію хоч раз прийнято.
export function ccStatus(link) {
  const l = link || EMPTY_LINK;
  const active = !!l.code && !l.error && !!l.version;
  return { active, text: active ? CC_ACTIVE : CC_INACTIVE, at: active ? fmtStamp(l.acceptedAt) : '' };
}

// Зв'язок з Foundry вважається робочим, якщо модуль звітував про нього за останні 14 днів:
// між іграми синхронізація мовчить (ГМ не тримає світ відкритим), але бій іде лише там.
const LINK_FRESH_MS = 14 * 24 * 3600e3;

export function freshLink(link) {
  if (!link?.seenAt) return null;
  const t = new Date(link.seenAt).getTime();
  return Number.isFinite(t) && Date.now() - t < LINK_FRESH_MS ? link : null;
}

// FOUNDRY для меха. link — { actor, seenAt } з foundry_mech_links або undefined; pending — у
// зв'язаного актора старіша версія білду, ніж прийнята в апці. Версію білду актора модуль почне
// звітувати на етапі Foundry (spec §6.3); до того pending не передається.
export function mechFoundryStatus(link, pending = false) {
  if (!link) return { tone: '', text: FV_NONE };
  if (pending) return { tone: 'warn', text: FV_PENDING };
  return { tone: 'ok', text: FV_READY };
}

// Зведений FOUNDRY пілота з усіх його мехів.
export function pilotFoundryStatus(mechStatuses) {
  const list = mechStatuses || [];
  if (list.some((s) => s.text === FV_PENDING)) return { tone: 'warn', text: FV_PENDING };
  const ready = list.filter((s) => s.text === FV_READY).length;
  if (list.length && ready === list.length) return { tone: 'ok', text: FV_READY };
  if (ready) return { tone: 'warn', text: FV_PARTIAL };
  return { tone: '', text: FV_NONE };
}

// ---------- Що зміниться в мехах ----------

const key = (s) => String(s || '').trim().toLowerCase();
const ROMAN = ['', 'I', 'II', 'III'];
const talentLabel = (t) => `${t.name}${ROMAN[t.rank] ? ` ${ROMAN[t.rank]}` : ''}`;

function listDiff(before, after) {
  const count = (xs) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) || 0) + 1), new Map());
  const b = count(before);
  const a = count(after);
  const add = [];
  const remove = [];
  const seenA = new Map();
  for (const x of after) {
    const k = key(x);
    seenA.set(k, (seenA.get(k) || 0) + 1);
    if (seenA.get(k) > (b.get(k) || 0)) add.push(x);
  }
  const seenB = new Map();
  for (const x of before) {
    const k = key(x);
    seenB.set(k, (seenB.get(k) || 0) + 1);
    if (seenB.get(k) > (a.get(k) || 0)) remove.push(x);
  }
  return { add, remove };
}

const names = (m, type) => (m?.items || []).filter((it) => it.type === type).map((it) => it.name);
const talents = (m) => (m?.build?.talents || []).map(talentLabel);

// Групи змін одного слота: ФРЕЙМ, ЗБРОЯ, СИСТЕМИ, ТАЛАНТИ. old — мех в апці (або null для нового).
export function mechDiff(old, inc) {
  const frame = (m) => [m?.frameSource, m?.frame].filter(Boolean).join(' ');
  const groups = [];
  const f0 = frame(old);
  const f1 = frame(inc);
  if (!old || key(f0) !== key(f1)) groups.push({ title: 'ФРЕЙМ', lines: [...(old && f0 ? [{ sign: '−', text: f0 }] : []), { sign: '+', text: f1 }] });
  for (const [title, get] of [['ЗБРОЯ', (m) => names(m, 'weapon')], ['СИСТЕМИ', (m) => names(m, 'system')], ['ТАЛАНТИ', talents]]) {
    const d = listDiff(old ? get(old) : [], get(inc));
    const lines = [...d.add.map((text) => ({ sign: '+', text })), ...d.remove.map((text) => ({ sign: '−', text }))];
    if (lines.length) groups.push({ title, lines });
  }
  return groups;
}
