// Перевірка логіки злиття без Foundry. Запуск: node foundry-module/silent-stars-sync/scripts/sync.test.mjs

import assert from 'node:assert/strict';
import {
  decide, mergeFields, mergeGroup, mergeLimited, mechMaxPatch, profileActorName, pilotIdentityUpdate,
  matchGroup, suggestActors, resolveLinks, pendingMechs, mergeDestroyed, combineItemUpdates, MECH_FIELDS, PILOT_FIELDS, MODULE,
  idleDecision, MAX_IDLE_SKIPS,
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

// Поля бонду в базі вже узгоджені (нулі), щоб ці тести дивились лише на ХП і стрес.
const BOND_BASE = { bondXp: 0, bondMajors: 0, bondMinor: 0, bondMinorIdeal: '' };
const pilotActor = (hp, stress, base, time = 0) => ({
  system: { hp: { value: hp }, bond_state: { stress: { value: stress } } },
  flags: base ? { [MODULE]: { base: { ...BOND_BASE, ...base } } } : {},
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

test('пошук: збіг з пілотом показує всю групу, з мехом — пілота і мех', () => {
  const texts = ['Amon MASTIFF', 'Tortuga', 'Atlas'];
  assert.deepEqual(matchGroup(texts, ''), { visible: true, rows: [true, true, true] });
  assert.deepEqual(matchGroup(texts, 'mast'), { visible: true, rows: [true, true, true] });
  assert.deepEqual(matchGroup(texts, 'atl'), { visible: true, rows: [true, false, true] });
  assert.equal(matchGroup(texts, 'xyz').visible, false);
});

// ----- Вікно зв'язків від апки -----

test('схожі актори: за іменем, позивним чи вже зв\'язані — першими', () => {
  const actors = [{ id: '1', name: 'Zed' }, { id: '2', name: 'Emma (CROCEL)' }, { id: '3', name: 'Stella pilot' }, { id: '4', name: 'Bob' }];
  const r = suggestActors(actors, ['Emma', 'STELLA'], new Set(['4']));
  assert.deepEqual(r.similar.map((a) => a.id), ['4', '2', '3']);
  assert.deepEqual(r.others.map((a) => a.id), ['1']);
});

test('зв\'язки: вибір, відв\'язування, чужі пілоти не чіпаються', () => {
  const app = new Set(['P1', 'P2']);
  const pilots = [{ id: 'a', pilotId: 'P1' }, { id: 'b', pilotId: 'P1' }, { id: 'c', pilotId: 'GONE' }, { id: 'd' }];
  const mechs = [{ id: 'm', pilotId: 'P1', mechId: '1' }, { id: 'n' }];
  const changes = resolveLinks({
    pilotChoices: [['P1', 'a'], ['P2', 'd'], ['P2', '']],
    mechChoices: [['P1', '1', 'n'], ['P1', '2', '']],
  }, pilots, mechs, app);
  assert.deepEqual(changes, [
    { actorId: 'b', type: 'pilot', pilotId: null }, // був у P1, ніде не вибраний
    { actorId: 'd', type: 'pilot', pilotId: 'P2' },
    { actorId: 'm', type: 'mech', pilotId: null, mechId: null }, // мех 1 тепер у іншого актора
    { actorId: 'n', type: 'mech', pilotId: 'P1', mechId: '1' },
  ]);
});

test('зв\'язки: без змін — порожньо', () => {
  const changes = resolveLinks({ pilotChoices: [['P1', 'a']], mechChoices: [['P1', '1', 'm']] },
    [{ id: 'a', pilotId: 'P1' }], [{ id: 'm', pilotId: 'P1', mechId: '1' }], new Set(['P1']));
  assert.deepEqual(changes, []);
});

test('створення: мех зв\'язаний і пілот є — нічого створювати', () => {
  const p = { id: 'P1', mechs: [{ id: '1', hasProfile: true }, { id: '2', hasProfile: false }] };
  assert.deepEqual(pendingMechs(p, [{ pilotId: 'P1' }], [{ pilotId: 'P1', mechId: '1' }]), []);
});

test('створення: актора-пілота видалили — мех знову до створення', () => {
  const p = { id: 'P1', mechs: [{ id: '1', hasProfile: true }] };
  assert.deepEqual(pendingMechs(p, [], [{ pilotId: 'P1', mechId: '1' }]).map((m) => m.id), ['1']);
});

test('створення: мех з тим самим id в іншого пілота не рахується', () => {
  const p = { id: 'P1', mechs: [{ id: '1', hasProfile: true }] };
  assert.deepEqual(pendingMechs(p, [{ pilotId: 'P1' }], [{ pilotId: 'P2', mechId: '1' }]).map((m) => m.id), ['1']);
});

// ----- Бонд -----

const bondActor = (bond, base) => ({
  system: { hp: { value: 6 }, bond_state: { stress: { value: 0 }, ...bond } },
  flags: { [MODULE]: { base: { hp: 6, stress: 0, ...base } } },
  _stats: { modifiedTime: 0 },
});
const bondApp = (over) => ({ hpCurrent: 6, stress: 0, bondXp: 0, bondChecks: [], bondPick: 0, minorIdeals: ['A', 'B'], ...over });

test('бонд: XP апки йде у Foundry як позиція в циклі з 8', () => {
  const actor = bondActor({ xp: { value: 0 } }, { bondXp: 0, bondMajors: 0, bondMinor: 0, bondMinorIdeal: 'A' });
  const r = mergeFields(PILOT_FIELDS, bondApp({ bondXp: 11 }), actor, 0);
  assert.equal(r.update['system.bond_state.xp.value'], 3);
  assert.deepEqual(r.patch, {});
});

test('бонд: галочки й XP з Foundry йдуть в апку', () => {
  const actor = bondActor(
    { xp: { value: 4 }, xp_checklist: { major_ideals: [false, true, false], minor_ideal: true }, minor_ideal: 'B' },
    { bondXp: 3, bondMajors: 0, bondMinor: 0, bondMinorIdeal: 'A' },
  );
  const r = mergeFields(PILOT_FIELDS, bondApp({ bondXp: 11 }), actor, 0);
  assert.deepEqual(r.patch, { bondXp: 12, bondMajors: [false, true, false], bondMinor: true, bondPick: 1 });
});

test('бонд: 8 XP у Foundry закриває цикл в апці', () => {
  const actor = bondActor({ xp: { value: 8 } }, { bondXp: 7, bondMajors: 0, bondMinor: 0, bondMinorIdeal: 'A' });
  const r = mergeFields(PILOT_FIELDS, bondApp({ bondXp: 15 }), actor, 0);
  assert.equal(r.patch.bondXp, 16);
});

test('бонд: мінорний ідеал, якого немає в списку апки, в апку не йде', () => {
  const actor = bondActor({ minor_ideal: 'Свій текст' }, { bondXp: 0, bondMajors: 0, bondMinor: 0, bondMinorIdeal: 'A' });
  const r = mergeFields(PILOT_FIELDS, bondApp(), actor, 0);
  assert.equal(r.patch.bondPick, undefined);
});

// ----- Знищене спорядження -----

const weapon = (id, name, destroyed, base, type = 'mech_weapon') => ({
  id, name, type, system: { destroyed }, flags: base === undefined ? {} : { [MODULE]: { baseDestroyed: base } }, _stats: {},
});

test('знищене: знищили у Foundry — йде в апку', () => {
  const r = mergeDestroyed({ items: [{ name: 'Siege Cannon', destroyed: false }] }, [weapon('i1', 'Siege Cannon', true, 0)], 0);
  assert.deepEqual(r.patch, { 'siege cannon': true });
  assert.equal(r.itemUpdates.length, 0);
});

test('знищене: відремонтували в апці — йде у Foundry', () => {
  const r = mergeDestroyed({ items: [{ name: 'Siege Cannon', destroyed: false }] }, [weapon('i1', 'Siege Cannon', true, 1)], 0);
  assert.deepEqual(r.itemUpdates, [{ _id: 'i1', 'system.destroyed': false, [`flags.${MODULE}.baseDestroyed`]: 0 }]);
});

test('знищене: предмети не меха й без пари в апці пропускаються', () => {
  const r = mergeDestroyed({ items: [{ name: 'Siege Cannon', destroyed: true }] },
    [weapon('i1', 'Frame', true, undefined, 'frame'), weapon('i2', 'Other', true, 0)], 0);
  assert.deepEqual(r, { itemUpdates: [], patch: {}, baseAfterPush: [], conflicts: [] });
});

test('оновлення предметів одного id зливаються', () => {
  assert.deepEqual(combineItemUpdates([{ _id: 'a', x: 1 }], [{ _id: 'a', y: 2 }, { _id: 'b', z: 3 }]), [{ _id: 'a', x: 1, y: 2 }, { _id: 'b', z: 3 }]);
});

const idle = (over = {}) => idleDecision({ last: 'a', fp: 'a', skips: 0, needFull: false, ...over });
test('idleDecision: відбиток збігся — пропуск', () => assert.equal(idle(), 'skip'));
test('idleDecision: відбиток змінився — повний pull', () => assert.equal(idle({ fp: 'b' }), 'full'));
test('idleDecision: ще не було повного pull — повний', () => assert.equal(idle({ last: null }), 'full'));
test('idleDecision: ping не вдався — повний', () => assert.equal(idle({ fp: null }), 'full'));
test('idleDecision: минулий цикл лишив роботу — повний', () => assert.equal(idle({ needFull: true }), 'full'));
test('idleDecision: ліміт пропусків — повний', () => {
  assert.equal(idle({ skips: MAX_IDLE_SKIPS - 1 }), 'skip');
  assert.equal(idle({ skips: MAX_IDLE_SKIPS }), 'full');
});

console.log(`\n${n} тестів пройдено`);
