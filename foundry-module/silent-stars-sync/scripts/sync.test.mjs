// Перевірка логіки злиття без Foundry. Запуск: node foundry-module/silent-stars-sync/scripts/sync.test.mjs

import assert from 'node:assert/strict';
import {
  decide, mergeFields, mergeGroup, mergeLimited, mechMaxPatch, profileActorName, pilotIdentityUpdate,
  matchGroup, suggestActors, resolveLinks, pendingMechs, mergeDestroyed, combineItemUpdates, MECH_FIELDS, PILOT_FIELDS, MODULE,
  idleDecision, MAX_IDLE_SKIPS, isFreshCreating, CREATING_TTL, syncOption, artSrc, artUpdate,
  linksKey, linksDecision, LINKS_REFRESH_MS, economyUpdate,
  buildStatus, buildBaseline, hubModel, mechAction, takeSnapshot, snapshotItems, restoreItemUpdates, restoreUpdate, SNAPSHOT_MECH,
  nickToEmail, appBase, sessionFrom, sessionStale, linksFor, ownerUpdate, OWNER,
  pilotBuildKey, actorBuildKey, folderPath, findFolder, ROOT_FOLDER,
} from './sync.js';
import { createHash } from 'node:crypto';

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

test('isFreshCreating: свіжа позначка', () => assert.equal(isFreshCreating(1000, 1000 + 30_000), true));
test('isFreshCreating: протухла', () => assert.equal(isFreshCreating(1000, 1000 + CREATING_TTL), false));
test('isFreshCreating: годинник того, хто створює, трохи випереджає — ще свіжа', () => assert.equal(isFreshCreating(1000 + 60_000, 1000), true));
test('isFreshCreating: порожньо, нуль, сміття', () => {
  for (const v of [undefined, null, 0, '', 'x', false]) assert.equal(isFreshCreating(v, 5000), false);
});

test('syncOption: позначка модуля є', () => assert.equal(syncOption()[MODULE], true));
test("syncOption: кожен виклик — свіжий об'єкт, мутація одного не чіпає інших", () => {
  const a = syncOption();
  a.parent = 'мех'; // так Foundry дописує parent у переданий об'єкт
  a.updates = [{ _id: 'x' }];
  const b = syncOption();
  assert.notEqual(a, b);
  assert.deepEqual(Object.keys(b), [MODULE]);
});

const artActor = (img, src) => ({ img, prototypeToken: { texture: { src } } });
const ID1 = '3f2a9c10-1111-4222-8333-444455556666';
const ID2 = '9b7d0e55-1111-4222-8333-444455556666';
test('artSrc: версія — початок id арту', () => assert.equal(artSrc('pilots/n/A/A.png', ID1), 'pilots/n/A/A.png?v=3f2a9c10'));
test('artSrc: без id — як є, без шляху — порожньо', () => {
  assert.equal(artSrc('pilots/n/A/A.png', null), 'pilots/n/A/A.png');
  assert.equal(artSrc('', ID1), '');
});
test('artUpdate: немає шляху — нічого не міняємо', () => assert.deepEqual(artUpdate(null, artActor('x', 'y'), ID1), {}));
test('artUpdate: той самий арт — нічого не пишемо', () => {
  const v = artSrc('pilots/n/A/A.png', ID1);
  assert.deepEqual(artUpdate('pilots/n/A/A.png', artActor(v, v), ID1), {});
});
test('artUpdate: арт замінили під тим самим шляхом — адреса нова, актор оновлюється', () => {
  const old = artSrc('pilots/n/A/A.png', ID1);
  const u = artUpdate('pilots/n/A/A.png', artActor(old, old), ID2);
  assert.equal(u.img, 'pilots/n/A/A.png?v=9b7d0e55');
  assert.equal(u['prototypeToken.texture.src'], 'pilots/n/A/A.png?v=9b7d0e55');
});
test('artUpdate: актор ще зі старою адресою без версії — один раз оновлюється', () => {
  const u = artUpdate('pilots/n/A/A.png', artActor('pilots/n/A/A.png', 'pilots/n/A/A.png'), ID1);
  assert.equal(u.img, 'pilots/n/A/A.png?v=3f2a9c10');
});
test('artUpdate: токен відстав від портрета — оновлюється лише токен', () => {
  const v = artSrc('pilots/n/A/A.png', ID1);
  assert.deepEqual(artUpdate('pilots/n/A/A.png', artActor(v, 'icons/old.png'), ID1), { 'prototypeToken.texture.src': v });
});
test('pilotIdentityUpdate: портрет іде з версією id', () => {
  const actor = { ...artActor('', ''), system: { callsign: 'AMON', level: 2, player_name: 'x' }, flags: {} };
  const u = pilotIdentityUpdate({ name: 'Amon', callsign: 'AMON', ll: 2, player: 'x', portrait: 'pilots/n/AMON/AMON.png', portraitId: ID1 }, actor);
  assert.equal(u.img, 'pilots/n/AMON/AMON.png?v=3f2a9c10');
});

