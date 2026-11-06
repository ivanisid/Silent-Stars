// Хроніка: розмітка, згадки, зворотні посилання, фільтр.
// Запуск: node client/src/chronicle/markup.test.mjs

import assert from 'node:assert/strict';
import {
  backlinks, filterEntries, formatDate, insertMention, mentionedIds, mentionMarkup, mentionQuery, mentionSuggestions, paragraphs, tokenize,
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

test('набір згадки: «@запит» перед курсором', () => {
  assert.deepEqual(mentionQuery('Зустріли @Бар', 13), { start: 9, query: 'Бар' });
  assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
  assert.deepEqual(mentionQuery('Барон @Еш дру', 13), { start: 6, query: 'Еш дру' });
  assert.equal(mentionQuery('mail@host', 9), null);
  assert.equal(mentionQuery('@a\nb', 4), null);
});

test('вставка згадки замінює «@запит» і ставить курсор після неї', () => {
  const text = 'Зустріли @Бар і пішли';
  const mq = mentionQuery(text, 13);
  const r = insertMention(text, mq, { id: A, title: 'Барон [Еш]' }, 13);
  assert.equal(r.text, `Зустріли @[Барон  Еш](${A})  і пішли`);
  assert.equal(r.caret, 9 + mentionMarkup('Барон [Еш]', A).length + 1);
});

test('підказки: спершу ті, що починаються з запиту; без себе', () => {
  const entries = [{ id: A, title: 'Старий Барон' }, { id: B, title: 'Барон Еш' }, { id: C, title: 'Бар «Зірка»' }];
  assert.deepEqual(mentionSuggestions(entries, 'бар', C).map((e) => e.id), [B, A]);
});

test('фільтр: тип, усі теги, пошук; новіші першими', () => {
  const entries = [
    { id: 'r', kind: 'record', title: 'Барон', body: '', tagIds: ['npc', 'fr'], updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'g', kind: 'report', title: 'Гра 1', body: 'барон утік', tagIds: ['npc'], game: { game_at: '2026-03-01T19:00:00Z' } },
    { id: 'e', kind: 'event', title: 'Падіння', body: '', tagIds: [], eventDate: '2026-02-01' },
  ];
  assert.deepEqual(filterEntries(entries).map((e) => e.id), ['g', 'e', 'r']);
  assert.deepEqual(filterEntries(entries, { kind: 'event' }).map((e) => e.id), ['e']);
  assert.deepEqual(filterEntries(entries, { tagIds: ['npc', 'fr'] }).map((e) => e.id), ['r']);
  assert.deepEqual(filterEntries(entries, { q: 'БАРОН' }).map((e) => e.id), ['g', 'r']);
});

test('дата: день календаря без зсуву поясу', () => {
  assert.equal(formatDate('2026-11-06'), '06.11.2026');
  assert.equal(formatDate(''), '');
});

console.log(`\n${n} tests passed`);
