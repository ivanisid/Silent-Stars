import { PR_START } from './constants';

// Factory for a brand-new pilot's mechanics state.
// Deliberately empty/zeroed (not the demo seed data from the original design mockup) —
// see docs/pilot-mechanics-spec.md section "deviations".

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowTs() {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function createDefaultPilotState() {
  return {
    games: 0,
    // Рівень ліцензії більше не виводиться з кількості ігор — він купується за ману
    // і зберігається окремо. games лишається лічильником зіграних ігор.
    ll: 2,
    status: 'active',
    resourceMode: 'full',
    hangar: { owned: {}, confirm: null, error: '', open: false },
    // Тір 1 стартує з готовим запасом PR (правила: «На старті кожен гравець вже має 30PR»).
    pr: PR_START,
    shop: { open: false, item: null, mechId: null, alloc: {}, picked: null, qty: 1, error: '' },
    prSpend: { item: null, mechId: null, alloc: {}, error: '' },
    mana: {
      balance: 0,
      txOpen: false,
      txType: 'deposit',
      amount: '',
      comment: '',
      target: '',
      error: '',
      history: [],
    },
    stress: 0,
    burdens: [
      { type: 'minor4', filled: 0, heal: 0, name: '' },
      { type: 'middle6', filled: 0, heal: 0, name: '' },
      { type: 'major8', filled: 0, heal: 0, name: '' },
    ],
    bond: { archetype: '', xp: 0, powers: [], newPower: '' },
    hp: { current: 6, max: 6 },
    downtime: { open: null, modifiers: {}, rolls: {} },
    downtimeCharges: { max: 1, used: 0 },
    weeklyCharges: { max: 1, used: 0 },
    skillTriggers: [],
    skillCapBonus: 0,
    skillDraft: { name: '', desc: '', level: 1 },
    contacts: [],
    contactDraft: { name: '', circle: '', help: '', debt: '' },
    projects: [],
    projectDraft: { name: '', note: '' },
    mechs: [],
    mechDraft: { name: '', hpMax: '', repairMax: '', frame: '' },
    llEdit: { open: false, ll: '' },
    levelUp: { open: false, mechId: null, allTalents: false, allLicenses: false, error: '' },
    mechEditId: null,
    mechEdit: { hpMax: '', repairMax: '', frame: '' },
    limitedDraft: {},
    actionLog: [{ ts: nowTs(), msg: 'Пілота створено.' }],
    narrative: '',
  };
}