test('economyUpdate: мана й PR лягають у прапорець, без змін — нічого', () => {
  const p = { mana: 450, pr: 45, prCap: 100 };
  assert.deepEqual(economyUpdate(p, { flags: {} }), { [`flags.${MODULE}.economy`]: { mana: 450, pr: 45, prCap: 100 } });
  assert.deepEqual(economyUpdate(p, { flags: { [MODULE]: { economy: { mana: 450, pr: 45, prCap: 100 } } } }), {});
  assert.deepEqual(economyUpdate({ ...p, pr: 50 }, { flags: { [MODULE]: { economy: { mana: 450, pr: 45, prCap: 100 } } } }),
    { [`flags.${MODULE}.economy`]: { mana: 450, pr: 50, prCap: 100 } });
  assert.deepEqual(economyUpdate({ name: 'Amon' }, { flags: {} }), {});
});

test('economyUpdate: адреса магазину', () => {
  const p = { mana: 1, pr: 2, prCap: 100, shopUrl: 'https://a/pilots/x?shop=repair' };
  assert.deepEqual(economyUpdate(p, { flags: {} }), { [`flags.${MODULE}.economy`]: { mana: 1, pr: 2, prCap: 100, shopUrl: p.shopUrl } });
  assert.deepEqual(economyUpdate({ ...p, shopUrl: null }, { flags: {} }), { [`flags.${MODULE}.economy`]: { mana: 1, pr: 2, prCap: 100, shopUrl: '' } });
});

test('economyUpdate: прив\'язка до COMP/CON', () => {
  const p = { mana: 1, pr: 2, prCap: 100, ccLinked: true };
  assert.deepEqual(economyUpdate(p, { flags: {} }), { [`flags.${MODULE}.economy`]: { mana: 1, pr: 2, prCap: 100, ccLinked: true } });
  assert.deepEqual(economyUpdate({ ...p, ccLinked: false }, { flags: { [MODULE]: { economy: { mana: 1, pr: 2, prCap: 100, ccLinked: true } } } }),
    { [`flags.${MODULE}.economy`]: { mana: 1, pr: 2, prCap: 100, ccLinked: false } });
});

test('economyUpdate: ЛЛ для шкали мани', () => {
  assert.deepEqual(economyUpdate({ mana: 450, pr: 2, prCap: 100, ll: 3 }, { flags: {} }),
    { [`flags.${MODULE}.economy`]: { mana: 450, pr: 2, prCap: 100, ll: 3 } });
});

