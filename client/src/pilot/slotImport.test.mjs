// Імпорт мехів з COMP/CON у слоти ангару.
// Запуск: node client/src/pilot/slotImport.test.mjs

import assert from 'node:assert/strict';
import { applyAssignment, defaultAssignment, isObvious, profilesFor, sameMech } from './slotImport.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

const mech = (id, name, ccId, over = {}) => ({
  id, name, ccId, hpCurrent: 10, hpMax: 10, repairCurrent: 3, repairMax: 3,
  structureFilled: 0, reactorFilled: 0, overcharge: 0, corePower: true, items: [], ...over,
});
const A = mech(1, 'Godhammer', 'ccA', { hpCurrent: 4, structureFilled: 2 });
const A2 = mech(101, 'Godhammer', 'ccA', { hpMax: 12, hpCurrent: 12 });
const B = mech(102, 'Mastiff', 'ccB');
const C = mech(103, 'Placebo', 'ccC');

test('той самий мех — за ccId, без нього — за назвою', () => {
  assert.ok(sameMech(A, A2));
  assert.ok(!sameMech(A, B));
  assert.ok(sameMech({ name: 'X' }, { name: ' x ' }));
  assert.ok(!sameMech({ name: 'X', ccId: '1' }, { name: 'X', ccId: '2' }));
});

test('один слот, у файлі той самий мех — оновлення без питань, стан лишається', () => {
  const a = defaultAssignment([A], 1, [A2]);
  assert.deepEqual(a, [0]);
  assert.ok(isObvious([A], [A2], a));
  const r = applyAssignment([A], [A2], a);
  assert.equal(r.mechs.length, 1);
  assert.equal(r.mechs[0].id, 1);
  assert.equal(r.mechs[0].hpMax, 12);
  assert.equal(r.mechs[0].hpCurrent, 4);
  assert.equal(r.mechs[0].structureFilled, 2);
  assert.equal(r.changes[0].kind, 'update');
});

test('один слот, у файлі інший мех — треба питати', () => {
  const a = defaultAssignment([A], 1, [B]);
  assert.deepEqual(a, [null]);
  assert.ok(!isObvious([A], [B], a));
});

test('кнопка слота: інший мех замінює меха в цьому слоті', () => {
  const a = defaultAssignment([A], 1, [B], 0);
  assert.deepEqual(a, [0]);
  assert.ok(!isObvious([A], [B], a));
  const r = applyAssignment([A], [B], a);
  assert.equal(r.mechs.length, 1);
  assert.equal(r.mechs[0].id, 102);
  assert.equal(r.changes[0].kind, 'replace');
  assert.equal(r.changes[0].old.name, 'Godhammer');
});

test('кнопка слота: файл з кількома мехами — у слот той самий мех', () => {
  assert.deepEqual(defaultAssignment([A], 1, [B, A2], 0), [1]);
});

test('порожній ангар і три мехи у файлі, слот один — береться перший, треба питати', () => {
  const a = defaultAssignment([], 1, [A2, B, C]);
  assert.deepEqual(a, [0]);
  assert.ok(!isObvious([], [A2, B, C], a));
});

test('два слоти: наявний мех оновлюється, новий іде у вільний', () => {
  const a = defaultAssignment([A], 2, [B, A2]);
  assert.deepEqual(a, [1, 0]);
  assert.ok(isObvious([A], [B, A2], a));
  const r = applyAssignment([A], [B, A2], a);
  assert.deepEqual(r.mechs.map((m) => m.name), ['Godhammer', 'Mastiff']);
  assert.equal(r.mechs[0].id, 1);
});

test('слот без вибору лишається як є', () => {
  const r = applyAssignment([A, C], [B], [null, 0]);
  assert.deepEqual(r.mechs.map((m) => m.name), ['Godhammer', 'Mastiff']);
});

test('один мех у двох слотах — помилка', () => {
  assert.match(applyAssignment([A, C], [B], [0, 0]).error, /кількох слотів/);
});

test('однакові назви після імпорту — помилка', () => {
  const other = mech(104, 'Godhammer', 'ccZ');
  assert.match(applyAssignment([A, C], [other], [null, 0]).error, /Два мехи/);
});

test('файл для Foundry — лише з мехом слота, mechId — id в апці', () => {
  const json = { EXPORT_TYPE: 'Save Pilot', data: { name: 'P', mechs: [{ id: 'ccB', name: 'Mastiff' }, { id: 'ccA', name: 'Godhammer' }] } };
  const r = applyAssignment([A], [A2], [0]);
  const p = profilesFor(r.changes, json);
  assert.equal(p.length, 1);
  assert.equal(p[0].mechId, '1');
  assert.deepEqual(p[0].data.data.mechs.map((m) => m.id), ['ccA']);
});

console.log(`\n${n} тестів пройдено`);
