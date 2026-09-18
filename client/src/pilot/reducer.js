import {
  SHOP_DATA,
  HANGAR_DATA,
  MISSION_DOWNTIME_DATA,
  WEEKLY_DOWNTIME_DATA,
  PR_SERVICES,
  PR_CAP_BASE,
  PR_CAP_BUFFER,
  MAX_LL,
  REDISTRIBUTE_ALL_COST,
  limitedRefillPr,
} from './constants';
import {
  clamp,
  manaLevelCost,
  toggleFilled,
  shopPrice,
  rollTier,
  relationshipLabel,
  nextRelationship,
  nextProjectStatus,
  pushLog,
  skillCapMax,
  skillCapUsed,
} from './logic';
import { mergeMechsByName } from './compconImport';

const ALL_DOWNTIME_DATA = [...MISSION_DOWNTIME_DATA, ...WEEKLY_DOWNTIME_DATA];

function log(state, msg) {
  return { ...state, actionLog: pushLog(state.actionLog, msg) };
}

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

// Ціна послуги за PR. Для поповнення зарядів однієї системи вона залежить від самої
// системи, тож рахується з обраної в модалці, а не береться зі списку.
function prServiceCost(key, mech, alloc) {
  const svc = PR_SERVICES.find((x) => x.key === key);
  if (!svc) return null;
  if (key !== 'refillone') return svc.cost;
  const idx = Object.keys(alloc || {})[0];
  const li = idx == null ? null : mech?.limited[idx];
  return li ? limitedRefillPr(li.max) : null;
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
    case 'INC_GAME': {
      const next = state.games + 1;
      return log({ ...state, games: next }, `Гра записана: ${state.games} → ${next}`);
    }
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

      const extras = (lu.allTalents ? REDISTRIBUTE_ALL_COST : 0) + (lu.allLicenses ? REDISTRIBUTE_ALL_COST : 0);
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
          limited: m.limited.map((li) => ({ ...li, current: li.max, destroyed: false })),
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
        lu.allTalents ? `перерозподіл усіх талантів (+${REDISTRIBUTE_ALL_COST})` : null,
        lu.allLicenses ? `перерозподіл усіх ліцензій (+${REDISTRIBUTE_ALL_COST})` : null,
      ].filter(Boolean);

      return log(
        next,
        `ЛЛ ${state.ll} → ${nextLl} за ${totalCost} мани` + (notes.length ? ` · ${notes.join(', ')}` : ''),
      );
    }

    case 'SET_RESOURCE_MODE':
      return { ...state, resourceMode: action.mode };

    // ---------- Stress / Burdens / Bond ----------
    case 'SET_STRESS': {
      const next = toggleFilled(state.stress, action.idx);
      return log({ ...state, stress: next }, `Стрес: ${state.stress} → ${next}`);
    }
    case 'SET_BURDEN_NAME':
      return {
        ...state,
        burdens: state.burdens.map((b, i) => (i === action.bi ? { ...b, name: action.value } : b)),
      };
    case 'SET_BURDEN_SEG': {
      const b = state.burdens[action.bi];
      const next = toggleFilled(b.filled, action.idx);
      return log(
        { ...state, burdens: state.burdens.map((bb, i) => (i === action.bi ? { ...bb, filled: next } : bb)) },
        `Бьорден «${b.name || burdenNameFallback(action.bi)}»: прогрес ${b.filled} → ${next}`,
      );
    }
    case 'SET_BURDEN_HEAL': {
      const b = state.burdens[action.bi];
      const next = toggleFilled(b.heal, action.idx);
      return log(
        { ...state, burdens: state.burdens.map((bb, i) => (i === action.bi ? { ...bb, heal: next } : bb)) },
        `Бьорден «${b.name || burdenNameFallback(action.bi)}»: лікування ${b.heal} → ${next}`,
      );
    }
    case 'SET_BURDEN_TYPE':
      return {
        ...state,
        burdens: state.burdens.map((b, i) => (i === action.bi ? { ...b, type: action.value, filled: 0 } : b)),
      };
    case 'SET_ARCHETYPE':
      return { ...state, bond: { ...state.bond, archetype: action.value } };
    case 'SET_BOND_NEW_POWER':
      return { ...state, bond: { ...state.bond, newPower: action.value } };
    case 'SET_BOND_XP': {
      const next = toggleFilled(state.bond.xp, action.idx);
      return log({ ...state, bond: { ...state.bond, xp: next } }, `Bond XP: ${state.bond.xp} → ${next}`);
    }
    case 'ADD_POWER': {
      const name = state.bond.newPower.trim();
      if (!name) return state;
      return log(
        { ...state, bond: { ...state.bond, powers: [...state.bond.powers, name], newPower: '' } },
        `Сила бонду отримана: «${name}»`,
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
      const field = action.pool === 'weekly' ? 'weeklyCharges' : 'downtimeCharges';
      const msg = action.pool === 'weekly' ? 'Тижневі заряди скинуто (новий тиждень)' : 'Даунтайм-заряди скинуто (нова місія)';
      return log({ ...state, [field]: { ...state[field], used: 0 } }, msg);
    }
    case 'ROLL_DOWNTIME': {
      const field = action.pool === 'weekly' ? 'weeklyCharges' : 'downtimeCharges';
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
      const trigger = { id: Date.now(), name: name.trim(), desc: desc.trim(), level };
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

    // ---------- Projects ----------
    case 'SET_PROJECT_DRAFT_FIELD':
      return { ...state, projectDraft: { ...state.projectDraft, [action.field]: action.value } };
    case 'ADD_PROJECT': {
      const { name, note } = state.projectDraft;
      if (!name.trim()) return state;
      const project = { name: name.trim(), note: note.trim(), status: 'активний', stage: 1 };
      return log(
        { ...state, projects: [...state.projects, project], projectDraft: { name: '', note: '' } },
        `Проєкт додано: «${project.name}»`,
      );
    }
    case 'REMOVE_PROJECT': {
      const p = state.projects[action.idx];
      return log(
        { ...state, projects: state.projects.filter((_, i) => i !== action.idx) },
        `Проєкт видалено: «${p?.name}»`,
      );
    }
    case 'CYCLE_PROJECT_STATUS': {
      const p = state.projects[action.idx];
      const next = nextProjectStatus(p.status);
      return log(
        { ...state, projects: state.projects.map((pp, i) => (i === action.idx ? { ...pp, status: next } : pp)) },
        `Проєкт «${p.name}»: статус → ${next}`,
      );
    }

    case 'ADVANCE_PROJECT': {
      const { used, max } = state.weeklyCharges;
      if (used >= max) return state;
      const p = state.projects[action.idx];
      if (!p || (p.stage || 1) >= 3) return state;
      const nextStage = (p.stage || 1) + 1;
      return log(
        {
          ...state,
          projects: state.projects.map((pp, i) => (i === action.idx ? { ...pp, stage: nextStage } : pp)),
          weeklyCharges: { ...state.weeklyCharges, used: used + 1 },
        },
        `Проєкт «${p.name}»: стадія ${p.stage || 1} → ${nextStage}`,
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
      if (price > state.mana.balance) {
        return { ...state, hangar: { ...state.hangar, error: 'Недостатньо мани.' } };
      }
      const mana = pushManaHistory(
        { ...state.mana, balance: state.mana.balance - price },
        `−${price} · ${item.title}${item.prices.length > 1 ? ' рів.' + (owned + 1) : ''}`,
      );
      return log(
        {
          ...state,
          mana,
          hangar: { ...state.hangar, owned: { ...state.hangar.owned, [key]: owned + 1 }, confirm: null, error: '' },
        },
        `Ангар: придбано «${item.title}»${item.prices.length > 1 ? ' рів.' + (owned + 1) : ''} за ${price} мани`,
      );
    }

    // ---------- DC store (Особистий склад) ----------
    case 'PR_SHIFT': {
      const next = clamp(state.pr + action.dir, 0, prCap(state));
      if (next === state.pr) return state;
      return log({ ...state, pr: next }, `PR: ${state.pr} → ${next}`);
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
            limited: m.limited.map((li, i) => (i === pick ? { ...li, current: li.max, destroyed: false } : li)),
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
            limited: m.limited.map((li) => ({ ...li, current: li.max, destroyed: false })),
          };
        }
        return m;
      });

      const before = state.pr;
      nextState = { ...nextState, pr: before - cost, prSpend: { item: null, mechId: null, pick: null, error: '' } };
      return log(nextState, `${mech.name}: «${svc.title}» за ${cost} PR (PR ${before} → ${before - cost})`);
    }

    // ---------- Shop (mana store) ----------
    case 'TOGGLE_SHOP_DRAWER':
      return { ...state, shop: { ...state.shop, open: !state.shop.open } };
    case 'OPEN_SHOP_MODAL':
      return { ...state, shop: { ...state.shop, item: action.key, mechId: null, alloc: {}, picked: null, qty: 1, error: '' } };
    case 'CLOSE_SHOP_MODAL':
      return { ...state, shop: { ...state.shop, item: null } };
    case 'SET_SHOP_MECH':
      return { ...state, shop: { ...state.shop, mechId: action.mechId, alloc: {}, picked: null, qty: 1 } };
    case 'SHOP_QTY_SHIFT': {
      const s = state.shop;
      const mech = findMech(state, s.mechId);
      const cap = mech ? Math.max(1, mech.repairMax - mech.repairCurrent) : 10;
      const next = clamp((s.qty || 1) + action.dir, 1, cap);
      return { ...state, shop: { ...s, qty: next } };
    }
    case 'SHOP_ALLOC_SHIFT': {
      const s = state.shop;
      const mech = findMech(state, s.mechId);
      const cur = s.alloc[action.idx] || 0;
      const total = Object.values(s.alloc).reduce((a, b) => a + b, 0);
      if (action.dir > 0) {
        if (total >= 3) return state;
        const li = mech?.limited[action.idx];
        if (li && li.current + cur >= li.max) return state;
      }
      const next = Math.max(0, cur + action.dir);
      return { ...state, shop: { ...s, alloc: { ...s.alloc, [action.idx]: next } } };
    }
    case 'SET_SHOP_PICK':
      return { ...state, shop: { ...state.shop, picked: action.idx } };
    case 'SHOP_CONFIRM': {
      const s = state.shop;
      const item = SHOP_DATA.find((it) => it.key === s.item);
      const mech = findMech(state, s.mechId);
      if (!item) return state;
      if (!mech) return { ...state, shop: { ...s, error: 'Оберіть меха.' } };

      const totalPrice = shopPrice(item);
      if (totalPrice > state.mana.balance) return { ...state, shop: { ...s, error: 'Недостатньо мани.' } };
      if (item.key === 'charges3' && Object.values(s.alloc).reduce((a, b) => a + b, 0) === 0) {
        return { ...state, shop: { ...s, error: 'Розподіліть хоча б один заряд.' } };
      }

      let nextState = updateMech(state, s.mechId, (m) => {
        if (item.key === 'charges3') {
          return { ...m, limited: m.limited.map((li, i) => ({ ...li, current: Math.min(li.max, li.current + (s.alloc[i] || 0)) })) };
        }
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
            limited: m.limited.map((li) => ({ ...li, current: li.max, destroyed: false })),
          };
        }
        return m;
      });

      const mana = pushManaHistory({ ...state.mana, balance: state.mana.balance - totalPrice }, `−${totalPrice} · ${item.title}`);
      nextState = { ...nextState, mana, shop: { ...s, item: null, error: '' } };
      return log(nextState, `Магазин: придбано «${item.title}» за ${totalPrice} мани (${mech.name})`);
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
        id: Date.now(),
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
        limited: [],
      };
      return log(
        { ...state, mechs: [...state.mechs, mech], mechDraft: { name: '', hpMax: '', repairMax: '', frame: '' } },
        `Мех доданий: «${mech.name}»${mech.frame ? ` (${mech.frame})` : ''}`,
      );
    }
    case 'REMOVE_MECH': {
      const m = findMech(state, action.id);
      return log({ ...state, mechs: state.mechs.filter((mm) => mm.id !== action.id) }, `Мех видалений: «${m?.name}»`);
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
      return log(updateMech(state, action.id, (mm) => ({ ...mm, repairCurrent: next })), `${m.name}: рем. комплекти ${m.repairCurrent} → ${next}`);
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
          limited: mm.limited.map((li) => ({ ...li, current: li.max, destroyed: false })),
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
    case 'SET_LIMITED_DRAFT':
      return {
        ...state,
        limitedDraft: {
          ...state.limitedDraft,
          [action.id]: { ...(state.limitedDraft[action.id] || { name: '', max: '' }), [action.field]: action.value },
        },
      };
    case 'ADD_LIMITED': {
      const draft = state.limitedDraft[action.id] || { name: '', max: '' };
      if (!draft.name.trim()) return state;
      const max = parseInt(draft.max, 10) || 1;
      const m = findMech(state, action.id);
      return log(
        {
          ...updateMech(state, action.id, (mm) => ({
            ...mm,
            limited: [...mm.limited, { name: draft.name.trim(), current: max, max, destroyed: false }],
          })),
          limitedDraft: { ...state.limitedDraft, [action.id]: { name: '', max: '' } },
        },
        `${m.name}: система додана «${draft.name.trim()}» (${max})`,
      );
    }
    case 'REMOVE_LIMITED': {
      const m = findMech(state, action.id);
      const li = m.limited[action.idx];
      return log(
        updateMech(state, action.id, (mm) => ({ ...mm, limited: mm.limited.filter((_, i) => i !== action.idx) })),
        `${m.name}: система видалена «${li?.name}»`,
      );
    }
    case 'INC_LIMITED':
    case 'DEC_LIMITED': {
      const m = findMech(state, action.id);
      const li = m.limited[action.idx];
      const dir = action.type === 'INC_LIMITED' ? 1 : -1;
      const next = clamp(li.current + dir, 0, li.max);
      if (next === li.current) return state;
      return log(
        updateMech(state, action.id, (mm) => ({
          ...mm,
          limited: mm.limited.map((l, i) => (i === action.idx ? { ...l, current: next } : l)),
        })),
        `${m.name} · ${li.name}: заряди ${li.current} → ${next}`,
      );
    }
    // The cap is not just the weapon's LIMITED tag: Engineering, core bonuses and some frames
    // all raise it, and not every source can be read out of a COMP/CON export. Editable so the
    // sheet can hold the real number whatever it comes from.
    case 'SET_LIMITED_MAX': {
      const m = findMech(state, action.id);
      const li = m.limited[action.idx];
      const next = Math.max(1, parseInt(action.value, 10) || 1);
      if (next === li.max) return state;
      const nextCurrent = Math.min(li.current, next);
      return log(
        updateMech(state, action.id, (mm) => ({
          ...mm,
          limited: mm.limited.map((l, i) => (i === action.idx ? { ...l, max: next, current: nextCurrent } : l)),
        })),
        `${m.name} · ${li.name}: макс. заряди ${li.max} → ${next}`,
      );
    }
    case 'TOGGLE_LIMITED_DESTROYED': {
      const m = findMech(state, action.id);
      const li = m.limited[action.idx];
      const next = !li.destroyed;
      return log(
        updateMech(state, action.id, (mm) => ({
          ...mm,
          limited: mm.limited.map((l, i) => (i === action.idx ? { ...l, destroyed: next } : l)),
        })),
        `${m.name} · ${li.name}: ${next ? 'знищена' : 'відновлена'}`,
      );
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

function burdenNameFallback(idx) {
  return ['мінорний', 'мідл', 'мейджор'][idx] || 'бьорден';
}