test('economyUpdate: поліси — лише з полем insured', () => {
  const p = { mana: 10, pr: 5, prCap: 100, insured: true, policies: ['Full recover'] };
  const flag = { mana: 10, pr: 5, prCap: 100, insured: true, policies: ['Full recover'] };
  assert.deepEqual(economyUpdate(p, { flags: {} }), { [`flags.${MODULE}.economy`]: flag });
  assert.deepEqual(economyUpdate(p, { flags: { [MODULE]: { economy: flag } } }), {});
  assert.deepEqual(economyUpdate({ ...p, policies: [] }, { flags: { [MODULE]: { economy: flag } } }),
    { [`flags.${MODULE}.economy`]: { ...flag, policies: [] } });
  assert.deepEqual(economyUpdate({ ...p, insured: false, policies: undefined }, { flags: {} }),
    { [`flags.${MODULE}.economy`]: { mana: 10, pr: 5, prCap: 100, insured: false, policies: [] } });
});

test('linksDecision: список змінився — звітуємо одразу', () => {
  const a = linksKey([{ pilotId: 'p', mechId: '1', actor: 'Amon' }]);
  const b = linksKey([{ pilotId: 'p', mechId: '2', actor: 'Amon' }]);
  assert.equal(linksDecision({ lastKey: a, key: b, lastAt: 1000, now: 1001 }), true);
});
test('linksDecision: без змін — лише раз на 30 хв', () => {
  const k = linksKey([{ pilotId: 'p', mechId: '1', actor: 'Amon' }]);
  assert.equal(linksDecision({ lastKey: k, key: k, lastAt: 1000, now: 1000 + LINKS_REFRESH_MS - 1 }), false);
  assert.equal(linksDecision({ lastKey: k, key: k, lastAt: 1000, now: 1000 + LINKS_REFRESH_MS }), true);
});
test('linksKey: порядок не важить', () => {
  const x = { pilotId: 'p', mechId: '1', actor: 'A' };
  const y = { pilotId: 'q', mechId: '2', actor: 'B' };
  assert.equal(linksKey([x, y]), linksKey([y, x]));
});

const withBuild = (b) => ({ flags: b == null ? {} : { [MODULE]: { build: b } } });

test('buildStatus: немає актора / файл новіший / актуально', () => {
  assert.equal(buildStatus({ build: 100 }, undefined), 'none');
  assert.equal(buildStatus({ build: 100 }, withBuild(50)), 'pending');
  assert.equal(buildStatus({ build: 100 }, withBuild(100)), 'ready');
  assert.equal(buildStatus({ build: 0 }, withBuild(null)), 'ready');
});

test('buildBaseline: лише актору без версії, лише коли є файл', () => {
  assert.deepEqual(buildBaseline({ build: 100 }, withBuild(null)), { [`flags.${MODULE}.build`]: 100 });
  assert.equal(buildBaseline({ build: 100 }, withBuild(50)), null);
  assert.equal(buildBaseline({ build: 0 }, withBuild(null)), null);
  assert.equal(buildBaseline({ build: 100 }, undefined), null);
});

test('hubModel: гравці за алфавітом, без акаунту — в кінці; статус гравця — найгірший', () => {
  const pilots = [
    { id: 'p1', name: 'Bell', player: 'Ivanus', mechs: [{ id: 'a', build: 10, hasProfile: true }, { id: 'b', build: 10, hasProfile: true }] },
    { id: 'p2', name: 'Emma', player: 'Ivanus', mechs: [{ id: 'c', build: 10 }] },
    { id: 'p3', name: 'Zed', player: '', mechs: [] },
    { id: 'p4', name: 'Ann', player: 'Alpha', mechs: [{ id: 'd', build: 10 }] },
  ];
  const actors = { 'p1:a': withBuild(5), 'p2:c': withBuild(10), 'p4:d': withBuild(10) };
  const m = hubModel(pilots, (p, mm) => actors[`${p}:${mm}`]);
  assert.deepEqual(m.map((u) => u.nick), ['Alpha', 'Ivanus', '']);
  assert.equal(m[0].status, 'ready');
  assert.equal(m[1].status, 'pending');
  assert.deepEqual(m[1].pilots[0].mechs.map((x) => x.status), ['pending', 'none']);
  assert.deepEqual(m[1].pilots[0].mechs.map(mechAction), ['sync', 'create']);
  assert.equal(mechAction({ status: 'none', m: {} }), null);
  assert.equal(mechAction(m[1].pilots[1].mechs[0]), null);
});

