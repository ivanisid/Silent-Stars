// Перевірка логіки злиття без Foundry. Запуск: node foundry-module/silent-stars-sync/scripts/sync.test.mjs

import assert from 'node:assert/strict';
import { decide, mergeFields, mergeLimited, mechMaxPatch, MECH_FIELDS, PILOT_FIELDS, MODULE } from './sync.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

const mechActor = (over = {}, base, time = 0) => ({
  system: {
    hp: { value: 10, max: 12 }, repairs: { value: 3, max: 4 },
    structure: { value: 4, max: 4 }, stress: { value: 4, max: 4 },
    overcharge: 0, core_energy: 1, ...over,
  },
  flags: base ? { [MODULE]: { base } } : {},
  _stats: { modifiedTime: time },
});
const appMech = (over = {}) => ({
  id: '1', name: 'Godhammer', hpCurrent: 10, hpMax: 12, repairCurrent: 3, repairMax: 4,
  structureFilled: 0, reactorFilled: 0, overcharge: 0, corePower: true, limited: [], ...over,
});
const fullBase = { hp: 10, repairs: 3, structure: 0, reactor: 0, overcharge: 0, core: 1 };

test('decide: однакові значення', () => assert.equal(decide(5, 5, 1, 0, 0).winner, 'same'));
test('decide: без бази бере апку', () => assert.deepEqual(decide(5, 7, undefined, 0, 9), { winner: 'app', value: 5 }));
test('decide: змінилась лише апка', () => assert.equal(decide(5, 7, 7, 0, 0).winner, 'app'));
test('decide: змінилась лише Foundry', () => assert.deepEqual(decide(7, 5, 7, 0, 0), { winner: 'foundry', value: 5 }));
test('decide: обидві — новіша Foundry', () => assert.equal(decide(6, 5, 7, 100, 200).winner, 'foundry'));
test('decide: обидві — новіша апка', () => assert.equal(decide(6, 5, 7, 300, 200).winner, 'app'));

test('нічого не змінилось — нічого не пишемо', () => {
  const r = mergeFields(MECH_FIELDS, appMech(), mechActor({}, fullBase), 0);
  assert.equal(r.update, null);
  assert.deepEqual(r.patch, {});
});

test('удар у Foundry йде в апку в одиницях апки', () => {
  const actor = mechActor({ hp: { value: 4, max: 12 }, structure: { value: 3, max: 4 }, stress: { value: 2, max: 4 } }, fullBase);
  const r = mergeFields(MECH_FIELDS, appMech(), actor, 0);
  assert.deepEqual(r.patch, { hpCurrent: 4, structureFilled: 1, reactorFilled: 2 });
  assert.deepEqual(r.baseAfterPush, { hp: 4, structure: 1, reactor: 2 });
  assert.equal(r.update, null);
});

test('ремонт в апці йде у Foundry разом з новою базою', () => {
  const base = { ...fullBase, hp: 4, structure: 1, core: 0 };
  const actor = mechActor({ hp: { value: 4, max: 12 }, structure: { value: 3, max: 4 }, core_energy: 0 }, base);
  const r = mergeFields(MECH_FIELDS, appMech({ corePower: true }), actor, 0);
  assert.deepEqual(r.patch, {});
  assert.equal(r.update['system.hp.value'], 10);
  assert.equal(r.update['system.structure.value'], 4);
  assert.equal(r.update['system.core_energy'], 1);
  assert.equal(r.update[`flags.${MODULE}.base.hp`], 10);
});

test('перший зв\'язок: апка перемагає, база записується', () => {
  const actor = mechActor({ repairs: { value: 1, max: 4 } });
  const r = mergeFields(MECH_FIELDS, appMech(), actor, 0);
  assert.equal(r.update['system.repairs.value'], 3);
  assert.equal(r.update[`flags.${MODULE}.base.hp`], 10);
});

test('стрес бонду пілота', () => {
  const actor = { system: { hp: { value: 6 }, bond_state: { stress: { value: 3 } } }, flags: { [MODULE]: { base: { hp: 6, stress: 2 } } }, _stats: {} };
  const r = mergeFields(PILOT_FIELDS, { hpCurrent: 6, stress: 2 }, actor, 0);
  assert.deepEqual(r.patch, { stress: 3 });
});

test('лімітні заряди: витрата у Foundry, максимум з Foundry', () => {
  const item = { id: 'i1', name: 'Siege Cannon ', system: { uses: { value: 1, max: 3 } }, flags: { [MODULE]: { base: 2 } }, _stats: {} };
  const r = mergeLimited(appMech({ limited: [{ name: 'siege cannon', current: 2, max: 2 }] }), [item], 0);
  assert.deepEqual(r.patch, { 'siege cannon': { max: 3, current: 1 } });
  assert.equal(r.itemUpdates.length, 0);
});

test('лімітні заряди: поповнення в апці', () => {
  const item = { id: 'i1', name: 'Siege Cannon', system: { uses: { value: 0, max: 3 } }, flags: { [MODULE]: { base: 0 } }, _stats: {} };
  const r = mergeLimited(appMech({ limited: [{ name: 'Siege Cannon', current: 3, max: 3 }] }), [item], 0);
  assert.deepEqual(r.itemUpdates, [{ _id: 'i1', 'system.uses.value': 3, [`flags.${MODULE}.base`]: 3 }]);
});

test('максимуми ХП/ремкомплектів беруться з Foundry', () => {
  assert.deepEqual(mechMaxPatch(appMech({ hpMax: 10 }), mechActor()), { hpMax: 12 });
  assert.deepEqual(mechMaxPatch(appMech(), mechActor()), {});
});

console.log(`\n${n} тестів пройдено`);
