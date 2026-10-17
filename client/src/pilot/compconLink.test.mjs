// Прив'язка до COMP/CON за share code: статуси й зміни в мехах.
// Запуск: node client/src/pilot/compconLink.test.mjs

import assert from 'node:assert/strict';
import {
  buildPending, ccStatus, isShareCode, mechDiff, mechFoundryStatus, normalizeShareCode, pilotFoundryStatus, wrapCloudPilot,
  CC_ACTIVE, CC_INACTIVE, FV_NONE, FV_PARTIAL, FV_PENDING, FV_READY,
} from './compconLink.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

test('share code: 12 символів, регістр не важливий', () => {
  assert.equal(normalizeShareCode(' 4msons13o6hh '), '4MSONS13O6HH');
  assert.ok(isShareCode('4msons13o6hh'));
  assert.ok(!isShareCode('4MSONS'));
  assert.ok(!isShareCode('4MSONS13O6H-'));
});

test('файл з хмари загортається в експорт Save Pilot', () => {
  assert.deepEqual(wrapCloudPilot({ id: 'x' }), { EXPORT_TYPE: 'Save Pilot', data: { id: 'x' } });
});

test('COMP/CON: активний лише з кодом, прийнятою версією і без помилки', () => {
  assert.equal(ccStatus(null).text, CC_INACTIVE);
  assert.equal(ccStatus({ code: 'X', version: 0, error: '' }).text, CC_INACTIVE);
  assert.equal(ccStatus({ code: 'X', version: 5, error: 'немає' }).text, CC_INACTIVE);
  const s = ccStatus({ code: 'X', version: 5, error: '', acceptedAt: '2026-10-17T15:59:00Z' });
  assert.equal(s.text, CC_ACTIVE);
  assert.match(s.at, /^17\.10\.2026 \d\d:59$/);
});

test('FOUNDRY меха: немає зв\'язку / потребує підтвердження / готовий', () => {
  assert.equal(mechFoundryStatus(undefined).text, FV_NONE);
  assert.equal(mechFoundryStatus(undefined, true).text, FV_NONE);
  assert.equal(mechFoundryStatus({ seenAt: 'x' }, true).text, FV_PENDING);
  assert.equal(mechFoundryStatus({ seenAt: 'x' }).text, FV_READY);
});

test('buildPending: файл новіший за версію актора; без версії — ні', () => {
  assert.equal(buildPending({ build: Date.parse('2026-10-17T10:00:00Z') }, '2026-10-17T11:00:00Z'), true);
  assert.equal(buildPending({ build: Date.parse('2026-10-17T11:00:00Z') }, '2026-10-17T11:00:00Z'), false);
  assert.equal(buildPending({ build: null }, '2026-10-17T11:00:00Z'), false);
  assert.equal(buildPending(null, '2026-10-17T11:00:00Z'), false);
  assert.equal(buildPending({ build: 1 }, undefined), false);
});

test('FOUNDRY пілота: зміна > усі готові > частково > відсутня', () => {
  const r = { text: FV_READY };
  const no = { text: FV_NONE };
  const p = { text: FV_PENDING };
  assert.equal(pilotFoundryStatus([r, p]).text, FV_PENDING);
  assert.equal(pilotFoundryStatus([r, r]).text, FV_READY);
  assert.equal(pilotFoundryStatus([r, no]).text, FV_PARTIAL);
  assert.equal(pilotFoundryStatus([no]).text, FV_NONE);
  assert.equal(pilotFoundryStatus([]).text, FV_NONE);
});

const mech = (over) => ({
  frame: 'Everest', frameSource: 'GMS',
  items: [{ name: 'Assault Rifle', type: 'weapon' }, { name: 'Pistol', type: 'weapon' }, { name: 'Smoke Charges', type: 'system' }],
  build: { talents: [{ name: 'Ace', rank: 1 }] },
  ...over,
});

test('зміни меха: без змін — порожньо', () => {
  assert.deepEqual(mechDiff(mech(), mech()), []);
});

test('зміни меха: фрейм, зброя, системи, таланти', () => {
  const inc = mech({
    frame: 'Mourning Cloak', frameSource: 'SSC',
    items: [{ name: 'Assault Rifle', type: 'weapon' }, { name: 'Heavy Melee Weapon', type: 'weapon' }],
    build: { talents: [{ name: 'Ace', rank: 2 }] },
  });
  assert.deepEqual(mechDiff(mech(), inc), [
    { title: 'ФРЕЙМ', lines: [{ sign: '−', text: 'GMS Everest' }, { sign: '+', text: 'SSC Mourning Cloak' }] },
    { title: 'ЗБРОЯ', lines: [{ sign: '+', text: 'Heavy Melee Weapon' }, { sign: '−', text: 'Pistol' }] },
    { title: 'СИСТЕМИ', lines: [{ sign: '−', text: 'Smoke Charges' }] },
    { title: 'ТАЛАНТИ', lines: [{ sign: '+', text: 'Ace II' }, { sign: '−', text: 'Ace I' }] },
  ]);
});

test('зміни меха: однакова зброя двічі рахується окремо', () => {
  const inc = mech({ items: [...mech().items, { name: 'Pistol', type: 'weapon' }] });
  assert.deepEqual(mechDiff(mech(), inc), [{ title: 'ЗБРОЯ', lines: [{ sign: '+', text: 'Pistol' }] }]);
});

test('зміни меха: новий мех — усе з плюсом', () => {
  const d = mechDiff(null, mech());
  assert.deepEqual(d.map((g) => g.title), ['ФРЕЙМ', 'ЗБРОЯ', 'СИСТЕМИ', 'ТАЛАНТИ']);
  assert.ok(d.every((g) => g.lines.every((l) => l.sign === '+')));
});

console.log(`${n} тестів пройдено`);
