// Повторний імпорт меха: стан лишається, зламане й витрачене не зникає разом із файлом.
// Запуск: node client/src/pilot/mechMerge.test.mjs

import assert from 'node:assert/strict';
import { mergeMechState, pruneRetained, pruneRetainedState, isSpent } from './mechMerge.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

const sys = (name, over = {}) => ({ name, type: 'system', mount: '', destroyed: false, ...over });
const wpn = (name, over = {}) => ({ name, type: 'weapon', mount: 'MAIN', destroyed: false, ...over });
const ltd = (it, current, max = 3) => ({ ...it, current, max, base: max });
const mech = (over = {}) => ({
  id: 7, name: 'Godhammer', ccId: 'cc1', frame: 'Tortuga',
  hpCurrent: 8, hpMax: 12, repairCurrent: 2, repairMax: 4,
  structureFilled: 1, reactorFilled: 2, corePower: false, overcharge: 2, items: [], ...over,
});
const fresh = (over = {}) => mech({
  id: 999, hpCurrent: 12, repairCurrent: 4, structureFilled: 0, reactorFilled: 0, corePower: true, overcharge: 0, ...over,
});
const names = (m) => m.items.map((i) => i.name);

test('стан меха лишається, збірка береться з файлу', () => {
  const r = mergeMechState(mech(), fresh({ frame: 'Tortuga II', hpMax: 14 }));
  assert.equal(r.id, 7);
  assert.equal(r.frame, 'Tortuga II');
  assert.equal(r.hpMax, 14);
  assert.deepEqual(
    [r.hpCurrent, r.repairCurrent, r.structureFilled, r.reactorFilled, r.overcharge, r.corePower],
    [8, 2, 1, 2, 2, false],
  );
});

test('поточні ХП не вищі за новий максимум', () => {
  const r = mergeMechState(mech({ hpCurrent: 12 }), fresh({ hpMax: 9, repairMax: 1 }));
  assert.equal(r.hpCurrent, 9);
  assert.equal(r.repairCurrent, 1);
});

test('невідомі поля старого меха не губляться', () => {
  assert.equal(mergeMechState(mech({ custom: 'x' }), fresh()).custom, 'x');
});

test('заряди лишаються витраченими, не вище нового максимуму', () => {
  const old = mech({ items: [ltd(sys('Rocket'), 1, 3)] });
  assert.equal(mergeMechState(old, fresh({ items: [ltd(sys('Rocket'), 3, 3)] })).items[0].current, 1);
  assert.equal(mergeMechState(old, fresh({ items: [ltd(sys('Rocket'), 4, 4)] })).items[0].current, 1);
  assert.equal(mergeMechState(mech({ items: [ltd(sys('Rocket'), 3, 3)] }), fresh({ items: [ltd(sys('Rocket'), 2, 2)] })).items[0].current, 2);
});

test('зламане в апці лишається зламаним, навіть якщо файл каже «цілий»', () => {
  const old = mech({ items: [wpn('Cannon', { destroyed: true })] });
  assert.equal(mergeMechState(old, fresh({ items: [wpn('Cannon')] })).items[0].destroyed, true);
});

test('зламане у файлі стає зламаним', () => {
  const r = mergeMechState(mech({ items: [wpn('Cannon')] }), fresh({ items: [wpn('Cannon', { destroyed: true })] }));
  assert.equal(r.items[0].destroyed, true);
});

test('новий предмет починається цілим і повним', () => {
  const r = mergeMechState(mech(), fresh({ items: [ltd(sys('Mine'), 3, 3)] }));
  assert.equal(r.items[0].current, 3);
  assert.equal(r.items[0].destroyed, false);
});

test('зламана система, якої немає у файлі, лишається з позначкою', () => {
  const old = mech({ items: [sys('Shield', { destroyed: true })] });
  const r = mergeMechState(old, fresh({ items: [sys('Other')] }));
  assert.deepEqual(names(r), ['Other', 'Shield']);
  assert.equal(r.items[1].retained, true);
  assert.equal(r.items[1].destroyed, true);
});

test('лімітна з витраченим зарядом, якої немає у файлі, лишається', () => {
  const old = mech({ items: [ltd(sys('Rocket'), 2, 3)] });
  const r = mergeMechState(old, fresh({ items: [] }));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].retained, true);
  assert.equal(r.items[0].current, 2);
});

