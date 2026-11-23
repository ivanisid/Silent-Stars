// Документи ГМів: розбір старого тексту, документ візуального редактора, згадки, пошук.
// Чиста логіка без React — тести в markup.test.mjs.
//
// Старий текст (до візуального редактора) — розмітка **виділення**, [текст](https://…) і
// згадка @[Назва](<uuid документа>); при відкритті він перетворюється на документ редактора.
// HTML з бази ніколи не вставляється як є.

export const VISIBILITY = [
  { key: 'gms', label: 'ДЛЯ ВСІХ ГМІВ' },
  { key: 'private', label: 'ЛИШЕ ДЛЯ МЕНЕ' },
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

// Документи, які згадують документ id (лише серед тих, що бачить користувач).
export function backlinks(entries, id) {
  const key = String(id).toLowerCase();
  return entries.filter((e) => e.id !== id && (e.doc ? docMentions(e.doc) : mentionedIds(e.body)).has(key));
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

// Пошук у назві й тексті; новіші зміни першими.
export function filterDocs(docs, q = '') {
  const needle = q.trim().toLowerCase();
  const time = (d) => {
    const t = Date.parse(d.updatedAt || d.createdAt || '');
    return Number.isNaN(t) ? 0 : t;
  };
  return docs
    .filter((d) => !needle || d.title.toLowerCase().includes(needle) || d.body.toLowerCase().includes(needle))
    .sort((a, b) => time(b) - time(a));
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// ----- Документ візуального редактора (JSON TipTap) -----
// Зберігається в chronicle_entries.doc. Старі документи (лише body з розміткою) перетворюються
// на документ при відкритті. body лишається простим текстом документа — для пошуку.

const textNode = (text, marks) => (marks && marks.length ? { type: 'text', text, marks } : { type: 'text', text });

function inlineNodes(tokens, marks = []) {
  const out = [];
  tokens.forEach((x) => {
    if (x.t === 'text') {
      x.v.split('\n').forEach((part, i) => {
        if (i > 0) out.push({ type: 'hardBreak' });
        if (part) out.push(textNode(part, marks));
      });
    } else if (x.t === 'bold') out.push(...inlineNodes(x.v, [...marks, { type: 'bold' }]));
    else if (x.t === 'link') out.push(textNode(x.v, [...marks, { type: 'link', attrs: { href: x.href } }]));
    else if (x.t === 'mention') out.push({ type: 'mention', attrs: { id: x.id, label: x.v } });
  });
  return out;
}

export function legacyToDoc(body) {
  const content = paragraphs(body).map((p) => {
    const nodes = inlineNodes(tokenize(p));
    return nodes.length ? { type: 'paragraph', content: nodes } : { type: 'paragraph' };
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

export const entryDoc = (e) => (e?.doc && e.doc.type === 'doc' ? e.doc : legacyToDoc(e?.body || ''));

function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  (node.content || []).forEach((c) => walk(c, fn));
}

const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock']);

// Простий текст документа: блоки — окремими рядками, згадка — її назвою.
export function docText(doc) {
  const lines = [];
  let line = '';
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  const go = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'text') line += n.text || '';
    else if (n.type === 'mention') line += n.attrs?.label || '';
    else if (n.type === 'hardBreak') line += ' ';
    if (BLOCKS.has(n.type) && !(n.content || []).some((c) => BLOCKS.has(c.type) || c.type === 'bulletList' || c.type === 'orderedList')) {
      (n.content || []).forEach(go);
      flush();
      return;
    }
    (n.content || []).forEach(go);
  };
  go(doc);
  flush();
  return lines.join('\n');
}

export function docMentions(doc) {
  const ids = new Set();
  walk(doc, (n) => n.type === 'mention' && n.attrs?.id && ids.add(String(n.attrs.id).toLowerCase()));
  return ids;
}

export function docImagePaths(doc) {
  const paths = [];
  walk(doc, (n) => n.type === 'image' && n.attrs?.path && !paths.includes(n.attrs.path) && paths.push(n.attrs.path));
  return paths;
}

// Перед збереженням: у картинок зі сховища лишається шлях, тимчасова адреса прибирається.
export function stripImageSrc(doc) {
  const go = (n) => {
    if (!n || typeof n !== 'object') return n;
    const next = { ...n };
    if (n.type === 'image' && n.attrs?.path) next.attrs = { ...n.attrs, src: null };
    if (n.content) next.content = n.content.map(go);
    return next;
  };
  return go(doc);
}

// Для редактора: картинкам зі сховища підставляється тимчасова адреса.
export function fillImageSrc(doc, urls) {
  const go = (n) => {
    if (!n || typeof n !== 'object') return n;
    const next = { ...n };
    if (n.type === 'image' && n.attrs?.path) next.attrs = { ...n.attrs, src: urls[n.attrs.path] || null };
    if (n.content) next.content = n.content.map(go);
    return next;
  };
  return go(doc);
}

export const safeHref = (href) => (/^https?:\/\//i.test(String(href || '')) ? href : null);
