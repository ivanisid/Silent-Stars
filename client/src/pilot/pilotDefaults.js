import { PR_START, PR_CAP_BASE } from './constants';
import { manaLevelCost } from './logic';

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
    // games — показане число зіграних ігор. Його не інкрементує ніхто вручну:
    // gm_close_game перераховує його як gamesBase + кількість закритих слотів, де
    // пілот був у затвердженому складі. gamesBase — ігри поза дошкою (до неї або
    // зараховані окремо), у нового пілота їх нуль.
    games: 0,
    gamesBase: 0,
    // Рівень ліцензії більше не виводиться з кількості ігор — він купується за ману
    // і зберігається окремо.
    ll: 2,
    status: 'active',
    resourceMode: 'full',
    // Особисті покращення: owned — придбані ({key: 1}); deposits — внесене частинами
    // в ще не придбані ({key: {mana, pr}}), списане з гаманця.
    hangar: { owned: {}, deposits: {} },
    // Тір 1 стартує з готовим запасом PR (правила: «На старті кожен гравець вже має 30PR»).
    pr: PR_START,
    // Відкритість і вкладка магазину — стан інтерфейсу (ShopDrawer), у пілоті не зберігаються.
    shop: { error: '' },
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
      // Ідеали з імпорту COMP/CON: три major (перший — свій у кожного бонду) і варіанти
      // minor для select. Без імпорту пункти 2–3 беруться з SHARED_MAJOR_IDEALS.
      majorIdeals: [],
      minorIdeals: [],
      // Чекліст на гру (5 пунктів) і вибраний мінорний ідеал; TALLY XP перетворює
      // відмітки на XP.
      checks: [false, false, false, false, false],
      pick: 0,
      // «СКИНУТИ» Bond powers: скільки циклів XP уже не рахуються в лічильнику сил.
      powerOffset: 0,
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
    // Склад рідкісних резервів: до VAULT_CAP штук, не згорають, доки їх не взяли
    // на місію. Наповнюється вручну — рідкісні видають як частину нагороди.
    vault: [],
    contacts: [],
    contactDraft: { name: '', circle: '', help: '', debt: '' },
    // Трекер Get Creative: один проєкт за раз, черги немає.
    // key — резерв, який будується; filled — заповнені секції лічильника.
    creative: { key: null, filled: 0, lastRoll: null },
    mechs: [],
    mechDraft: { name: '', hpMax: '', repairMax: '', frame: '' },
    llEdit: { open: false, ll: '' },
    levelUp: { open: false, mechId: null, allTalents: false, allLicenses: false, error: '' },
    mechEditId: null,
    mechEdit: { hpMax: '', repairMax: '', frame: '' },
    actionLog: [{ ts: nowTs(), msg: 'Пілота створено.' }],
    narrative: '',
    // Записник: окремі нотатки з тегом і прив'язкою до гри замість одного textarea.
    notes: [],
    notesMigrated: true,
  };
}

// Мех: список «limited» (лише лімітні системи) став повним списком зброї та систем
// «items». Старі записи не знають, зброя це чи система, — вони стають системами;
// повторний імпорт з COMP/CON розкладе їх правильно.
function normalizeMech(m) {
  if (Array.isArray(m.items)) return m;
  const { limited, ...rest } = m;
  return {
    ...rest,
    items: (limited || []).map((li) => ({
      name: li.name,
      type: 'system',
      mount: '',
      current: li.current,
      max: li.max,
      base: li.max,
      destroyed: !!li.destroyed,
    })),
  };
}

// Пороги кількості ігор, за якими рівень виводився до переходу на ману.
const LEGACY_GAMES_TABLE = [0, 3, 6, 9, 12, 16, 20, 24, 29, 34, 39, 44];

function legacyLl(games) {
  let ll = 2;
  for (let i = 0; i < LEGACY_GAMES_TABLE.length; i++) {
    if ((games || 0) >= LEGACY_GAMES_TABLE[i]) ll = i + 2;
  }
  return Math.min(ll, 12);
}

