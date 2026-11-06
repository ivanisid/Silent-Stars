// Хроніка: розбір тексту запису й згадок, зворотні посилання, сортування й фільтр списку.
// Чиста логіка без React — тести в markup.test.mjs.
//
// Розмітка тексту: **виділення**, [текст](https://…) і згадка @[Назва](<uuid запису>).
// HTML з бази ніколи не вставляється як є — текст розбирається на вузли.

export const KINDS = [
  { key: 'record', label: 'ЗАПИС' },
  { key: 'report', label: 'ЗВІТ' },
  { key: 'event', label: 'ПОДІЯ' },
];
export const kindLabel = (k) => KINDS.find((x) => x.key === k)?.label || '';

export const VISIBILITY = [
  { key: 'private', label: 'ЛИШЕ Я' },
  { key: 'gms', label: 'ГМИ' },
  { key: 'players', label: 'УСІ' },
];
export const visibilityLabel = (v) => VISIBILITY.find((x) => x.key === v)?.label || '';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const INLINE = new RegExp(`\\*\\*(.+?)\\*\\*|\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)|@\\[([^\\]\\n]+)\\]\\((${UUID})\\)`, 'g');

// Текст → [{ t: 'text', v } | { t: 'bold', v: [...] } | { t: 'link', v, href } | { t: 'mention', v, id }].
export function tokenize(text) {
  const src = String(text ?? '');
  const out = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1] != null) out.push({ t: 'bold', v: tokenize(m[1]) });
    else if (m[2] != null) out.push({ t: 'link', v: m[2], href: m[3] });
    else out.push({ t: 'mention', v: m[4], id: m[5].toLowerCase() });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

// Абзаци — блоки, розділені порожнім рядком.
export const paragraphs = (text) =>
  String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p) => p.trim() !== '');

export const mentionMarkup = (title, id) => `@[${String(title).replace(/[[\]\n]/g, ' ').trim()}](${id})`;

export function mentionedIds(text) {
  const ids = new Set();
  const walk = (tokens) =>
    tokens.forEach((x) => {
      if (x.t === 'mention') ids.add(x.id);
      if (x.t === 'bold') walk(x.v);
    });
  walk(tokenize(text));
  return ids;
}

// Записи, які згадують запис id (лише серед тих, що бачить користувач).
export function backlinks(entries, id) {
  const key = String(id).toLowerCase();
  return entries.filter((e) => e.id !== id && mentionedIds(e.body).has(key));
}

// Згадка, яку зараз набирають: «@запит» перед курсором (після початку рядка чи пробілу).
// Повертає { start, query } або null. start — позиція «@».
export function mentionQuery(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const m = before.match(/(^|\s)@([^@\n[\]()]{0,40})$/);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

export function mentionSuggestions(entries, query, excludeId, limit = 6) {
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => e.id !== excludeId && (!q || e.title.toLowerCase().includes(q)))
    .sort((a, b) => {
      const pa = a.title.toLowerCase().startsWith(q) ? 0 : 1;
      const pb = b.title.toLowerCase().startsWith(q) ? 0 : 1;
      return pa - pb || a.title.localeCompare(b.title, 'uk');
    })
    .slice(0, limit);
}

// Вставити згадку замість «@запит»: повертає { text, caret }.
export function insertMention(text, mq, entry, caret) {
  const markup = `${mentionMarkup(entry.title, entry.id)} `;
  const next = text.slice(0, mq.start) + markup + text.slice(caret);
  return { text: next, caret: mq.start + markup.length };
}

// Дата для сортування: звіт — дата гри, подія — дата події, запис — остання зміна.
export function sortTime(e) {
  const iso = e.kind === 'report' ? e.game?.game_at : e.kind === 'event' ? e.eventDate : null;
  const t = Date.parse(iso || e.updatedAt || e.createdAt || '');
  return Number.isNaN(t) ? 0 : t;
}

// Фільтр списку: тип, усі вибрані теги разом, пошук у назві й тексті.
export function filterEntries(entries, { kind = 'all', tagIds = [], q = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return entries
    .filter((e) => kind === 'all' || e.kind === kind)
    .filter((e) => tagIds.every((t) => e.tagIds.includes(t)))
    .filter((e) => !needle || e.title.toLowerCase().includes(needle) || e.body.toLowerCase().includes(needle))
    .sort((a, b) => sortTime(b) - sortTime(a));
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