test('цілі й повні системи, яких немає у файлі, зникають', () => {
  const old = mech({ items: [sys('Shield'), ltd(sys('Rocket'), 3, 3), wpn('Cannon')] });
  assert.deepEqual(mergeMechState(old, fresh({ items: [] })).items, []);
});

test('залишена зброя стає після останньої зброї, система — у кінець', () => {
  const old = mech({ items: [wpn('Old gun', { destroyed: true }), sys('Old sys', { destroyed: true })] });
  const r = mergeMechState(old, fresh({ items: [wpn('A'), wpn('B'), sys('C')] }));
  assert.deepEqual(names(r), ['A', 'B', 'Old gun', 'C', 'Old sys']);
});

test('lid: однакова назва, різний lid — різні предмети', () => {
  const old = mech({ items: [sys('Shield', { lid: 'a', destroyed: true })] });
  const r = mergeMechState(old, fresh({ items: [sys('Shield', { lid: 'b' })] }));
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].destroyed, false);
  assert.equal(r.items[1].retained, true);
});

test('lid: перейменований предмет з тим самим lid — той самий', () => {
  const old = mech({ items: [sys('Old name', { lid: 'a', destroyed: true })] });
  const r = mergeMechState(old, fresh({ items: [sys('New name', { lid: 'a' })] }));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].destroyed, true);
});

test('старий запис без lid зіставляється за назвою й типом', () => {
  const old = mech({ items: [sys('Shield', { destroyed: true })] });
  const r = mergeMechState(old, fresh({ items: [sys('shield ', { lid: 'a' })] }));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].destroyed, true);
});

test('дві однакові системи: кожен старий запис відповідає одному новому', () => {
  const old = mech({ items: [sys('Twin', { destroyed: true }), sys('Twin')] });
  const r = mergeMechState(old, fresh({ items: [sys('Twin'), sys('Twin')] }));
  assert.deepEqual(r.items.map((i) => i.destroyed), [true, false]);
});

test('залишена система, що повернулась у файл, перестає бути залишеною', () => {
  const old = mech({ items: [sys('Shield', { destroyed: true, retained: true })] });
  const r = mergeMechState(old, fresh({ items: [sys('Shield')] }));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].retained, undefined);
  assert.equal(r.items[0].destroyed, true);
});

test('залишена система лишається, поки її не полагодять', () => {
  const old = mech({ items: [sys('Shield', { destroyed: true, retained: true })] });
  const r = mergeMechState(old, fresh({ items: [] }));
  assert.equal(r.items[0].retained, true);
});

test('isSpent: зламане або недозаряджене', () => {
  assert.equal(isSpent(sys('A', { destroyed: true })), true);
  assert.equal(isSpent(ltd(sys('A'), 2, 3)), true);
  assert.equal(isSpent(ltd(sys('A'), 3, 3)), false);
  assert.equal(isSpent(sys('A')), false);
  assert.equal(isSpent(null), false);
});

test('pruneRetained: полагоджена залишена система зникає, зламана ні', () => {
  const items = [sys('Fixed', { retained: true }), sys('Broken', { retained: true, destroyed: true }), sys('Plain')];
  assert.deepEqual(pruneRetained(items).map((i) => i.name), ['Broken', 'Plain']);
});

test('pruneRetained: поповнена до максимуму залишена лімітна зникає', () => {
  assert.equal(pruneRetained([{ ...ltd(sys('R'), 3, 3), retained: true }]).length, 0);
  assert.equal(pruneRetained([{ ...ltd(sys('R'), 2, 3), retained: true }]).length, 1);
});

test('pruneRetained: нічого прибирати — той самий масив', () => {
  const items = [sys('A'), sys('B', { retained: true, destroyed: true })];
  assert.equal(pruneRetained(items), items);
});

test('pruneRetainedState: журнал і ідентичність стану', () => {
  const m = mech({ items: [sys('Fixed', { retained: true }), sys('Keep')] });
  const state = { mechs: [m] };
  const seen = [];
  const next = pruneRetainedState(state, (mm, it) => seen.push(`${mm.name}/${it.name}`));
  assert.deepEqual(seen, ['Godhammer/Fixed']);
  assert.deepEqual(next.mechs[0].items.map((i) => i.name), ['Keep']);
  assert.equal(pruneRetainedState(next), next);
});

test('pruneRetainedState: порожній стан (useReducer стартує з null)', () => {
  assert.equal(pruneRetainedState(null), null);
  assert.equal(pruneRetainedState(undefined), undefined);
});

console.log(`\n${n} тестів пройдено`);
