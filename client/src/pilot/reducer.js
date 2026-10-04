import {
  SHOP_DATA,
  PR_PACK_SIZE,
  HANGAR_DATA,
  WEEKLY_DOWNTIME_DATA,
  PR_SERVICES,
  PR_CAP_BASE,
  PR_CAP_BUFFER,
  MAX_LL,
  REDISTRIBUTE_TALENTS_COST,
  REDISTRIBUTE_LICENSES_COST,
  BOND_XP_PER_POWER,
  BOND_POWERS_ON_CHOOSE,
  BOND_POWERS_FOR_VETERAN,
  BOND_POWERS_FOR_MASTER,
} from './constants';
import {
  clamp,
  manaLevelCost,
  newId,
  nextBurdenSize,
  toggleFilled,
  shopPrice,
  rollTier,
  relationshipLabel,
  nextRelationship,
  pushLog,
  skillCapMax,
  skillCapUsed,
} from './logic';
import { mergeMechsByName } from './compconImport';
import { repairPlan, repairCost, spentText, isLimited, itemRefillPr, KIT_PR, KITS_FULL_PR, MECH_STRUCTURE, MECH_REACTOR } from './repair';
import { RESERVE_RANK_PR, reserveByKey, reserveGamesLeft } from './reserves';
import { RARE_RESERVES, rareReserveByKey, anyReserveByKey, vaultCap } from './rareReserves';

const ALL_DOWNTIME_DATA = WEEKLY_DOWNTIME_DATA;

function log(state, msg, op = false) {
  return { ...state, actionLog: pushLog(state.actionLog, msg, op) };
}

// Повний ремонт зброї/систем: знищене відновлюється, лімітні заряди — до максимуму.
function restoreItems(items) {
  return (items || []).map((it) => (isLimited(it) ? { ...it, current: it.max, destroyed: false } : { ...it, destroyed: false }));
}

function updateItem(state, id, idx, fn) {
  return updateMech(state, id, (m) => ({ ...m, items: m.items.map((it, i) => (i === idx ? fn(it) : it)) }));
}

const NOTE_TAGS = ['session', 'npc', 'loot', 'goals'];
const BOND_CHECKS = 5;

function updateMech(state, id, updater) {
  return {
    ...state,
    mechs: state.mechs.map((m) => (m.id === id ? updater(m) : m)),
  };
}

function findMech(state, id) {
  return state.mechs.find((m) => m.id === id);
}

function prCap(state) {
  return (state.hangar.owned.buffer || 0) >= 1 ? PR_CAP_BUFFER : PR_CAP_BASE;
}

// Кап складу рідкісних резервів — завжди базовий (див. vaultCap у rareReserves.js).
function vCap(state) {
  return vaultCap(state.hangar.owned);
}

// Ціна послуги за PR. Для поповнення зарядів однієї системи вона залежить від самої
// системи, тож рахується з обраної в модалці, а не береться зі списку.
function prServiceCost(key, mech, alloc) {
  const svc = PR_SERVICES.find((x) => x.key === key);
  if (!svc) return null;
  if (key !== 'refillone') return svc.cost;
  const idx = Object.keys(alloc || {})[0];
  const it = idx == null ? null : mech?.items?.[idx];
  return isLimited(it) ? itemRefillPr(it) : null;
}

function pushManaHistory(mana, label) {
  return { ...mana, history: [{ label }, ...mana.history].slice(0, 4) };
}

