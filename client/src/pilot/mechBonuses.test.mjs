// Бонуси до HP / ремкомплектів / Overcharge з файлу COMP/CON.
// Запуск: node client/src/pilot/mechBonuses.test.mjs

import assert from 'node:assert/strict';
import { bonusText, mechBonuses } from './mechBonuses.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

const personalizations = (withBonuses = true) => ({
  id: 'ms_personalizations',
  data: { id: 'ms_personalizations', name: 'Personalizations', ...(withBonuses ? { bonuses: [{ id: 'hp', val: 2 }] } : {}) },
});
const mech = (systems = [], traits = []) => ({
  active_loadout_index: 0,
  loadouts: [{ systems }],
  frameData: { traits },
});

test('Personalizations дає +2 HP', () => {
  const b = mechBonuses({}, mech([personalizations()]));
  assert.equal(b.hp.total, 2);
  assert.equal(bonusText(b.hp.parts), '+2 Personalizations');
});

test('кор-бонус Reinforced Frame з bonuses і без них (за правилами) — +5 HP', () => {
  const withData = { id: 'cb_reinforced_frame', name: 'Reinforced Frame', bonuses: [{ id: 'hp', val: 5 }] };
  assert.equal(mechBonuses({ core_bonuses: [withData] }, mech()).hp.total, 5);
  const bare = { id: 'cb_reinforced_frame', name: 'Reinforced Frame' };
  assert.equal(mechBonuses({ core_bonuses: [bare] }, mech()).hp.total, 5);
});

test('бонуси сумуються: Personalizations без bonuses у файлі + Reinforced Frame = +7', () => {
  const b = mechBonuses({ core_bonuses: [{ id: 'cb_reinforced_frame', name: 'Reinforced Frame' }] }, mech([personalizations(false)]));
  assert.equal(b.hp.total, 7);
});

test('системи неактивного лоадауту не рахуються', () => {
  const m = { active_loadout_index: 1, loadouts: [{ systems: [personalizations()] }, { systems: [] }] };
  assert.equal(mechBonuses({}, m).hp.total, 0);
});

test('формули й кубики не вгадуються', () => {
  const sys = { data: { name: 'Weird', bonuses: [{ id: 'hp', val: '{ll}' }, { id: 'hp', val: '1d6' }] } };
  assert.equal(mechBonuses({}, mech([sys])).hp.total, 0);
});

test('ремкомплекти й трейти фрейму', () => {
  const trait = { name: 'Sturdy', bonuses: [{ id: 'repcap', val: 2 }] };
  assert.equal(mechBonuses({}, mech([], [trait])).repcap.total, 2);
});

test('ранги таланту — лише отримані', () => {
  const talent = { rank: 1, data: { name: 'T', ranks: [{ name: 'R1', bonuses: [{ id: 'hp', val: 1 }] }, { name: 'R2', bonuses: [{ id: 'hp', val: 3 }] }] } };
  assert.equal(mechBonuses({ talents: [talent] }, mech()).hp.total, 1);
});

test('Heatfall Coolant System: Overcharge не вище 1d6', () => {
  const cb = { id: 'cb_heatfall_coolant_system', name: 'Heatfall Coolant System', bonuses: [{ id: 'overcharge', val: ['1', '1d3', '1d6', '1d6'] }] };
  const b = mechBonuses({ core_bonuses: [cb] }, mech());
  assert.deepEqual(b.overcharge.steps, ['+1', '+1D3', '+1D6', '+1D6']);
  const bare = mechBonuses({ core_bonuses: [{ id: 'cb_heatfall_coolant_system', name: 'Heatfall Coolant System' }] }, mech());
  assert.deepEqual(bare.overcharge.steps, ['+1', '+1D3', '+1D6', '+1D6']);
});

test('без бонусів — нулі й звичайна драбина', () => {
  const b = mechBonuses({}, mech());
  assert.equal(b.hp.total, 0);
  assert.equal(b.repcap.total, 0);
  assert.equal(b.overcharge, null);
});

console.log(`\n${n} тестів пройдено`);
