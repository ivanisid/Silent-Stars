// Документи ГМів: старий текст, документ редактора, згадки, пошук.
// Запуск: node client/src/gmdocs/markup.test.mjs

import assert from 'node:assert/strict';
import {
  backlinks, docImagePaths, docMentions, docText, entryDoc, fillImageSrc, filterDocs, formatDate, legacyToDoc,
  mentionedIds, mentionSuggestions, paragraphs, safeHref, stripImageSrc, tokenize, visibilityLabel,
} from './markup.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

test('розмітка: текст, виділення, посилання, згадка', () => {
  assert.deepEqual(tokenize(`До **${'бару'}** [сайт](https://x.ua) і @[Барон Еш](${A}).`), [
    { t: 'text', v: 'До ' },
    { t: 'bold', v: [{ t: 'text', v: 'бару' }] },
    { t: 'text', v: ' ' },
    { t: 'link', v: 'сайт', href: 'https://x.ua' },
    { t: 'text', v: ' і ' },
    { t: 'mention', v: 'Барон Еш', id: A },
    { t: 'text', v: '.' },
  ]);
});

test('згадка без uuid і посилання не на http — звичайний текст', () => {
  assert.deepEqual(tokenize('@[X](abc) [y](javascript:alert(1))'), [{ t: 'text', v: '@[X](abc) [y](javascript:alert(1))' }]);
});

test('згадка всередині виділення теж рахується', () => {
  assert.deepEqual([...mentionedIds(`**@[A](${A})** і @[B](${B.toUpperCase()})`)], [A, B]);
});

test('абзаци — через порожній рядок', () => {
  assert.deepEqual(paragraphs('раз\nдва\n\n\nтри\n \n'), ['раз\nдва', 'три']);
});

test('зворотні посилання: хто згадує запис', () => {
  const entries = [
    { id: A, body: '' },
    { id: B, body: `бачили @[A](${A})` },
    { id: C, body: `нічого` },
  ];
  assert.deepEqual(backlinks(entries, A).map((e) => e.id), [B]);
  assert.deepEqual(backlinks(entries, B), []);
});

test('підказки: спершу ті, що починаються з запиту; без себе', () => {
  const entries = [{ id: A, title: 'Старий Барон' }, { id: B, title: 'Барон Еш' }, { id: C, title: 'Бар «Зірка»' }];
  assert.deepEqual(mentionSuggestions(entries, 'бар', C).map((e) => e.id), [B, A]);
});

test('пошук у назві й тексті; новіші зміни першими', () => {
  const docs = [
    { id: 'a', title: 'Барон', body: '', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'b', title: 'Гра 1', body: 'барон утік', updatedAt: '2026-03-01T00:00:00Z' },
    { id: 'c', title: 'Станція', body: '', updatedAt: '2026-02-01T00:00:00Z' },
  ];
  assert.deepEqual(filterDocs(docs).map((d) => d.id), ['b', 'c', 'a']);
  assert.deepEqual(filterDocs(docs, ' БАРОН ').map((d) => d.id), ['b', 'a']);
});

test('доступ: два варіанти', () => {
  assert.equal(visibilityLabel('gms'), 'ДЛЯ ВСІХ ГМІВ');
  assert.equal(visibilityLabel('private'), 'ЛИШЕ ДЛЯ МЕНЕ');
  assert.equal(visibilityLabel('players'), '');
});

test('дата: день календаря без зсуву поясу', () => {
  assert.equal(formatDate('2026-11-06'), '06.11.2026');
  assert.equal(formatDate(''), '');
});

test('старий текст → документ редактора: абзаци, переноси, виділення, посилання, згадки', () => {
  assert.deepEqual(legacyToDoc(`Раз **два**\nтри\n\n[сайт](https://x.ua) @[Барон](${A})`), {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Раз ' }, { type: 'text', text: 'два', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }, { type: 'text', text: 'три' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'сайт', marks: [{ type: 'link', attrs: { href: 'https://x.ua' } }] }, { type: 'text', text: ' ' }, { type: 'mention', attrs: { id: A, label: 'Барон' } }] },
    ],
  });
  assert.deepEqual(legacyToDoc(''), { type: 'doc', content: [{ type: 'paragraph' }] });
  assert.deepEqual(entryDoc({ doc: { type: 'doc', content: [] }, body: 'x' }), { type: 'doc', content: [] });
});

const DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Барон' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Друг ' }, { type: 'mention', attrs: { id: B.toUpperCase(), label: 'Еш' } }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'пункт' }] }] }] },
    { type: 'image', attrs: { path: 'u/1.png', src: 'https://signed/1' } },
    { type: 'image', attrs: { path: null, src: 'https://web/2.png' } },
  ],
};

test('документ: простий текст, згадки, картинки зі сховища', () => {
  assert.equal(docText(DOC), 'Барон\nДруг Еш\nпункт');
  assert.deepEqual([...docMentions(DOC)], [B]);
  assert.deepEqual(docImagePaths(DOC), ['u/1.png']);
});

test('адреса картинки: прибирається перед збереженням і підставляється для редактора', () => {
  const stripped = stripImageSrc(DOC);
  assert.equal(stripped.content[3].attrs.src, null);
  assert.equal(stripped.content[4].attrs.src, 'https://web/2.png');
  assert.equal(DOC.content[3].attrs.src, 'https://signed/1');
  assert.equal(fillImageSrc(stripped, { 'u/1.png': 'https://new' }).content[3].attrs.src, 'https://new');
});

test('зворотні посилання бачать згадки і в документі, і в старому тексті', () => {
  assert.deepEqual(backlinks([{ id: A, doc: DOC, body: '' }, { id: C, body: `@[x](${B})` }], B).map((e) => e.id), [A, C]);
});

test('посилання лише http(s)', () => {
  assert.equal(safeHref('https://a'), 'https://a');
  assert.equal(safeHref('javascript:alert(1)'), null);
});

console.log(`\n${n} tests passed`);