export function pilotReducer(state, action) {
  if (action.type === '__INIT__') return action.state;

  switch (action.type) {
    // ---------- Header / status / LL ----------
    case 'TOGGLE_STATUS': {
      const next = state.status === 'active' ? 'archive' : 'active';
      return log({ ...state, status: next }, `Статус: ${state.status} → ${next}`);
    }
    // Ручного додавання гри більше немає: лічильник веде сервер, коли ГМ закриває
    // слот (gm_resolve_slot). Кнопка лишалася з часів, коли з ігор виводився рівень.
    case 'TOGGLE_LL_EDIT': {
      const open = !state.llEdit.open;
      return {
        ...state,
        llEdit: { ...state.llEdit, open, ll: open ? String(state.ll) : state.llEdit.ll },
      };
    }
    case 'SET_LL_EDIT_LL':
      return { ...state, llEdit: { ...state.llEdit, ll: action.value } };
    // Ручне виправлення рівня оминає ману: це інструмент звірки, а не підвищення.
    case 'SAVE_LL_EDIT': {
      const ll = clamp(parseInt(state.llEdit.ll, 10) || 2, 2, MAX_LL);
      if (ll === state.ll) return { ...state, llEdit: { ...state.llEdit, open: false } };
      return log(
        { ...state, ll, llEdit: { ...state.llEdit, open: false } },
        `ЛЛ виправлено вручну: ${state.ll} → ${ll}`,
      );
    }
    // ---------- Підвищення рівня за ману ----------
    // Рівень не піднімається сам при накопиченні мани: це явна покупка, яка списує ману
    // з гаманця. Модалка потрібна навіть коли вибирати нема чого, бо підвищення дає
    // ще й безкоштовний повний ремонт одного меха та платні перерозподіли.
    case 'OPEN_LEVEL_UP': {
      if (manaLevelCost(state.ll) == null) return state;
      const only = state.mechs.length === 1 ? state.mechs[0].id : null;
      return { ...state, levelUp: { open: true, mechId: only, allTalents: false, allLicenses: false, error: '' } };
    }
    case 'CLOSE_LEVEL_UP':
      return { ...state, levelUp: { open: false, mechId: null, allTalents: false, allLicenses: false, error: '' } };
    case 'SET_LEVEL_UP_MECH':
      return { ...state, levelUp: { ...state.levelUp, mechId: action.mechId, error: '' } };
    case 'TOGGLE_LEVEL_UP_EXTRA':
      return { ...state, levelUp: { ...state.levelUp, [action.field]: !state.levelUp[action.field], error: '' } };
    case 'CONFIRM_LEVEL_UP': {
      const lu = state.levelUp;
      const base = manaLevelCost(state.ll);
      if (base == null) return state;

      const extras =
        (lu.allTalents ? REDISTRIBUTE_TALENTS_COST : 0) +
        (lu.allLicenses ? REDISTRIBUTE_LICENSES_COST : 0);
      const totalCost = base + extras;
      if (totalCost > state.mana.balance) {
        return { ...state, levelUp: { ...lu, error: 'Недостатньо мани.' } };
      }
      // Мех обов'язковий лише коли він є: пілот без меха просто не отримує ремонту.
      if (state.mechs.length > 0 && lu.mechId == null) {
        return { ...state, levelUp: { ...lu, error: 'Оберіть меха для повного ремонту.' } };
      }

      const nextLl = state.ll + 1;
      let next = { ...state, ll: nextLl };

      if (lu.mechId != null) {
        next = updateMech(next, lu.mechId, (m) => ({
          ...m,
          hpCurrent: m.hpMax,
          repairCurrent: m.repairMax,
          structureFilled: 0,
          reactorFilled: 0,
          overcharge: 0,
          corePower: true,
          items: restoreItems(m.items),
        }));
      }

      const mana = pushManaHistory(
        { ...next.mana, balance: next.mana.balance - totalCost },
        `−${totalCost} · ЛЛ ${state.ll} → ${nextLl}`,
      );
      next = { ...next, mana, levelUp: { open: false, mechId: null, allTalents: false, allLicenses: false, error: '' } };

      const repaired = state.mechs.find((m) => m.id === lu.mechId);
      const notes = [
        repaired ? `повний ремонт «${repaired.name}»` : null,
        lu.allTalents ? `перерозподіл усіх талантів (+${REDISTRIBUTE_TALENTS_COST})` : null,
        lu.allLicenses ? `перерозподіл усіх ліцензій (+${REDISTRIBUTE_LICENSES_COST})` : null,
      ].filter(Boolean);

      return log(
        next,
        `ЛЛ ${state.ll} → ${nextLl} за ${totalCost} мани` + (notes.length ? ` · ${notes.join(', ')}` : ''),
      );
    }

    case 'SET_RESOURCE_MODE':
      return { ...state, resourceMode: action.mode };

    // ---------- Stress / Burdens ----------
    case 'SET_STRESS': {
      const next = Math.min(toggleFilled(state.stress, action.idx), state.stressMax);
      if (next === state.stress) return state;
      return log({ ...state, stress: next }, `Стрес: ${state.stress} → ${next}`);
    }
    case 'SET_STRESS_MAX': {
      const next = clamp(parseInt(action.value, 10) || 0, 1, 20);
      if (next === state.stressMax) return state;
      return log(
        { ...state, stressMax: next, stress: Math.min(state.stress, next) },
        `Ліміт стресу: ${state.stressMax} → ${next}`,
      );
    }
    // Стрес не витрачається, а записується: допомога і push коштують саме того, що
    // пілот бере на себе ще стресу. Перевищення ліміту дає burden.
    case 'TAKE_STRESS': {
      const amount = action.amount || 1;
      const raw = state.stress + amount;
      const overflow = raw > state.stressMax;
      let next = { ...state, stress: Math.min(raw, state.stressMax) };
      const reason = action.reason ? ` (${action.reason})` : '';

      if (!overflow) {
        return log(next, `Стрес +${amount}${reason}: ${state.stress} → ${next.stress}`);
      }

      const active = state.burdens.length;
      const size = nextBurdenSize(active);
      if (size == null) {
        // Четвертий burden — це смерть. Додаток її не оформлює сам, лише фіксує.
        return log(
          next,
          `Стрес +${amount}${reason} перевищив ліміт, але burden-ів уже три — ЧЕТВЕРТИЙ BURDEN ОЗНАЧАЄ СМЕРТЬ ПЕРСОНАЖА`,
        );
      }
      next = {
        ...next,
        burdens: [...state.burdens, { id: newId(state.burdens), name: '', size, healed: 0 }],
      };
      return log(
        next,
        `Стрес +${amount}${reason} перевищив ліміт ${state.stressMax} — отримано burden на ${size} сегментів, пілот не діє далі в сцені`,
      );
    }
    case 'ADD_BURDEN': {
      const size = nextBurdenSize(state.burdens.length);
      if (size == null) {
        return log(state, 'ЧЕТВЕРТИЙ BURDEN ОЗНАЧАЄ СМЕРТЬ ПЕРСОНАЖА — не записано автоматично');
      }
      return log(
        { ...state, burdens: [...state.burdens, { id: newId(state.burdens), name: '', size, healed: 0 }] },
        `Отримано burden на ${size} сегментів`,
      );
    }
    case 'SET_BURDEN_NAME':
      return {
        ...state,
        burdens: state.burdens.map((b) => (b.id === action.id ? { ...b, name: action.value } : b)),
      };
    // Сегменти burden-а — це прогрес лікування: коли заповнені всі, він зникає.
    case 'SET_BURDEN_HEALED': {
      const b = state.burdens.find((x) => x.id === action.id);
      if (!b) return state;
      const next = toggleFilled(b.healed, action.idx);
      if (next >= b.size) {
        return log(
          { ...state, burdens: state.burdens.filter((x) => x.id !== action.id) },
          `Burden «${b.name || 'без назви'}» вилікувано`,
        );
      }
      return log(
        { ...state, burdens: state.burdens.map((x) => (x.id === action.id ? { ...x, healed: next } : x)) },
        `Burden «${b.name || 'без назви'}»: лікування ${b.healed} → ${next}/${b.size}`,
      );
    }
    case 'REMOVE_BURDEN': {
      const b = state.burdens.find((x) => x.id === action.id);
      if (!b) return state;
      return log(
        { ...state, burdens: state.burdens.filter((x) => x.id !== action.id) },
        `Burden «${b.name || 'без назви'}» прибрано вручну`,
      );
    }
    case 'TOGGLE_DOWN_AND_OUT': {
      const next = !state.downAndOut;
      return log({ ...state, downAndOut: next }, `Down and out: ${next ? 'отримано' : 'знято'}`);
    }

    // ---------- Bond ----------
    case 'SET_ARCHETYPE':
      return { ...state, bond: { ...state.bond, archetype: action.value } };
    case 'SET_BOND_FIELD':
      return { ...state, bond: { ...state.bond, [action.field]: action.value } };
    case 'SET_BOND_NEW_POWER':
      return { ...state, bond: { ...state.bond, newPower: action.value } };
    // XP накопичується без обрізання; трек показує позицію в поточному циклі з 8.
    // Клік по сегменту виправляє саме цю позицію, пройдені цикли не чіпає.
    case 'SET_BOND_XP': {
      const xp = state.bond.xp || 0;
      const base = Math.floor(xp / BOND_XP_PER_POWER) * BOND_XP_PER_POWER;
      const next = base + toggleFilled(xp - base, action.idx);
      if (next === xp) return state;
      return log({ ...state, bond: { ...state.bond, xp: next } }, `Bond XP: ${xp} → ${next}`);
    }
    case 'TOGGLE_BOND_CHECK': {
      const checks = Array.from({ length: BOND_CHECKS }, (_, i) => !!state.bond.checks?.[i]);
      checks[action.idx] = !checks[action.idx];
      return { ...state, bond: { ...state.bond, checks } };
    }
    case 'SET_BOND_PICK':
      return { ...state, bond: { ...state.bond, pick: Number(action.value) || 0 } };
    // +1 XP за кожну відмітку; відмітки знімаються, вибір мінорного ідеалу — на перший.
    case 'TALLY_BOND_XP': {
      const gained = (state.bond.checks || []).filter(Boolean).length;
      if (!gained) return state;
      const xp = (state.bond.xp || 0) + gained;
      return log(
        { ...state, bond: { ...state.bond, xp, checks: Array(BOND_CHECKS).fill(false), pick: 0 } },
        `Tally XP: +${gained} XP бонду (${state.bond.xp || 0} → ${xp})`,
      );
    }
    // «СКИНУТИ» повертає Bond powers до 1; XP не змінюється.
    case 'RESET_BOND_POWERS': {
      const offset = Math.floor((state.bond.xp || 0) / BOND_XP_PER_POWER);
      if (offset === (state.bond.powerOffset || 0)) return state;
      return log({ ...state, bond: { ...state.bond, powerOffset: offset } }, 'Bond powers скинуто до 1');
    }
    // Бонд із COMP/CON «Save Pilot»: назва, три major ideals, мінорні — у select, XP.
    case 'IMPORT_BOND': {
      const b = action.payload;
      const xp = b.xp ?? state.bond.xp;
      return log(
        {
          ...state,
          bond: {
            ...state.bond,
            archetype: b.name,
            confirmed: true,
            majorIdeals: b.major,
            minorIdeals: b.minor,
            xp,
            checks: Array(BOND_CHECKS).fill(false),
            pick: 0,
          },
        },
        `Бонд «${b.name}» підтягнуто з COMP/CON: ${b.minor.length} мінорних ідеалів, XP ${xp}`,
      );
    }
    case 'TOGGLE_IDEAL':
      return {
        ...state,
        bond: { ...state.bond, marked: { ...state.bond.marked, [action.key]: !state.bond.marked[action.key] } },
      };
    // Наприкінці гри кожен виконаний ідеал дає 1 XP, після чого відмітки знімаються.
    // Поки бонд не обрано, рахуються лише два спільні major ideals — перший у кожного
    // бонду свій, а бонду ще немає.
    case 'SCORE_IDEALS': {
      const m = state.bond.marked;
      const keys = state.bond.confirmed
        ? ['major0', 'major1', 'major2', 'minor']
        : ['major1', 'major2'];
      const gained = keys.filter((k) => m[k]).length;
      if (gained === 0) return state;
      const next = state.bond.xp + gained;
      return log(
        {
          ...state,
          bond: {
            ...state.bond,
            xp: next,
            marked: { major0: false, major1: false, major2: false, minor: false },
          },
        },
        `Ідеали за гру: +${gained} XP бонду (${state.bond.xp} → ${next})`,
      );
    }
    // Вибір бонду на Тірі 2 дає 2 сили плюс по одній за кожен скид лічильника XP,
    // зроблений до вибору. Фіксується один раз — повторно нарахувати не можна.
    case 'CONFIRM_BOND_CHOICE': {
      if (state.bond.confirmed) return state;
      if (!state.bond.archetype.trim()) return state;
      const earned = state.bond.deferredResets;
      const owed = state.bond.powersOwed + BOND_POWERS_ON_CHOOSE + earned;
      return log(
        { ...state, bond: { ...state.bond, confirmed: true, powersOwed: owed, deferredResets: 0 } },
        `Бонд обрано: «${state.bond.archetype.trim()}» — ${BOND_POWERS_ON_CHOOSE} сили` +
          (earned > 0 ? ` + ${earned} за Тір 1 без бонду` : '') +
          ` (доступно сил: ${owed})`,
      );
    }

    // Обмін 8 XP на нову силу. XP не обрізається на 8: надлишок лишається на наступну.
    case 'CLAIM_BOND_POWER': {
      const name = state.bond.newPower.trim();
      if (!name || !state.bond.confirmed) return state;

      // Спершу витрачаються сили, на які вже є право, і тільки потім XP.
      if (state.bond.powersOwed > 0) {
        const owed = state.bond.powersOwed - 1;
        return log(
          { ...state, bond: { ...state.bond, powersOwed: owed, powers: [...state.bond.powers, name], newPower: '' } },
          `Сила бонду: «${name}» (лишилось нерозподілених: ${owed})`,
        );
      }
      if (state.bond.xp < BOND_XP_PER_POWER) return state;
      const xp = state.bond.xp - BOND_XP_PER_POWER;
      return log(
        { ...state, bond: { ...state.bond, xp, powers: [...state.bond.powers, name], newPower: '' } },
        `Сила бонду за ${BOND_XP_PER_POWER} XP: «${name}» (XP ${state.bond.xp} → ${xp})`,
      );
    }
    // Без обраного бонду 8 XP не дають силу — лічильник скидається, і кожен скид
    // потім конвертується в силу при виборі бонду.
    case 'RESET_DEFERRED_XP': {
      if (state.bond.confirmed) return state;
      if (state.bond.xp < BOND_XP_PER_POWER) return state;
      const xp = state.bond.xp - BOND_XP_PER_POWER;
      const resets = state.bond.deferredResets + 1;
      return log(
        { ...state, bond: { ...state.bond, xp, deferredResets: resets } },
        `Лічильник XP скинуто без бонду (всього скидів: ${resets})`,
      );
    }
    case 'ADD_POWER': {
      const name = state.bond.newPower.trim();
      if (!name) return state;
      return log(
        { ...state, bond: { ...state.bond, powers: [...state.bond.powers, name], newPower: '' } },
        `Сила бонду додана вручну: «${name}»`,
      );
    }
    case 'REMOVE_POWER': {
      const name = state.bond.powers[action.idx];
      return log(
        { ...state, bond: { ...state.bond, powers: state.bond.powers.filter((_, i) => i !== action.idx) } },
        `Сила бонду видалена: «${name}»`,
      );
    }

    // ---------- HP mode ----------
    case 'INC_HP': {
      const next = clamp(state.hp.current + 1, 0, state.hp.max);
      if (next === state.hp.current) return state;
      return log({ ...state, hp: { ...state.hp, current: next } }, `ХП: ${state.hp.current} → ${next}`);
    }
    case 'DEC_HP': {
      const next = clamp(state.hp.current - 1, 0, state.hp.max);
      if (next === state.hp.current) return state;
      return log({ ...state, hp: { ...state.hp, current: next } }, `ХП: ${state.hp.current} → ${next}`);
    }

    // ---------- Downtime ----------
    case 'TOGGLE_DOWNTIME':
      return { ...state, downtime: { ...state.downtime, open: state.downtime.open === action.key ? null : action.key } };
    case 'SET_DOWNTIME_MOD':
      return {
        ...state,
        downtime: { ...state.downtime, modifiers: { ...state.downtime.modifiers, [action.key]: action.mod } },
      };
    case 'RESET_CHARGES': {
      return log(
        { ...state, weeklyCharges: { ...state.weeklyCharges, used: 0 } },
        'Тижневі заряди скинуто (новий тиждень)',
      );
    }
    // Лишився тільки щотижневий пул: передмісійний даунтайм прибраний із чарника.
    case 'ROLL_DOWNTIME': {
      const field = 'weeklyCharges';
      const { used, max } = state[field];
      if (used >= max) return state;
      const def = ALL_DOWNTIME_DATA.find((d) => d.key === action.key);
      const die = 1 + Math.floor(Math.random() * 20);
      const mod = state.downtime.modifiers[action.key] || 0;
      const total = die + mod;
      const tier = rollTier(total);
      let next = {
        ...state,
        downtime: { ...state.downtime, rolls: { ...state.downtime.rolls, [action.key]: { die, total, tier } } },
        [field]: { ...state[field], used: used + 1 },
      };
      if (def?.clearsStress) next = { ...next, stress: 0 };
      return log(next, `Даунтайм «${def?.title || action.key}»: Д20(${die})+${mod}=${total} → ${tier}`);
    }
    // ---------- Get rest ----------
    // Три опції, кожна витрачає щотижневий заряд. Кубики задані правилами точно,
    // тож кидає додаток, а не гравець.
    case 'REST_DRINK': {
      const { used, max } = state.weeklyCharges;
      if (used >= max) return state;
      const die = 1 + Math.floor(Math.random() * 4);
      const removed = Math.min(state.stress, Math.floor(state.stress / 2) + die);
      const next = state.stress - removed;
      return log(
        { ...state, stress: next, weeklyCharges: { ...state.weeklyCharges, used: used + 1 } },
        `Get a Damn Drink: знято половину (${Math.floor(state.stress / 2)}) + 1Д4(${die}) — стрес ${state.stress} → ${next}`,
      );
    }
    case 'REST_AID': {
      const { used, max } = state.weeklyCharges;
      if (used >= max) return state;
      const b = state.burdens.find((x) => x.id === action.id);
      if (!b) return state;
      const die = 1 + Math.floor(Math.random() * 4);
      const healed = b.healed + die;
      const spent = { ...state.weeklyCharges, used: used + 1 };
      if (healed >= b.size) {
        return log(
          { ...state, burdens: state.burdens.filter((x) => x.id !== b.id), weeklyCharges: spent },
          `Get aid: 1Д4(${die}) — burden «${b.name || 'без назви'}» вилікувано`,
        );
      }
      return log(
        {
          ...state,
          burdens: state.burdens.map((x) => (x.id === b.id ? { ...x, healed } : x)),
          weeklyCharges: spent,
        },
        `Get aid: 1Д4(${die}) — burden «${b.name || 'без назви'}» ${b.healed} → ${healed}/${b.size}`,
      );
    }
    case 'REST_MEDICAL': {
      const { used, max } = state.weeklyCharges;
      if (used >= max) return state;
      return log(
        {
          ...state,
          hp: { ...state.hp, current: state.hp.max },
          downAndOut: false,
          weeklyCharges: { ...state.weeklyCharges, used: used + 1 },
        },
        `Get medical help: ХП відновлено до ${state.hp.max}` +
          (state.downAndOut ? ', стан down and out знято' : ''),
      );
    }

    case 'USE_FOCUS': {
      const { used, max } = state.weeklyCharges;
      if (used >= max) return state;
      return log(
        {
          ...state,
          weeklyCharges: { ...state.weeklyCharges, used: used + 1 },
          skillCapBonus: state.skillCapBonus + 1,
        },
        `Сфокусуватись: ліміт скіл-тригерів +1`,
      );
    }

    // ---------- Skill triggers ----------
    case 'SET_SKILL_DRAFT_FIELD':
      return { ...state, skillDraft: { ...state.skillDraft, [action.field]: action.value } };
    case 'SET_SKILL_DRAFT_LEVEL':
      return { ...state, skillDraft: { ...state.skillDraft, level: action.level } };
    case 'ADD_SKILL_TRIGGER': {
      const { name, desc, level } = state.skillDraft;
      if (!name.trim()) return state;
      const ll = state.ll;
      if (skillCapUsed(state.skillTriggers) + level > skillCapMax(ll, state.skillCapBonus)) return state;
      const trigger = { id: newId(state.skillTriggers), name: name.trim(), desc: desc.trim(), level };
      return log(
        {
          ...state,
          skillTriggers: [...state.skillTriggers, trigger],
          skillDraft: { name: '', desc: '', level: 1 },
        },
        `Скіл-тригер додано: «${trigger.name}» (+${level * 2})`,
      );
    }
    case 'REMOVE_SKILL_TRIGGER': {
      const t = state.skillTriggers.find((tr) => tr.id === action.id);
      return log(
        { ...state, skillTriggers: state.skillTriggers.filter((tr) => tr.id !== action.id) },
        `Скіл-тригер видалено: «${t?.name}»`,
      );
    }
    case 'CHANGE_SKILL_LEVEL': {
      const t = state.skillTriggers.find((tr) => tr.id === action.id);
      if (!t) return state;
      const next = t.level + action.delta;
      if (next < 1 || next > 3) return state;
      const ll = state.ll;
      const used = skillCapUsed(state.skillTriggers) - t.level + next;
      if (used > skillCapMax(ll, state.skillCapBonus)) return state;
      return log(
        {
          ...state,
          skillTriggers: state.skillTriggers.map((tr) => (tr.id === action.id ? { ...tr, level: next } : tr)),
        },
        `«${t.name}»: рівень ${t.level} → ${next}`,
      );
    }

    // ---------- Contacts ----------
    case 'SET_CONTACT_DRAFT_FIELD':
      return { ...state, contactDraft: { ...state.contactDraft, [action.field]: action.value } };
    case 'ADD_CONTACT': {
      const { name, circle, help, debt } = state.contactDraft;
      if (!name.trim()) return state;
      const contact = {
        name: name.trim(),
        circle: circle.trim(),
        help: help.trim(),
        debt: debt.trim() || 'Без боргу',
        relationship: 'neutral',
      };
      return log(
        {
          ...state,
          contacts: [...state.contacts, contact],
          contactDraft: { name: '', circle: '', help: '', debt: '' },
        },
        `Контакт додано: «${contact.name}»`,
      );
    }
    case 'REMOVE_CONTACT': {
      const c = state.contacts[action.idx];
      return log(
        { ...state, contacts: state.contacts.filter((_, i) => i !== action.idx) },
        `Контакт видалено: «${c?.name}»`,
      );
    }
    case 'CYCLE_RELATIONSHIP': {
      const c = state.contacts[action.idx];
      const next = nextRelationship(c.relationship);
      return log(
        {
          ...state,
          contacts: state.contacts.map((cc, i) => (i === action.idx ? { ...cc, relationship: next } : cc)),
        },
        `Контакт «${c.name}»: стосунки → ${relationshipLabel(next)}`,
      );
    }

    // ---------- Mana ----------
    case 'OPEN_TX':
      return { ...state, mana: { ...state.mana, txOpen: true, amount: '', comment: '', target: '', error: '' } };
    case 'CLOSE_TX':
      return { ...state, mana: { ...state.mana, txOpen: false } };
    case 'SET_TX_TYPE':
      return { ...state, mana: { ...state.mana, txType: action.value } };
    case 'SET_TX_AMOUNT':
      return { ...state, mana: { ...state.mana, amount: action.value } };
    case 'SET_TX_COMMENT':
      return { ...state, mana: { ...state.mana, comment: action.value } };
    case 'SET_TX_TARGET':
      return { ...state, mana: { ...state.mana, target: action.value } };
    case 'SUBMIT_TX': {
      const { txType, amount, comment, target, balance } = state.mana;
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) {
        return { ...state, mana: { ...state.mana, error: 'Вкажи додатну кількість.' } };
      }
      let nextBalance = balance;
      let label = '';
      if (txType === 'deposit') {
        nextBalance = balance + amt;
        label = `+${amt}${comment ? ' · ' + comment : ''}`;
      } else if (txType === 'withdraw') {
        if (amt > balance) return { ...state, mana: { ...state.mana, error: 'Недостатньо мани — баланс не може бути менше 0.' } };
        nextBalance = balance - amt;
        label = `−${amt}${comment ? ' · ' + comment : ''}`;
      } else {
        if (amt > balance) return { ...state, mana: { ...state.mana, error: 'Недостатньо мани для переказу.' } };
        nextBalance = balance - amt;
        label = `→ ${target || 'пілот'}: ${amt}${comment ? ' · ' + comment : ''}`;
      }
      const mana = pushManaHistory(
        { ...state.mana, balance: nextBalance, txOpen: false, amount: '', comment: '', target: '', error: '' },
        label,
      );
      return log({ ...state, mana }, `Мана: ${label}`);
    }

    // ---------- Hangar ----------
    case 'TOGGLE_HANGAR_OPEN':
      return { ...state, hangar: { ...state.hangar, open: !state.hangar.open } };
    case 'OPEN_HANGAR_CONFIRM':
      return { ...state, hangar: { ...state.hangar, confirm: action.key, error: '' } };
    case 'CLOSE_HANGAR_CONFIRM':
      return { ...state, hangar: { ...state.hangar, confirm: null, error: '' } };
    case 'CONFIRM_HANGAR_BUY': {
      const key = state.hangar.confirm;
      const item = HANGAR_DATA.find((h) => h.key === key);
      const owned = state.hangar.owned[key] || 0;
      if (!item || owned >= item.prices.length) {
        return { ...state, hangar: { ...state.hangar, confirm: null } };
      }
      const price = item.prices[owned];
      const prPrice = item.pr?.[owned] || 0;
      if (item.requires && !state.hangar.owned[item.requires]) {
        const req = HANGAR_DATA.find((h) => h.key === item.requires);
        return { ...state, hangar: { ...state.hangar, error: `Спершу потрібне «${req?.title || item.requires}».` } };
      }
      if (price > state.mana.balance) {
        return { ...state, hangar: { ...state.hangar, error: 'Недостатньо мани.' } };
      }
      if (prPrice > state.pr) {
        return { ...state, hangar: { ...state.hangar, error: 'Недостатньо PR.' } };
      }
      const lvl = item.prices.length > 1 ? ' рів.' + (owned + 1) : '';
      const mana = pushManaHistory(
        { ...state.mana, balance: state.mana.balance - price },
        `−${price} · ${item.title}${lvl}`,
      );
      return log(
        {
          ...state,
          mana,
          pr: state.pr - prPrice,
          hangar: { ...state.hangar, owned: { ...state.hangar.owned, [key]: owned + 1 }, confirm: null, error: '' },
        },
        `Ангар: придбано «${item.title}»${lvl} за ${price} мани${prPrice ? ` і ${prPrice} PR` : ''}`,
      );
    }

    // ---------- Пул PR ----------
    // dir — на скільки зсунути; кнопки панелі шлють ±1 і ±10, кап і нуль ріже clamp.
    case 'PR_SHIFT': {
      const next = clamp(state.pr + action.dir, 0, prCap(state));
      if (next === state.pr) return state;
      return log({ ...state, pr: next }, `PR: ${state.pr} → ${next}`);
    }

    // Транзакція на довільну суму. Форма живе в локальному стані панелі й сама не пускає
    // сюди те, що не проходить (нуль, від'ємний баланс, перебір капа), тому сюди приходить
    // уже перевірене число, а перевірки нижче — запобіжник: на відміну від PR_SHIFT ця дія
    // нічого не ріже мовчки, бо суму назвав гравець і врізана сума була б брехнею.
    case 'PR_TX': {
      const amount = Math.floor(Number(action.amount));
      if (!Number.isFinite(amount) || amount <= 0) return state;
      const delta = action.mode === 'withdraw' ? -amount : amount;
      const next = state.pr + delta;
      if (next < 0 || next > prCap(state)) return state;
      const note = (action.comment || '').trim();
      return log(
        { ...state, pr: next },
        `PR ${action.mode === 'withdraw' ? '−' : '+'}${amount}: ${state.pr} → ${next}` +
          (note ? ` · ${note}` : ''),
      );
    }

    // ---------- Витрата PR на додатковий ремонт (prSpend) ----------
    case 'OPEN_PR_SPEND':
      return { ...state, prSpend: { item: action.key, mechId: null, pick: null, error: '' } };
    case 'CLOSE_PR_SPEND':
      return { ...state, prSpend: { item: null, mechId: null, pick: null, error: '' } };
    case 'SET_PR_SPEND_MECH':
      return { ...state, prSpend: { ...state.prSpend, mechId: action.mechId, pick: null } };
    // Поповнення зарядів тепер бере систему цілком, а не розподіляє окремі заряди:
    // ціна залежить від базового запасу саме цієї системи.
    case 'SET_PR_SPEND_PICK':
      return { ...state, prSpend: { ...state.prSpend, pick: action.idx, error: '' } };
    case 'PR_SPEND_CONFIRM': {
      const { item: key, mechId, pick } = state.prSpend;
      const mech = findMech(state, mechId);
      if (!mech) return { ...state, prSpend: { ...state.prSpend, error: 'Оберіть меха.' } };
      if (key === 'refillone' && pick == null) {
        return { ...state, prSpend: { ...state.prSpend, error: 'Оберіть систему.' } };
      }
      const cost = prServiceCost(key, mech, pick == null ? {} : { [pick]: 1 });
      if (cost == null) return state;
      if (cost > state.pr) return { ...state, prSpend: { ...state.prSpend, error: 'Недостатньо PR.' } };

      const svc = PR_SERVICES.find((x) => x.key === key);
      let nextState = updateMech(state, mechId, (m) => {
        if (key === 'kit') return { ...m, repairCurrent: Math.min(m.repairMax, m.repairCurrent + 1) };
        if (key === 'kitsfull') return { ...m, repairCurrent: m.repairMax };
        if (key === 'refillone') {
          return {
            ...m,
            items: m.items.map((it, i) => (i === pick ? { ...it, current: it.max, destroyed: false } : it)),
          };
        }
        if (key === 'fullrepair') {
          return {
            ...m,
            hpCurrent: m.hpMax,
            repairCurrent: m.repairMax,
            structureFilled: 0,
            reactorFilled: 0,
            overcharge: 0,
            corePower: true,
            items: restoreItems(m.items),
          };
        }
        return m;
      });

      const before = state.pr;
      nextState = { ...nextState, pr: before - cost, prSpend: { item: null, mechId: null, pick: null, error: '' } };
      return log(nextState, `${mech.name}: «${svc.title}» за ${cost} PR (PR ${before} → ${before - cost})`);
    }

    // ---------- Get Creative ----------
    // Один проєкт за раз. Щотижнева дія витрачається на початок: далі перед кожною
    // місією кидається Д20, який заповнює секції за результатом (1–9 → 1, 10–19 → 2,
    // 20+ → 3). Заповнений лічильник віддає резерв, і той не згорає після місії.
    case 'START_CREATIVE': {
      const { used, max } = state.weeklyCharges;
      if (used >= max) return state;
      if (state.creative.key) return state;
      const def = reserveByKey(action.key);
      if (!def) return state;
      return log(
        {
          ...state,
          creative: { key: def.key, filled: 0, lastRoll: null },
          weeklyCharges: { ...state.weeklyCharges, used: used + 1 },
        },
        `Get Creative: почато «${def.name}» — лічильник на ${def.rank} ${def.rank === 1 ? 'секцію' : 'секції'}`,
      );
    }
    case 'ROLL_CREATIVE': {
      const cur = state.creative;
      const def = reserveByKey(cur.key);
      if (!def) return state;
      const die = 1 + Math.floor(Math.random() * 20);
      const tier = rollTier(die);
      const gain = tier === '20+' ? 3 : tier === '10–19' ? 2 : 1;
      const filled = Math.min(def.rank, cur.filled + gain);
      return log(
        { ...state, creative: { ...cur, filled, lastRoll: { die, tier, gain } } },
        `Get Creative «${def.name}»: Д20(${die}) → ${tier}, +${gain} — ${cur.filled} → ${filled}/${def.rank}`,
      );
    }
    case 'SHIFT_CREATIVE_SEG': {
      const cur = state.creative;
      const def = reserveByKey(cur.key);
      if (!def) return state;
      const filled = clamp(cur.filled + action.dir, 0, def.rank);
      if (filled === cur.filled) return state;
      return log({ ...state, creative: { ...cur, filled } }, `Get Creative «${def.name}»: ${cur.filled} → ${filled}/${def.rank}`);
    }
    // Заповнений лічильник: резерв іде в список з gamesLeft null — він не згорає.
    case 'CLAIM_CREATIVE': {
      const cur = state.creative;
      const def = reserveByKey(cur.key);
      if (!def || cur.filled < def.rank) return state;
      const entry = { id: newId(state.reserves), key: def.key, source: 'creative', gamesLeft: null };
      return log(
        { ...state, reserves: [...state.reserves, entry], creative: { key: null, filled: 0, lastRoll: null } },
        `Get Creative завершено: резерв «${def.name}» отримано, не згорає після місії`,
      );
    }
    case 'CANCEL_CREATIVE': {
      const def = reserveByKey(state.creative.key);
      if (!def) return state;
      return log(
        { ...state, creative: { key: null, filled: 0, lastRoll: null } },
        `Get Creative: проєкт «${def.name}» скасовано`,
      );
    }

    // ---------- Резерви ----------
    case 'SET_SHOP_TAB':
      return { ...state, shop: { ...state.shop, tab: action.tab, item: null, error: '' } };
    // Відкрити шухляду одразу на потрібній вкладці — з панелі PR, щоб не шукати її вручну.
    case 'OPEN_SHOP_TAB':
      return { ...state, shop: { ...state.shop, open: true, tab: action.tab, item: null, error: '' } };
    // ---------- Склад рідкісних резервів ----------
    // Рідкісні резерви не купуються: вони приходять як частина нагороди за місію,
    // і гравець записує їх сюди сам. На складі резерв НЕ згорає — згорає тільки те,
    // що з нього взяли на місію. Тому «взяти» не витрачає резерв, а перекладає його
    // в state.reserves з gamesLeft 1, де спрацьовує наявний BURN_MISSION_RESERVES.
    case 'ADD_TO_VAULT': {
      const def = rareReserveByKey(action.key);
      if (!def) return state;
      const cap = vCap(state);
      if (state.vault.length >= cap) return state;
      const entry = { id: newId(state.vault), key: def.key };
      return log(
        { ...state, vault: [...state.vault, entry] },
        `Склад: записано «${def.name}» (ранг ${def.rank}) — ${state.vault.length + 1}/${cap}`,
      );
    }
    case 'REMOVE_FROM_VAULT': {
      const entry = state.vault.find((v) => v.id === action.id);
      if (!entry) return state;
      const def = rareReserveByKey(entry.key);
      return log(
        { ...state, vault: state.vault.filter((v) => v.id !== action.id) },
        `Склад: списано «${def?.name || entry.key}» — ${state.vault.length - 1}/${vCap(state)}`,
      );
    }
    case 'TAKE_VAULT_TO_MISSION': {
      const entry = state.vault.find((v) => v.id === action.id);
      if (!entry) return state;
      const def = rareReserveByKey(entry.key);
      if (!def) return state;
      // Рідкісний резерв, взятий на місію, живе одну гру.
      const taken = { id: newId(state.reserves), key: def.key, source: 'vault', gamesLeft: 1 };
      return log(
        {
          ...state,
          vault: state.vault.filter((v) => v.id !== action.id),
          reserves: [...state.reserves, taken],
        },
        `Склад → на місію: «${def.name}» (ранг ${def.rank}), згорить після місії`,
      );
    }

    // Купівля резерву за PR без обмежень: чи потрібна downtime-дія — питання правил
    // за столом, додаток його не стежить.
    case 'BUY_RESERVE': {
      const def = reserveByKey(action.key);
      if (!def) return state;
      const cost = RESERVE_RANK_PR[def.rank];
      if (cost > state.pr) return { ...state, shop: { ...state.shop, error: 'Недостатньо PR.' } };

      const gamesLeft = reserveGamesLeft(def.key, state.hangar.owned);
      const entry = { id: newId(state.reserves), key: def.key, source: 'pr', gamesLeft };
      const before = state.pr;
      const next = {
        ...state,
        pr: before - cost,
        reserves: [...state.reserves, entry],
        shop: { ...state.shop, error: '' },
      };
      return log(
        next,
        `Резерв «${def.name}» (ранг ${def.rank}) за ${cost} PR` +
          (gamesLeft > 1 ? `, діє ${gamesLeft} ігор` : '') +
          ` (PR ${before} → ${before - cost})`,
      );
    }
    case 'REMOVE_RESERVE': {
      const entry = state.reserves.find((r) => r.id === action.id);
      if (!entry) return state;
      const def = reserveByKey(entry.key);
      return log(
        { ...state, reserves: state.reserves.filter((r) => r.id !== action.id) },
        `Резерв «${def?.name || entry.key}» використано або прибрано`,
      );
    }
    // Кінець місії: куплені резерви згорають, крім тих, що живуть кілька ігор,
    // і тих, що отримані за Get Creative (gamesLeft === null).
    case 'BURN_MISSION_RESERVES': {
      if (state.reserves.length === 0) return state;
      const kept = [];
      const burned = [];
      state.reserves.forEach((r) => {
        if (r.gamesLeft == null) return kept.push(r);
        const left = r.gamesLeft - 1;
        if (left > 0) kept.push({ ...r, gamesLeft: left });
        else burned.push(r);
      });
      if (burned.length === 0 && kept.length === state.reserves.length) {
        return log({ ...state, reserves: kept }, 'Кінець місії: термін дії резервів оновлено');
      }
      const names = burned.map((r) => anyReserveByKey(r.key)?.name || r.key).join(', ');
      return log(
        { ...state, reserves: kept },
        `Кінець місії: згоріло резервів — ${burned.length}${names ? ` (${names})` : ''}`,
      );
    }

    // ---------- Shop (mana store) ----------
    case 'TOGGLE_SHOP_DRAWER':
      return { ...state, shop: { ...state.shop, open: !state.shop.open } };
    // Кількість, розподіл зарядів і вибір системи більше не потрібні: усе, що їх
    // вимагало, переїхало на PR.
    case 'OPEN_SHOP_MODAL':
      return { ...state, shop: { ...state.shop, item: action.key, mechId: null, error: '' } };
    case 'CLOSE_SHOP_MODAL':
      return { ...state, shop: { ...state.shop, item: null, error: '' } };
    case 'SET_SHOP_MECH':
      return { ...state, shop: { ...state.shop, mechId: action.mechId, error: '' } };
    case 'SHOP_CONFIRM': {
      const s = state.shop;
      const item = SHOP_DATA.find((it) => it.key === s.item);
      if (!item) return state;

      const price = shopPrice(item);
      if (price > state.mana.balance) return { ...state, shop: { ...s, error: 'Недостатньо мани.' } };

      const spend = (st, note) => {
        const mana = pushManaHistory(
          { ...st.mana, balance: st.mana.balance - price },
          `−${price} · ${item.title}`,
        );
        return log(
          { ...st, mana, shop: { ...s, item: null, error: '' } },
          `Магазин: придбано «${item.title}» за ${price} мани${note ? ` (${note})` : ''}`,
        );
      };

      // Пачка PR іде пілоту, не меху. Надлишок понад кап не нараховується, і про це
      // краще сказати до покупки, ніж мовчки з'їсти ману.
      if (item.key === 'prpack') {
        const cap = prCap(state);
        if (state.pr >= cap) {
          return { ...state, shop: { ...s, error: `PR уже на капі (${cap}).` } };
        }
        const next = Math.min(state.pr + PR_PACK_SIZE, cap);
        const gained = next - state.pr;
        return spend(
          { ...state, pr: next },
          gained < PR_PACK_SIZE ? `+${gained} PR — решта не влізла в кап ${cap}` : `PR ${state.pr} → ${next}`,
        );
      }

      const mech = findMech(state, s.mechId);
      if (item.needsMech && !mech) return { ...state, shop: { ...s, error: 'Оберіть меха.' } };

      const nextState = updateMech(state, s.mechId, (m) => {
        if (item.key === 'core') return { ...m, corePower: true };
        if (item.key === 'fullrepair') {
          return {
            ...m,
            hpCurrent: m.hpMax,
            repairCurrent: m.repairMax,
            structureFilled: 0,
            reactorFilled: 0,
            overcharge: 0,
            corePower: true,
            items: restoreItems(m.items),
          };
        }
        return m;
      });

      return spend(nextState, mech?.name);
    }

    // ---------- Mechs ----------
    case 'SET_MECH_DRAFT_FIELD':
      return { ...state, mechDraft: { ...state.mechDraft, [action.field]: action.value } };
    case 'ADD_MECH': {
      const { name, hpMax, repairMax, frame } = state.mechDraft;
      if (!name.trim()) return state;
      const hp = parseInt(hpMax, 10) || 10;
      const rep = parseInt(repairMax, 10) || 5;
      const mech = {
        id: newId(state.mechs),
        name: name.trim(),
        // COMP/CON imports fill this from frameData; typed in by hand there is no source
        // to pair it with, so the badge shows the chassis alone.
        frame: (frame || '').trim(),
        frameSource: '',
        hpCurrent: hp,
        hpMax: hp,
        repairCurrent: rep,
        repairMax: rep,
        structureFilled: 0,
        reactorFilled: 0,
        corePower: true,
        overcharge: 0,
        items: [],
      };
      return log(
        { ...state, mechs: [...state.mechs, mech], mechDraft: { name: '', hpMax: '', repairMax: '', frame: '' } },
        `Мех доданий: «${mech.name}»${mech.frame ? ` (${mech.frame})` : ''}`,
      );
    }
    case 'REMOVE_MECH': {
      const m = findMech(state, action.id);
      return log({ ...state, mechs: state.mechs.filter((mm) => mm.id !== action.id) }, `Мех видалений: «${m?.name}»`, true);
    }
    case 'INC_MECH_HP':
    case 'DEC_MECH_HP': {
      const m = findMech(state, action.id);
      const dir = action.type === 'INC_MECH_HP' ? 1 : -1;
      const next = clamp(m.hpCurrent + dir, 0, m.hpMax);
      if (next === m.hpCurrent) return state;
      return log(updateMech(state, action.id, (mm) => ({ ...mm, hpCurrent: next })), `${m.name}: ХП ${m.hpCurrent} → ${next}`);
    }
    case 'INC_MECH_REPAIR':
    case 'DEC_MECH_REPAIR': {
      const m = findMech(state, action.id);
      const dir = action.type === 'INC_MECH_REPAIR' ? 1 : -1;
      const next = clamp(m.repairCurrent + dir, 0, m.repairMax);
      if (next === m.repairCurrent) return state;
      // Зменшення — це витрачений комплект, тож рядок іде в журнал операцій.
      return log(updateMech(state, action.id, (mm) => ({ ...mm, repairCurrent: next })), `${m.name}: рем. комплекти ${m.repairCurrent} → ${next}`, dir < 0);
    }
    // Mission DC sits on the mech that flew the game. Mechs saved before this field
    // existed read as 0, so the counter works without migrating anyone's state.
    case 'TOGGLE_MECH_CORE': {
      const m = findMech(state, action.id);
      const next = !m.corePower;
      return log(updateMech(state, action.id, (mm) => ({ ...mm, corePower: next })), `${m.name}: Core Power ${next ? 'заряджено' : 'витрачено'}`);
    }
    case 'SHIFT_MECH_OVERCHARGE': {
      const m = findMech(state, action.id);
      const next = clamp(m.overcharge + action.dir, 0, 3);
      if (next === m.overcharge) return state;
      return log(updateMech(state, action.id, (mm) => ({ ...mm, overcharge: next })), `${m.name}: Overcharge крок ${m.overcharge} → ${next}`);
    }
    case 'FULL_REPAIR_MECH': {
      const m = findMech(state, action.id);
      return log(
        updateMech(state, action.id, (mm) => ({
          ...mm,
          hpCurrent: mm.hpMax,
          repairCurrent: mm.repairMax,
          structureFilled: 0,
          reactorFilled: 0,
          overcharge: 0,
          corePower: true,
          items: restoreItems(mm.items),
        })),
        `${m.name}: повний ремонт`,
      );
    }
    case 'SET_MECH_STRUCTURE': {
      const m = findMech(state, action.id);
      const next = toggleFilled(m.structureFilled, action.idx);
      return log(updateMech(state, action.id, (mm) => ({ ...mm, structureFilled: next })), `${m.name}: структура ${m.structureFilled} → ${next}`);
    }
    case 'SET_MECH_REACTOR': {
      const m = findMech(state, action.id);
      const next = toggleFilled(m.reactorFilled, action.idx);
      return log(updateMech(state, action.id, (mm) => ({ ...mm, reactorFilled: next })), `${m.name}: реактор ${m.reactorFilled} → ${next}`);
    }
    // ---------- Пошкодження і ремонт (правила 2a, див. repair.js) ----------
    // «−» на структурі/реакторі — пошкодження, безкоштовно.
    case 'DAMAGE_MECH': {
      const m = findMech(state, action.id);
      if (!m) return state;
      if (action.what === 'structure') {
        const next = Math.min(MECH_STRUCTURE, (m.structureFilled || 0) + 1);
        if (next === (m.structureFilled || 0)) return state;
        return log(
          updateMech(state, m.id, (mm) => ({ ...mm, structureFilled: next })),
          `${m.name}: структура ${MECH_STRUCTURE - (m.structureFilled || 0)} → ${MECH_STRUCTURE - next}`,
        );
      }
      const next = Math.min(MECH_REACTOR, (m.reactorFilled || 0) + 1);
      if (next === (m.reactorFilled || 0)) return state;
      return log(
        updateMech(state, m.id, (mm) => ({ ...mm, reactorFilled: next })),
        `${m.name}: реактор ${MECH_REACTOR - (m.reactorFilled || 0)} → ${MECH_REACTOR - next}`,
      );
    }
    // Спершу списуються ремкомплекти меха, яких бракує — докуповуються по 10 PR.
    case 'MECH_REPAIR': {
      const m = findMech(state, action.id);
      if (!m) return state;
      const plan = repairPlan(m, action.what, action.idx);
      if (!plan) return state;
      const c = repairCost(m, state.pr, plan.kits);
      if (!c.ok) return state;
      const next = updateMech(state, m.id, (mm) => ({ ...plan.apply(mm), repairCurrent: mm.repairCurrent - c.use }));
      return log(
        { ...next, pr: state.pr - c.prCost },
        `${m.name}: ${plan.done} ${spentText(c.use, c.prCost)}` + (c.prCost ? ` (PR ${state.pr} → ${state.pr - c.prCost})` : ''),
        true,
      );
    }
    // Купівля ремкомплектів: один за 10 PR або до максимуму за 50 PR.
    case 'BUY_KITS': {
      const m = findMech(state, action.id);
      if (!m || m.repairCurrent >= m.repairMax) return state;
      const full = action.mode === 'full';
      const cost = full ? KITS_FULL_PR : KIT_PR;
      if (cost > state.pr) return state;
      const kits = full ? m.repairMax : m.repairCurrent + 1;
      return log(
        { ...updateMech(state, m.id, (mm) => ({ ...mm, repairCurrent: kits })), pr: state.pr - cost },
        `${m.name}: ${full ? 'ремкомплекти поповнено до максимуму' : 'куплено 1 ремкомплект'} (${m.repairCurrent} → ${kits}) за ${cost} PR (PR ${state.pr} → ${state.pr - cost})`,
        true,
      );
    }
    // Поповнення зарядів однієї системи — ціна за базовим запасом (1 → 30, 2 → 20, 3+ → 10 PR).
    case 'REFILL_ITEM': {
      const m = findMech(state, action.id);
      const it = m?.items?.[action.idx];
      if (!isLimited(it) || it.current >= it.max) return state;
      const cost = itemRefillPr(it);
      if (cost > state.pr) return state;
      return log(
        { ...updateItem(state, m.id, action.idx, (x) => ({ ...x, current: x.max })), pr: state.pr - cost },
        `${m.name} · ${it.name}: заряди ${it.current} → ${it.max} за ${cost} PR (PR ${state.pr} → ${state.pr - cost})`,
        true,
      );
    }

    // ---------- Зброя та системи ----------
    case 'ADD_ITEM': {
      const name = (action.name || '').trim();
      if (!name) return state;
      const m = findMech(state, action.id);
      if (!m) return state;
      const n = parseInt(action.max, 10);
      const weapon = action.itemType !== 'system';
      const item = {
        name,
        type: weapon ? 'weapon' : 'system',
        mount: '',
        ...(n > 0 ? { current: n, max: n, base: n } : {}),
        destroyed: false,
      };
      // Зброя стає в кінець групи зброї, система — в кінець систем.
      const items = [...(m.items || [])];
      const lastW = items.map((x) => x.type === 'weapon').lastIndexOf(true);
      items.splice(weapon ? lastW + 1 : items.length, 0, item);
      return log(
        updateMech(state, m.id, (mm) => ({ ...mm, items })),
        `${m.name}: ${weapon ? 'зброя' : 'система'} додана «${name}»${n > 0 ? ` (${n} зар.)` : ''}`,
      );
    }
    case 'REMOVE_ITEM': {
      const m = findMech(state, action.id);
      const it = m?.items?.[action.idx];
      if (!it) return state;
      return log(
        updateMech(state, m.id, (mm) => ({ ...mm, items: mm.items.filter((_, i) => i !== action.idx) })),
        `${m.name}: видалено «${it.name}» з меха`,
        true,
      );
    }
    case 'INC_ITEM':
    case 'DEC_ITEM': {
      const m = findMech(state, action.id);
      const it = m?.items?.[action.idx];
      if (!isLimited(it)) return state;
      const next = clamp(it.current + (action.type === 'INC_ITEM' ? 1 : -1), 0, it.max);
      if (next === it.current) return state;
      return log(updateItem(state, m.id, action.idx, (x) => ({ ...x, current: next })), `${m.name} · ${it.name}: заряди ${it.current} → ${next}`);
    }
    // Максимум зарядів — не лише тег LIMITED: Engineering, кор-бонуси й фрейми його
    // піднімають, і не все це видно з експорту COMP/CON. Тому він редагований.
    case 'SET_ITEM_MAX': {
      const m = findMech(state, action.id);
      const it = m?.items?.[action.idx];
      if (!isLimited(it)) return state;
      const next = Math.max(1, parseInt(action.value, 10) || 1);
      if (next === it.max) return state;
      return log(
        updateItem(state, m.id, action.idx, (x) => ({ ...x, max: next, current: Math.min(x.current, next) })),
        `${m.name} · ${it.name}: макс. заряди ${it.max} → ${next}`,
      );
    }
    // Позначка «знищено» безкоштовна; ремонт — через MECH_REPAIR (1 ремкомплект).
    case 'MARK_ITEM_DESTROYED': {
      const m = findMech(state, action.id);
      const it = m?.items?.[action.idx];
      if (!it || it.destroyed) return state;
      return log(updateItem(state, m.id, action.idx, (x) => ({ ...x, destroyed: true })), `${m.name} · ${it.name}: знищено`);
    }
    case 'TOGGLE_MECH_EDIT': {
      const opening = state.mechEditId !== action.id;
      const m = findMech(state, action.id);
      return {
        ...state,
        mechEditId: opening ? action.id : null,
        mechEdit: opening
          ? { hpMax: String(m.hpMax), repairMax: String(m.repairMax), frame: m.frame || '' }
          : { hpMax: '', repairMax: '', frame: '' },
      };
    }
    case 'SET_EDIT_HP':
      return { ...state, mechEdit: { ...state.mechEdit, hpMax: action.value } };
    case 'SET_EDIT_REPAIR':
      return { ...state, mechEdit: { ...state.mechEdit, repairMax: action.value } };
    // Editable so mechs that predate the frame field, or were added by hand, can be named
    // without re-importing the whole pilot from COMP/CON.
    case 'SET_EDIT_FRAME':
      return { ...state, mechEdit: { ...state.mechEdit, frame: action.value } };
    case 'SAVE_MECH_EDIT': {
      const id = state.mechEditId;
      const m = findMech(state, id);
      const hpMax = Math.max(1, parseInt(state.mechEdit.hpMax, 10) || m.hpMax);
      const repairMax = Math.max(0, parseInt(state.mechEdit.repairMax, 10) || m.repairMax);
      const frame = (state.mechEdit.frame || '').trim();
      const frameNote = frame === (m.frame || '') ? '' : `, фрейм → ${frame || '—'}`;
      return log(
        {
          ...updateMech(state, id, (mm) => ({
            ...mm,
            hpMax,
            repairMax,
            frame,
            hpCurrent: Math.min(mm.hpCurrent, hpMax),
            repairCurrent: Math.min(mm.repairCurrent, repairMax),
          })),
          mechEditId: null,
          mechEdit: { hpMax: '', repairMax: '', frame: '' },
        },
        `${m.name}: HP кап ${m.hpMax} → ${hpMax}, рем. кап ${m.repairMax} → ${repairMax}${frameNote}`,
      );
    }

    // ---------- Narrative & log ----------
    case 'SET_NARRATIVE':
      return { ...state, narrative: action.value };
    // ---------- Записник ----------
    case 'ADD_NOTE': {
      const text = (action.text || '').trim();
      if (!text) return state;
      const note = {
        id: newId(state.notes),
        date: new Date().toISOString(),
        tag: NOTE_TAGS.includes(action.tag) ? action.tag : null,
        gameId: action.gameId || null,
        gameLabel: action.gameLabel || '',
        text,
        pinned: false,
      };
      return { ...state, notes: [note, ...(state.notes || [])] };
    }
    case 'UPDATE_NOTE': {
      const text = action.patch.text != null ? action.patch.text.trim() : null;
      if (text === '') return state;
      return {
        ...state,
        notes: (state.notes || []).map((n) => (n.id === action.id ? { ...n, ...action.patch, ...(text != null ? { text } : {}) } : n)),
      };
    }
    case 'TOGGLE_NOTE_PIN':
      return {
        ...state,
        notes: (state.notes || []).map((n) => (n.id === action.id ? { ...n, pinned: !n.pinned } : n)),
      };
    case 'REMOVE_NOTE': {
      const n = (state.notes || []).find((x) => x.id === action.id);
      if (!n) return state;
      return log(
        { ...state, notes: state.notes.filter((x) => x.id !== action.id) },
        `Записник: видалено нотатку «${n.text.slice(0, 40)}${n.text.length > 40 ? '…' : ''}»`,
        true,
      );
    }
    case 'CLEAR_LOG':
      return { ...state, actionLog: [] };

    // ---------- External sync (Adventure League CSV / COMP/CON JSON) ----------
    case 'IMPORT_ADVENTURE_LOG': {
      const { manaTotal, levelFound, historyLabels, entryCount } = action.payload;
      let next = {
        ...state,
        mana: {
          ...state.mana,
          balance: manaTotal,
          history: historyLabels.slice(-4).reverse().map((label) => ({ label })),
        },
      };
      let msg = `Синхронізовано з Adventure League CSV (${entryCount} записів): мана → ${manaTotal}`;
      if (levelFound) {
        next = { ...next, ll: clamp(levelFound, 2, MAX_LL) };
        msg += `, рівень → ${levelFound}`;
      }
      return log(next, msg);
    }
    case 'MERGE_COMPCON_MECHS': {
      const { mechs, callsign } = action.payload;
      const names = mechs.map((m) => m.name).join(', ') || '—';
      return log(
        { ...state, mechs: mergeMechsByName(state.mechs, mechs) },
        `Мех(и) підтягнуто з COMP/CON («${callsign}»): ${names}`,
      );
    }

    default:
      return state;
  }
}
