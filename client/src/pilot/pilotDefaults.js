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
    shop: { open: false, tab: 'reserves', item: null, mechId: null, alloc: {}, picked: null, qty: 1, error: '' },
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
    // Базово 8; окремі bond powers цей ліміт змінюють, тому він редагований.
    stressMax: 8,
    // Burden-и не існують наперед — вони створюються, коли стрес перевищує ліміт
    // або коли їх записує гравець. Розмір задається порядковим номером, не вибором.
    burdens: [],
    // Стан «down and out»: знімається дією Get medical help, яка автоматично забирає
    // наступну щотижневу downtime-дію.
    downAndOut: false,
    bond: {
      archetype: '',
      xp: 0,
      powers: [],
      newPower: '',
      // Перший major ideal свій у кожного бонду — вводиться текстом, бо переліку бондів
      // у додатку немає. Два інші беруться з SHARED_MAJOR_IDEALS.
      majorIdealFirst: '',
      // Особиста ціль на гру, обирається перед грою.
      minorIdeal: '',
      // Що з ідеалів виконано за цю гру; наприкінці гри перетворюється на XP.
      marked: { major0: false, major1: false, major2: false, minor: false },
      // Сила з чужого бонду й бонусні сили за неї та за п'ять власних.
      foreignPower: '',
      veteranPower: '',
      masterPower: '',
      // Скільки разів лічильник XP скидався, поки бонд ще не обрано. При виборі бонду
      // кожен скид перетворюється на додаткову силу.
      deferredResets: 0,
      // Вибір бонду фіксується окремо від тексту архетипу, щоб сили нарахувались
      // рівно один раз, а не на кожне натискання клавіші в полі.
      confirmed: false,
      // Сили, на які гравець має право, але ще не назвав їх.
      powersOwed: 0,
    },
    hp: { current: 6, max: 6 },
    downtime: { open: null, modifiers: {}, rolls: {} },
    downtimeCharges: { max: 1, used: 0 },
    weeklyCharges: { max: 1, used: 0 },
    skillTriggers: [],
    skillCapBonus: 0,
    skillDraft: { name: '', desc: '', level: 1 },
    // Придбані/створені резерви. gamesLeft null — резерв не згорає сам
    // (отриманий за Get Creative); число — скільки ігор він ще живе.
    reserves: [],
    // Безкоштовна покупка резерву за PR: один мех-резерв на місію, без downtime-дії.
    reserveFreeBuy: { max: 1, used: 0 },
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
