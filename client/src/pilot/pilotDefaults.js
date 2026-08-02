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
    status: 'active',
    resourceMode: 'full',
    hangar: { owned: {}, confirm: null, error: '', open: false },
    dcStore: 0,
    shop: { open: false, item: null, mechId: null, alloc: {}, picked: null, qty: 1, error: '' },
    dcr: { open: false, mechId: null, total: '', kits: 0, packs: 0, alloc: {}, allRefill: false, error: '' },
    buf: { item: null, mechId: null, alloc: {}, error: '' },
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
    mechDraft: { name: '', hpMax: '', repairMax: '' },
    llEdit: { open: false, ll: '' },
    mechEditId: null,
    mechEdit: { hpMax: '', repairMax: '' },
    limitedDraft: {},
    actionLog: [{ ts: nowTs(), msg: 'Пілота створено.' }],
    narrative: '',
  };
}