// Приводить будь-який збережений стан до поточної форми.
//
// Потрібно не лише для старих рядків: revert_pilot_state замінює стан знімком з
// аудиту цілком, а знімки, зроблені до міграцій, не мають половини теперішніх полів —
// без цього відкат на такий запис ламав би профіль. Міграції роблять те саме в базі,
// тут це страховка на боці клієнта для всього, що приходить повз них.
export function normalizePilotState(raw) {
  const base = createDefaultPilotState();
  if (!raw || typeof raw !== 'object') return base;

  const next = { ...base, ...raw };

  // Рівень: раніше виводився з кількості ігор.
  const ll = raw.ll == null ? legacyLl(raw.games) : raw.ll;
  next.ll = ll;

  // Стара форма стану: мана й прогрес міняються ролями. Мана була валютою магазину,
  // тож стає PR за курсом 200 мани = 10 PR — саме стільки коштував ремонтний комплект
  // тоді й коштує тепер. Зіграні ігри були прогресом до рівня, тож стають маною-XP:
  // частка пройденого шляху, помножена на ціну наступного рівня.
  if (raw.pr == null) {
    const oldMana = Number(raw.mana?.balance) || 0;
    const dc = Number(raw.dcStore) || 0;
    // У PR іде рівно стільки, скільки влазить під кап; решта старої мани не згорає,
    // а лишається як XP — разом із тим, що не добрало до цілого PR.
    const prFromMana = Math.min(Math.floor(oldMana / 20), Math.max(0, PR_CAP_BASE - dc));
    next.pr = Math.min(prFromMana + dc, PR_CAP_BASE);
    const leftover = oldMana - prFromMana * 20;

    const cost = manaLevelCost(ll);
    let progress = 0;
    if (cost != null) {
      const prev = LEGACY_GAMES_TABLE[ll - 2] ?? 0;
      const nextTh = LEGACY_GAMES_TABLE[ll - 1];
      if (nextTh != null && nextTh > prev) {
        const frac = Math.min(1, Math.max(0, ((raw.games || 0) - prev) / (nextTh - prev)));
        progress = Math.round(frac * cost);
      }
    }
    next.mana = { ...base.mana, ...(raw.mana || {}), balance: progress + leftover };
  }

  // Burden-и: було три наперед створені слоти з вибором типу.
  if (Array.isArray(raw.burdens) && raw.burdens.some((b) => b && b.size === undefined)) {
    next.burdens = raw.burdens
      .filter((b) => b && ((b.name || '').trim() !== '' || (b.filled || 0) > 0))
      .map((b, i) => {
        const size = b.type === 'minor4' ? 4 : b.type === 'middle6' ? 6 : 8;
        return { id: Date.now() + i, name: b.name || '', size, healed: Math.min(b.filled || 0, size - 1) };
      });
  }

  // Бонд: нові поля поверх наявних, вибір вважається зробленим, якщо архетип уже вписано.
  next.bond = {
    ...base.bond,
    ...(raw.bond || {}),
    marked: { ...base.bond.marked, ...(raw.bond?.marked || {}) },
    confirmed: raw.bond?.confirmed ?? ((raw.bond?.archetype || '').trim() !== ''),
  };

  if (raw.pr != null) next.mana = { ...base.mana, ...(raw.mana || {}) };
  // Старі поля: стан вікон магазину (відкритість, вкладка, вибір, розподіл зарядів),
  // вікно витрати PR і лічильник безкоштовної покупки резерву.
  delete next.reserveFreeBuy;
  delete next.prSpend;
  next.shop = { ...base.shop };
  // Від старого ангару лишаються лише придбані; стан вікна підтвердження відкидається.
  next.hangar = { owned: { ...(raw.hangar?.owned || {}) }, deposits: { ...(raw.hangar?.deposits || {}) } };
  next.mechs = (raw.mechs || []).map(({ dc, ...m }) => normalizeMech(m));

  // Записник: старий єдиний текст стає першою (закріпленою) нотаткою — один раз.
  if (!raw.notesMigrated) {
    const text = (raw.narrative || '').trim();
    next.notes = Array.isArray(raw.notes) ? raw.notes : [];
    if (text) {
      next.notes = [
        { id: Date.now(), date: new Date().toISOString(), tag: null, gameId: null, gameLabel: '', text, pinned: true },
        ...next.notes,
      ];
    }
    next.notesMigrated = true;
  }
  delete next.limitedDraft;

  // Поля, яких у новій формі більше немає.
  delete next.dcStore;
  delete next.buf;
  delete next.dcr;
  delete next.projects;
  delete next.projectDraft;

  return next;
}