test('знімок стану меха й повернення після імпорту', () => {
  const before = { system: { hp: { value: 4 }, structure: { value: 2 }, heat: { value: 3 }, repairs: { value: 1 } } };
  const snap = takeSnapshot(before, SNAPSHOT_MECH);
  assert.deepEqual(snap, { 'system.hp.value': 4, 'system.repairs.value': 1, 'system.structure.value': 2, 'system.heat.value': 3 });
  const after = { system: { hp: { value: 12 }, structure: { value: 4 }, heat: { value: 0 }, repairs: { value: 1 } } };
  assert.deepEqual(restoreUpdate(snap, after), { 'system.hp.value': 4, 'system.structure.value': 2, 'system.heat.value': 3 });
});

test('предмети: заряди й «знищено» за назвою і порядком, нові — як з імпорту', () => {
  const it = (id, name, uses, destroyed) => ({ _id: id, name, system: { uses: uses == null ? undefined : { value: uses }, destroyed } });
  const snap = snapshotItems([it('1', 'Pistol', null, true), it('2', 'Missile', 1, false), it('3', 'Missile', 0, false)]);
  const items = [it('a', 'Pistol', null, false), it('b', 'Missile', 3, false), it('c', 'Missile', 3, false), it('d', 'Rifle', null, false)];
  assert.deepEqual(restoreItemUpdates(snap, items), [
    { _id: 'a', 'system.destroyed': true },
    { _id: 'b', 'system.uses.value': 1 },
    { _id: 'c', 'system.uses.value': 0 },
  ]);
});

// ----- Вхід гравця з хабу -----

{
  // Та сама адреса, що й в апці: sha256 від ніка в нижньому регістрі без пробілів по краях.
  const hex = createHash('sha256').update('вовк').digest('hex');
  assert.equal(await nickToEmail('  Вовк '), `${hex}@ferumvox-pilots.app`);
  n++;
  console.log('ok - нік → адреса входу як в апці');
}

test('адреса проєкту з адреси функції', () => {
  assert.equal(appBase('https://x.supabase.co/functions/v1/foundry-sync'), 'https://x.supabase.co');
  assert.equal(appBase('https://x.supabase.co/'), 'https://x.supabase.co');
});

test('сесія з відповіді Auth; без токенів — немає', () => {
  const s = sessionFrom({ access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'u', user_metadata: { nick: 'Вовк' } } }, 1000);
  assert.deepEqual(s, { access: 'a', refresh: 'r', expiresAt: 1000 + 3600e3, userId: 'u', nick: 'Вовк' });
  assert.equal(sessionFrom({ access_token: 'a' }, 0), null);
  assert.equal(sessionFrom({ access_token: 'a', refresh_token: 'r', user: { id: 'u' } }, 0, 'нік').nick, 'нік');
});

test('сесію оновлювати за хвилину до кінця', () => {
  assert.ok(sessionStale(null, 0));
  assert.ok(sessionStale({ access: 'a', expiresAt: 100e3 }, 50e3));
  assert.ok(!sessionStale({ access: 'a', expiresAt: 200e3 }, 50e3));
});

test('зв\'язки — лише мехи пілотів зі списку', () => {
  const pilots = [{ id: 'p1', mechs: [{ id: 'm1' }] }];
  const list = linksFor(pilots, [
    { pilotId: 'p1', mechId: 'm1', name: 'A', build: 5 },
    { pilotId: 'p1', mechId: 'm9', name: 'B' },
    { pilotId: 'p2', mechId: 'm1', name: 'C' },
  ]);
  assert.deepEqual(list, [{ pilotId: 'p1', mechId: 'm1', actor: 'A', build: 5 }]);
});

