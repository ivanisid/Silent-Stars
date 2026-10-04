import { limitedRefillPr } from './constants';

// Правила ремонту меха (інтерфейс 2a, «Interactions & Behavior»).
//
// Ремкомплект коштує 10 PR. Ремонт спершу списує ремкомплекти самого меха; яких бракує —
// докуповуються по 10 PR. Не вистачає PR і на це — ремонт неможливий.
//
//   HP «ВІДНОВИТИ МАКС»     1 ремкомплект (BALOR — безкоштовно, без вікна)
//   Структура +1            2 ремкомплекти (Chomolungma / Everest / Sagarmatha — 1)
//   Реактор +1              2 ремкомплекти
//   «МАКС» на треку         (бракує) × ціна одного кроку
//   Знищена система/зброя   1 ремкомплект
//   «−» (пошкодження)       безкоштовно

export const KIT_PR = 10;
export const KITS_FULL_PR = 50;
export const MECH_STRUCTURE = 4;
export const MECH_REACTOR = 4;

function frameOf(mech) {
  return `${mech.frameSource || ''} ${mech.frame || ''} ${mech.name || ''}`.toUpperCase();
}

export function isBalor(mech) {
  return /\bBALOR\b/.test(frameOf(mech));
}

export function isEverestLine(mech) {
  return /CHOMOLUNGMA|EVEREST|SAGARMATHA/.test(frameOf(mech));
}

export function structureKitCost(mech) {
  return isEverestLine(mech) ? 1 : 2;
}

// Скільки залишилось (а не скільки пошкоджено) — так трек читається як у COMP/CON.
export const structureLeft = (m) => MECH_STRUCTURE - (m.structureFilled || 0);
export const reactorLeft = (m) => MECH_REACTOR - (m.reactorFilled || 0);

export const isLimited = (it) => it && it.max != null;

export function itemRefillPr(it) {
  return limitedRefillPr(it.base ?? it.max);
}

// Що робить ремонт: скільки комплектів потрібно і як змінюється мех.
// what: 'hp' | 'structure' | 'structureMax' | 'reactor' | 'reactorMax' | 'item'
export function repairPlan(mech, what, idx) {
  switch (what) {
    case 'hp':
      if (mech.hpCurrent >= mech.hpMax) return null;
      return {
        title: 'ВІДНОВЛЕННЯ HP',
        kits: isBalor(mech) ? 0 : 1,
        free: isBalor(mech),
        lines: [`HP: ${mech.hpCurrent} → ${mech.hpMax}`],
        done: isBalor(mech) ? 'BALOR: HP відновлено без ремкомплекту.' : 'HP відновлено.',
        apply: (m) => ({ ...m, hpCurrent: m.hpMax }),
      };
    case 'structure':
    case 'structureMax': {
      const left = structureLeft(mech);
      const miss = MECH_STRUCTURE - left;
      if (miss <= 0) return null;
      const per = structureKitCost(mech);
      const steps = what === 'structure' ? 1 : miss;
      return {
        title: 'ВІДНОВЛЕННЯ СТРУКТУРИ',
        kits: steps * per,
        lines: [
          what === 'structure'
            ? `Структура: ${left} → ${left + 1}`
            : `Структура: ${left} → ${MECH_STRUCTURE} (${miss} × ${per} рем.)`,
        ],
        done: what === 'structure' ? 'Структуру +1.' : 'Структуру відновлено.',
        apply: (m) => ({ ...m, structureFilled: Math.max(0, (m.structureFilled || 0) - steps) }),
      };
    }
    case 'reactor':
    case 'reactorMax': {
      const left = reactorLeft(mech);
      const miss = MECH_REACTOR - left;
      if (miss <= 0) return null;
      const steps = what === 'reactor' ? 1 : miss;
      return {
        title: 'ВІДНОВЛЕННЯ РЕАКТОРА',
        kits: steps * 2,
        lines: [
          what === 'reactor'
            ? `Реактор: ${left} → ${left + 1}`
            : `Реактор: ${left} → ${MECH_REACTOR} (${miss} × 2 рем.)`,
        ],
        done: what === 'reactor' ? 'Реактор +1.' : 'Реактор відновлено.',
        apply: (m) => ({ ...m, reactorFilled: Math.max(0, (m.reactorFilled || 0) - steps) }),
      };
    }
    case 'item': {
      const it = mech.items?.[idx];
      if (!it || !it.destroyed) return null;
      return {
        title: 'РЕМОНТ СИСТЕМИ',
        kits: 1,
        lines: [`${it.name}: ЗНИЩЕНО → ЦІЛЕ`],
        done: `${it.name} відремонтовано.`,
        apply: (m) => ({ ...m, items: m.items.map((x, i) => (i === idx ? { ...x, destroyed: false } : x)) }),
      };
    }
    default:
      return null;
  }
}

// Скільки комплектів спишеться з меха, скільки докупиться і за скільки PR.
export function repairCost(mech, pr, kits) {
  const use = Math.min(mech.repairCurrent, kits);
  const buy = kits - use;
  const prCost = buy * KIT_PR;
  return { use, buy, prCost, ok: pr >= prCost };
}

// Рядки для вікна підтвердження ремонту.
export function repairQuoteLines(mech, pr, plan) {
  const c = repairCost(mech, pr, plan.kits);
  const lines = [
    ...plan.lines.map((t) => ({ t, ink: 'var(--text)' })),
    { t: `Ремкомплекти: ${mech.repairCurrent} → ${mech.repairCurrent - c.use}`, ink: 'var(--text)' },
  ];
  if (c.buy) {
    lines.push({
      t: `Бракує ${c.buy} рем. — буде куплено за ${c.prCost} PR (PR ${pr} → ${pr - c.prCost})`,
      ink: 'var(--warn)',
    });
  }
  if (!c.ok) lines.push({ t: '!! Недостатньо PR для докупівлі.', ink: 'var(--danger)' });
  return { lines, ...c };
}

export function spentText(use, prCost) {
  const parts = [];
  if (use) parts.push(`${use} рем.`);
  if (prCost) parts.push(`${prCost} PR`);
  return parts.length ? `Списано ${parts.join(' + ')}.` : 'Без витрат.';
}
