// Бонуси до статів меха з файлу COMP/CON (чиста логіка без залежностей — тестується простим
// `node`, див. mechBonuses.test.mjs).
//
// Фрейм дає лише базові HP / ремкомплекти; решту COMP/CON додає під час гри з `bonuses`
// предметів і кор-бонусів, а в експорт готової суми не пише. Тут ці бонуси збираються:
//
//   hp         — +HP (Personalizations +2, кор-бонус Reinforced Frame +5, …)
//   repcap     — +ремкомплекти
//   overcharge — власна драбина Overcharge (Heatfall Coolant System: не вище 1d6)
//
// Джерела: кор-бонуси пілота, системи активного лоадауту, трейти фрейму, отримані ранги
// талантів. Якщо в записі немає `bonuses` (старий експорт, урізаний LCP), для відомих
// предметів береться значення з правил — FALLBACK нижче.

const FALLBACK = {
  ms_personalizations: [{ id: 'hp', val: 2 }],
  cb_reinforced_frame: [{ id: 'hp', val: 5 }],
  cb_heatfall_coolant_system: [{ id: 'overcharge', val: ['1', '1d3', '1d6', '1d6'] }],
};

const nameOf = (x) => x?.name || x?.data?.name || x?.id || '';

function bonusesOf(entry) {
  const d = entry?.data || entry;
  if (Array.isArray(d?.bonuses)) return d.bonuses;
  return FALLBACK[d?.id] || FALLBACK[entry?.id] || [];
}

// Усе, що може нести бонус, з назвою для пояснення суми.
function sources(pilot, mech) {
  const out = [];
  for (const cb of pilot?.core_bonuses || []) out.push({ name: nameOf(cb?.data || cb), bonuses: bonusesOf(cb) });

  const loadout = mech?.loadouts?.[mech?.active_loadout_index ?? 0];
  for (const sys of loadout?.systems || []) out.push({ name: nameOf(sys?.data || sys), bonuses: bonusesOf(sys) });

  for (const t of mech?.frameData?.traits || []) out.push({ name: nameOf(t), bonuses: bonusesOf(t) });

  for (const t of pilot?.talents || []) {
    const rank = Number(t?.rank) || 0;
    const ranks = (t?.data?.ranks || t?.ranks || []).slice(0, rank);
    for (const r of ranks) out.push({ name: nameOf(r) || nameOf(t?.data || t), bonuses: bonusesOf(r) });
  }
  return out.filter((s) => s.bonuses.length);
}

// Числовий бонус: число або рядок з числом. Формули ({ll}, {grit}) і кубики — ні, бо
// вгадувати їх небезпечніше, ніж пропустити (кап лишається правимим вручну).
function numeric(val) {
  const n = typeof val === 'number' ? val : typeof val === 'string' && /^\s*[+-]?\d+\s*$/.test(val) ? Number(val) : NaN;
  return Number.isFinite(n) ? n : null;
}

function sumOf(list, id) {
  const parts = [];
  for (const s of list) {
    for (const b of s.bonuses) {
      if (b?.id !== id) continue;
      const v = numeric(b.val);
      if (v) parts.push({ name: s.name, val: v });
    }
  }
  return { total: parts.reduce((t, p) => t + p.val, 0), parts };
}

// Драбина Overcharge у форматі апки: '+1', '+1D3', … Береться перша знайдена.
function overchargeSteps(list) {
  for (const s of list) {
    for (const b of s.bonuses) {
      if (b?.id === 'overcharge' && Array.isArray(b.val) && b.val.length) {
        return { steps: b.val.map((v) => `+${String(v).toUpperCase()}`), name: s.name };
      }
    }
  }
  return null;
}

export function mechBonuses(pilot, mech) {
  const list = sources(pilot, mech);
  return {
    hp: sumOf(list, 'hp'),
    repcap: sumOf(list, 'repcap'),
    overcharge: overchargeSteps(list),
  };
}

// «+2 Personalizations, +5 Reinforced Frame» — для підказки й журналу.
export function bonusText(parts) {
  return parts.map((p) => `${p.val > 0 ? '+' : ''}${p.val} ${p.name}`).join(', ');
}