test('власник актора: OWNER лише якщо ще немає', () => {
  assert.deepEqual(ownerUpdate({ default: 0 }, 'f1'), { 'ownership.f1': OWNER });
  assert.deepEqual(ownerUpdate({ f1: 2 }, 'f1'), { 'ownership.f1': OWNER });
  assert.equal(ownerUpdate({ f1: 3 }, 'f1'), null);
  assert.equal(ownerUpdate({}, null), null);
});

// ----- Один актор-пілот на кілька мехів -----

const ccFile = (over = {}) => ({ EXPORT_TYPE: 'Save Pilot', data: {
  talents: [{ id: 't_ace', rank: 3 }, { id: 't_duelist', rank: 1 }],
  skills: [{ id: 'sk_spot', rank: 1 }, { id: 'Своє', custom: true, rank: 2 }],
  core_bonuses: [{ id: 'cb_auto_stabilizing_hardpoints' }], mechSkills: [2, 0, 0, 2], ...over,
} });
const lancerPilot = (over = {}) => ({
  system: { hull: 2, agi: 0, sys: 0, eng: 2 },
  items: { contents: [
    { type: 'talent', system: { lid: 't_duelist', curr_rank: 1 } },
    { type: 'talent', system: { lid: 't_ace', curr_rank: 3 } },
    { type: 'skill', system: { lid: 'sk_spot', curr_rank: 1 } },
    { type: 'skill', system: { curr_rank: 2 } },
    { type: 'core_bonus', system: { lid: 'cb_auto_stabilizing_hardpoints' } },
    { type: 'pilot_gear', system: { lid: 'pg_x' } },
    ...(over.items || []),
  ] },
});

test('збірка пілота: файл і актор Lancer дають той самий ключ', () => {
  assert.equal(pilotBuildKey(ccFile()), actorBuildKey(lancerPilot()));
  assert.equal(pilotBuildKey(ccFile().data), pilotBuildKey(ccFile()));
});

test('збірка пілота: інший ранг таланту, HASE чи кор-бонус — інший ключ', () => {
  const k = actorBuildKey(lancerPilot());
  assert.notEqual(pilotBuildKey(ccFile({ talents: [{ id: 't_ace', rank: 2 }, { id: 't_duelist', rank: 1 }] })), k);
  assert.notEqual(pilotBuildKey(ccFile({ mechSkills: [1, 1, 0, 2] })), k);
  assert.notEqual(pilotBuildKey(ccFile({ core_bonuses: [] })), k);
  assert.equal(pilotBuildKey(ccFile({ core_bonuses: ['cb_auto_stabilizing_hardpoints'] })), k);
});

test('папки: FERUM VOX / нік / позивний / мех', () => {
  const path = folderPath({ id: 'p1', userId: 'u1', player: 'Ivanus', callsign: 'Blacksmith', name: 'Bell' }, { id: 'm1', name: 'Kidd' });
  assert.deepEqual(path.map((s) => s.name), [ROOT_FOLDER, 'Ivanus', 'Blacksmith', 'Kidd']);
  assert.deepEqual(path.map((s) => s.key), ['root', 'user:u1', 'pilot:p1', 'mech:p1:m1']);
});

test('папки: спершу за ключем, далі за назвою без ключа, лише під своїм батьком', () => {
  const folders = [
    { id: 'r', name: 'Ferum Vox', parent: null },
    { id: 'a', name: 'Ivanus', parent: 'r', key: 'user:u1' },
    { id: 'b', name: 'Ivanus', parent: 'r' },
    { id: 'c', name: 'Blacksmith', parent: 'x', key: 'pilot:p1' },
  ];
  assert.equal(findFolder(folders, null, { key: 'root', name: ROOT_FOLDER }).id, 'r');
  assert.equal(findFolder(folders, 'r', { key: 'user:u1', name: 'нове ім\'я' }).id, 'a');
  assert.equal(findFolder(folders, 'r', { key: 'user:u2', name: 'ivanus' }).id, 'b');
  assert.equal(findFolder(folders, 'r', { key: 'pilot:p1', name: 'Blacksmith' }), null);
});

console.log(`\n${n} тестів пройдено`);
