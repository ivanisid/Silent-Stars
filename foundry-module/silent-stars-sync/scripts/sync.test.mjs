// Перевірка логіки злиття без Foundry. Запуск: node foundry-module/silent-stars-sync/scripts/sync.test.mjs

import assert from 'node:assert/strict';
import {
  decide, mergeFields, mergeGroup, mergeLimited, mechMaxPatch, profileActorName, pilotIdentityUpdate,
  groupActors, matchGroup, MECH_FIELDS, PILOT_FIELDS, MODULE,
} from './sync.js';

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

// ----- Два актори одного пілота (два профілі) -----

const pilotActor = (hp, stress, base, time = 0) => ({
  system: { hp: { value: hp }, bond_state: { stress: { value: stress } } },
  flags: base ? { [MODULE]: { base } } : {},
  _stats: { modifiedTime: time },
});

test('група: шкода на одному акторі йде в апку й одразу в другого актора', () => {
  const a = pilotActor(4, 2, { hp: 6, stress: 2 }, 100);
  const b = pilotActor(6, 2, { hp: 6, stress: 2 }, 50);
  const r = mergeGroup(PILOT_FIELDS, { hpCurrent: 6, stress: 2 }, [a, b], 0);
  assert.deepEqual(r.patch, { hpCurrent: 4 });
  assert.equal(r.updates[0], null);
  assert.deepEqual(r.updates[1], { 'system.hp.value': 4 }); // база — лише після push
  assert.deepEqual(r.baseAfterPush, [{ hp: 4 }, { hp: 4 }]);
  assert.deepEqual(r.conflicts, []);
});

test('група: обидва актори змінились — бере гору новіший, це конфлікт', () => {
  const a = pilotActor(5, 2, { hp: 10, stress: 2 }, 100);
  const b = pilotActor(7, 2, { hp: 10, stress: 2 }, 200);
  const r = mergeGroup(PILOT_FIELDS, { hpCurrent: 10, stress: 2 }, [a, b], 0);
  assert.deepEqual(r.patch, { hpCurrent: 7 });
  assert.deepEqual(r.updates[0], { 'system.hp.value': 7 });
  assert.deepEqual(r.conflicts, ['hp']);
});

test('група: push відклали — наступний цикл не відкочує зміну', () => {
  // Після попереднього циклу обидва актори мають 7, база ще стара (10), апка — 10.
  const a = pilotActor(7, 2, { hp: 10, stress: 2 }, 300);
  const b = pilotActor(7, 2, { hp: 10, stress: 2 }, 200);
  const r = mergeGroup(PILOT_FIELDS, { hpCurrent: 10, stress: 2 }, [a, b], 0);
  assert.deepEqual(r.patch, { hpCurrent: 7 });
  assert.deepEqual(r.conflicts, []);
});

test('група: змінилась апка — обидва актори отримують значення', () => {
  const a = pilotActor(6, 2, { hp: 6, stress: 2 });
  const b = pilotActor(6, 2, { hp: 6, stress: 2 });
  const r = mergeGroup(PILOT_FIELDS, { hpCurrent: 3, stress: 2 }, [a, b], 0);
  assert.deepEqual(r.patch, {});
  for (const u of r.updates) assert.deepEqual(u, { 'system.hp.value': 3, [`flags.${MODULE}.base.hp`]: 3 });
});

test('група: новий актор без бази бере значення з апки', () => {
  const a = pilotActor(6, 2, { hp: 6, stress: 2 });
  const b = pilotActor(9, 0);
  const r = mergeGroup(PILOT_FIELDS, { hpCurrent: 6, stress: 2 }, [a, b], 0);
  assert.equal(r.updates[0], null);
  assert.equal(r.updates[1]['system.hp.value'], 6);
  assert.equal(r.updates[1]['system.bond_state.stress.value'], 2);
});

// ----- Імена акторів, створених з апки -----

const twoMechs = { name: 'Amon', callsign: 'AMON', mechs: [{ id: '1', name: 'MASTIFF' }, { id: '2', name: 'BLACKBEARD' }] };

test("ім'я: один мех — просто ім'я пілота", () => {
  assert.equal(profileActorName({ name: 'Amon', callsign: 'AMON', mechs: [{ id: '1', name: 'MASTIFF' }] }, '1'), 'Amon');
});

test("ім'я: кілька мехів — ім'я пілота і мех профілю", () => {
  assert.equal(profileActorName(twoMechs, '2'), 'Amon (BLACKBEARD)');
});

test("ім'я: без імені — позивний", () => {
  assert.equal(profileActorName({ name: '', callsign: 'AMON', mechs: [] }, '1'), 'AMON');
});

test("ім'я: актора без profileMechId не перейменовуємо", () => {
  const actor = { name: 'Amon Ra', system: { callsign: 'AMON', level: 2 }, flags: {} };
  assert.equal(pilotIdentityUpdate({ ...twoMechs, ll: 2 }, actor).name, undefined);
  const created = { ...actor, flags: { [MODULE]: { profileMechId: '1' } } };
  assert.equal(pilotIdentityUpdate({ ...twoMechs, ll: 2 }, created).name, 'Amon (MASTIFF)');
});

test('групування: пілоти за алфавітом, мехи під своїм пілотом', () => {
  const zed = { id: 'p1', name: 'Zed' }, amon = { id: 'p2', name: 'Amon' }, bao = { id: 'p3', name: 'Бао' };
  const mechs = [
    { id: 'm1', name: 'Tortuga', system: { pilot: { value: zed } } },
    { id: 'm2', name: 'Atlas', system: { pilot: { value: zed } } },
    { id: 'm3', name: 'Lonely', system: { pilot: null } },
    { id: 'm4', name: 'Ghost', system: { pilot: { value: { id: 'gone' } } } },
  ];
  const { groups, orphans } = groupActors([zed, bao, amon], mechs);
  assert.deepEqual(groups.map((g) => g.pilot.name), ['Amon', 'Zed', 'Бао']);
  assert.deepEqual(groups[1].mechs.map((m) => m.name), ['Atlas', 'Tortuga']);
  assert.deepEqual(orphans.map((m) => m.name), ['Ghost', 'Lonely']);
});

test('пошук: збіг з пілотом показує всю групу, з мехом — пілота і мех', () => {
  const texts = ['Amon MASTIFF', 'Tortuga', 'Atlas'];
  assert.deepEqual(matchGroup(texts, ''), { visible: true, rows: [true, true, true] });
  assert.deepEqual(matchGroup(texts, 'mast'), { visible: true, rows: [true, true, true] });
  assert.deepEqual(matchGroup(texts, 'atl'), { visible: true, rows: [true, false, true] });
  assert.equal(matchGroup(texts, 'xyz').visible, false);
});

console.log(`\n${n} тестів пройдено`);
