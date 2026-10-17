// Зміни з бази для відкритого профілю: бій з Foundry і нова версія COMP/CON, прийнята в модулі.
// Запуск: node client/src/pilot/foundrySync.test.mjs

import assert from 'node:assert/strict';
import { mergeFoundryState } from './foundrySync.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

const mech = (over = {}) => ({ id: 1, name: 'Kidd', hpCurrent: 10, hpMax: 12, items: [{ name: 'Pistol' }], ...over });
const local = {
  hp: { current: 5, max: 6 }, stress: 0, bond: {}, mechs: [mech()],
  compcon: { code: 'X', version: 1, level: 2 }, actionLog: [{ ts: 'a', msg: 'старе' }],
  foundrySyncAt: 'f1', compconSyncAt: 'c1', notes: 'локальне',
};

test('без нових позначок — той самий об\'єкт', () => {
  assert.equal(mergeFoundryState(local, { ...local, mechs: [] }), local);
  assert.equal(mergeFoundryState(local, null), local);
});

test('прийняття з модуля: мехи й прив\'язка — з бази, решта — локальна', () => {
  const remote = {
    ...local, notes: 'з бази', compconSyncAt: 'c2',
    mechs: [mech({ name: 'Kidd', items: [{ name: 'Heavy Melee Weapon' }] })],
    compcon: { code: 'X', version: 5, level: 3 },
    actionLog: [{ ts: 'b', msg: 'Foundry: COMP/CON: прийнято версію «John»' }, ...local.actionLog],
  };
  const next = mergeFoundryState(local, remote);
  assert.deepEqual(next.mechs[0].items, [{ name: 'Heavy Melee Weapon' }]);
  assert.equal(next.compcon.version, 5);
  assert.equal(next.compconSyncAt, 'c2');
  assert.equal(next.notes, 'локальне');
  assert.equal(next.actionLog.length, 2);
  assert.equal(mergeFoundryState(next, remote), next);
});

test('бій з Foundry: лише поля бою', () => {
  const remote = { ...local, foundrySyncAt: 'f2', hp: { current: 2 }, mechs: [mech({ hpCurrent: 3, items: [{ name: 'Інше' }] })] };
  const next = mergeFoundryState(local, remote);
  assert.equal(next.hp.current, 2);
  assert.equal(next.mechs[0].hpCurrent, 3);
  assert.deepEqual(next.mechs[0].items, [{ name: 'Pistol' }]);
  assert.equal(next.compconSyncAt, 'c1');
});

test('обидві позначки разом: спершу мехи з COMP/CON, потім бій поверх них', () => {
  const remote = {
    ...local, foundrySyncAt: 'f2', compconSyncAt: 'c2',
    mechs: [mech({ hpCurrent: 7, items: [{ name: 'Heavy Melee Weapon' }] })], compcon: { version: 5 },
  };
  const next = mergeFoundryState(local, remote);
  assert.equal(next.mechs[0].hpCurrent, 7);
  assert.deepEqual(next.mechs[0].items, [{ name: 'Heavy Melee Weapon' }]);
  assert.equal(next.foundrySyncAt, 'f2');
});

console.log(`${n} тестів пройдено`);
