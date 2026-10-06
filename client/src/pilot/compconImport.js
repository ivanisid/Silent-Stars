import { createDefaultPilotState } from './pilotDefaults';
import { MAX_LL } from './constants';
import { clamp, nowTs, skillCapMax } from './logic';

// Imports a "Save Pilot" export from COMP/CON (the Lancer TTRPG companion app).
// COMP/CON tracks a much richer character sheet than this app (full mech loadouts,
// talents, licenses, skill triggers as numeric ranks, etc.) — only the fields with a
// direct equivalent in our schema are carried over; everything homebrew-specific to
// this app (mana, DC store, hangar upgrades, skill triggers, projects, contacts) has
// no COMP/CON source and is left at its normal empty default.

function tagValue(tags, id) {
  const t = (tags || []).find((t) => t.id === id);
  return t ? Number(t.val) || 0 : null;
}

// A LIMITED weapon's real number of uses is its tag value plus everything that raises the
// cap, so the tag alone under-reports it. Per the core rules the pilot's ENGINEERING skill
// gives +1 use per 2 points; core bonuses (e.g. Integrated Ammo Feeds) and some frame traits
// add their own, and COMP/CON records those as a bonus with id 'limited_bonus'.
//
// Only passive `bonuses` are counted. `active_bonuses` hang off a core system and apply while
// it is active, which is not a standing increase to the cap. Anything this cannot see — brew
// content, a source shaped differently in the export — contributes 0 rather than a wrong
// guess, and the cap stays editable by hand on the sheet.
function sumLimitedBonuses(container) {
  return (container?.bonuses || [])
    .filter((b) => b?.id === 'limited_bonus')
    .reduce((total, b) => total + (Number(b.val) || 0), 0);
}

function limitedBonusFor(pilot, mech) {
  const eng = Number(pilot.mechSkills?.[3]) || 0;
  const fromEngineering = Math.floor(eng / 2);

  const fromCoreBonuses = (pilot.core_bonuses || []).reduce(
    (total, cb) => total + sumLimitedBonuses(cb?.data || cb),
    0,
  );

  const fromFrame = (mech.frameData?.traits || []).reduce(
    (total, t) => total + sumLimitedBonuses(t),
    0,
  );

  return { fromEngineering, fromCoreBonuses, fromFrame, total: fromEngineering + fromCoreBonuses + fromFrame };
}

// Повний список зброї та систем активного лоадауту. Лімітні отримують лічильник:
// base — значення тегу LIMITED (за ним рахується ціна поповнення), max — з бонусами.
function collectItems(mech, bonus = 0) {
  const results = [];
  const loadout = mech.loadouts?.[mech.active_loadout_index ?? 0];
  if (!loadout) return results;

  const push = (type, name, mount, tagMax, destroyed) => {
    const item = { name, type, mount: (mount || '').toString().toUpperCase(), destroyed: !!destroyed };
    if (tagMax) {
      const max = tagMax + bonus;
      Object.assign(item, { current: max, max, base: tagMax });
    }
    results.push(item);
  };

  (loadout.mounts || []).forEach((mount) => {
    (mount.slots || []).forEach((slot) => {
      const w = slot.weapon?.data;
      if (!w) return;
      push('weapon', w.name, w.mount || slot.size, tagValue(w.tags, 'tg_limited'), slot.weapon?.destroyed);
    });
  });

  (loadout.systems || []).forEach((sys) => {
    const s = sys.data || sys;
    if (!s?.name) return;
    push('system', s.name, '', tagValue(s.tags, 'tg_limited'), sys.destroyed);
  });

  return results;
}

// Бонд із «Save Pilot»: data.bond.data.{name, major_ideals, minor_ideals} і data.bond.xp.
// null — у файлі бонду немає.
export function mapCompconBond(json) {
  const b = json?.data?.bond;
  const d = b?.data;
  if (!d || !Array.isArray(d.major_ideals) || !Array.isArray(d.minor_ideals)) return null;
  return {
    name: d.name || b.bondId || 'Бонд',
    major: d.major_ideals.slice(0, 3),
    minor: d.minor_ideals.slice(),
    xp: Number.isFinite(b.xp) ? b.xp : null,
  };
}

// COMP/CON pilot skills (Lancer's ~24 fixed named skills, each ranked 0–6) don't map 1:1 onto
// this app's homebrew Skill Triggers (arbitrary named triggers, level 1–3 giving +2/+4/+6,
// budget-capped by skillCapMax). Each skill becomes one trigger, its rank clamped directly into
// our 1–3 scale (rank 1→1, 2→2, 3+→3 — no halving), and the import stops adding once it would
// exceed this pilot's own cap so the imported sheet stays internally consistent.
function mapSkillTriggers(skills, cap) {
  const ranked = [...(skills || [])]
    .filter((s) => s?.data?.name && s.rank > 0)
    .sort((a, b) => b.rank - a.rank);

  const triggers = [];
  let used = 0;
  ranked.forEach((s, i) => {
    if (used >= cap) return;
    const level = clamp(s.rank, 1, 3);
    const fitted = Math.min(level, cap - used);
    if (fitted < 1) return;
    triggers.push({
      id: Date.now() + i,
      name: s.data.name,
      desc: (s.data.detail || s.data.description || '').slice(0, 140),
      level: fitted,
    });
    used += fitted;
  });
  return triggers;
}

// Frame stats (frameData.stats.hp/repcap) are only the frame's base values — COMP/CON adds the
// pilot's HASE (Hull/Agility/Systems/Engineering) mech-skill points and Grit on top at runtime,
// and the raw export doesn't persist those already-summed totals. Per the Lancer core rules:
// Mech HP = Frame HP + Grit + 2×Hull; Repair Cap = Frame Repair Cap + floor(Hull÷2).
// `mechSkills` is the pilot's HASE array in that fixed order, so mechSkills[0] is Hull.
function mapMech(m, grit, hull, limitedBonus) {
  const frameStats = m.frameData?.stats || {};
  const hpMax = (frameStats.hp || 10) + grit + 2 * hull;
  const repairMax = (frameStats.repcap || 0) + Math.floor(hull / 2);
  const liveHp = m.stats?.current?.hp;

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: m.name || m.frameData?.name || 'Мех',
    // Ідентифікатор меха в COMP/CON: за ним повторний імпорт відрізняє «той самий мех» від
    // іншого меха з такою ж назвою з іншого файлу (профілю).
    ccId: m.id || '',
    // The chassis, kept apart from the pilot's own name for it: a mech called "Godhammer"
    // is an IPS-N Tortuga, and which frame it is drives everything at the table.
    frame: m.frameData?.name || '',
    frameSource: m.frameData?.source || '',
    hpCurrent: liveHp > 0 ? liveHp : hpMax,
    hpMax,
    repairCurrent: repairMax,
    repairMax,
    structureFilled: 0,
    reactorFilled: 0,
    corePower: m.corePower ?? true,
    overcharge: 0,
    items: collectItems(m, limitedBonus),
  };
}

// Some campaigns keep multiple mech "slots" for one character by saving separate COMP/CON
// pilots per build (same name, different callsign per mech, since COMP/CON ties talents/skills
// to a single pilot save). Re-importing another such file for an already-known pilot (matched by
// name) should only add/refresh that mech, not touch anything else already tracked on the pilot.
export function mergeMechsByName(existingMechs, importedMechs) {
  const result = [...(existingMechs || [])];
  (importedMechs || []).forEach((incoming) => {
    const idx = result.findIndex((m) => m.name.trim().toLowerCase() === incoming.name.trim().toLowerCase());
    if (idx >= 0) {
      result[idx] = { ...incoming, id: result[idx].id, ccId: incoming.ccId || result[idx].ccId || '' };
    } else {
      result.push(incoming);
    }
  });
  return result;
}

// Назви мехів у пілота унікальні (без урахування регістру): за назвою імпорт COMP/CON
// оновлює вже наявного меха, а в Foundry за нею розрізняються актори.
const mechKey = (name) => String(name || '').trim().toLowerCase();

export function isMechNameTaken(mechs, name, exceptId = null) {
  const key = mechKey(name);
  return !!key && (mechs || []).some((m) => m.id !== exceptId && mechKey(m.name) === key);
}

// Мехи з файлу, які не можна влити: два з однаковою назвою в самому файлі, або назва вже
// зайнята мехом з іншого файлу COMP/CON (інший ccId). Мех без ccId (доданий вручну чи
// імпортований до появи цього поля) вважається тим самим і оновлюється.
export function mechNameClashes(existingMechs, importedMechs) {
  const clashes = [];
  const seen = new Set();
  for (const incoming of importedMechs || []) {
    const key = mechKey(incoming.name);
    if (seen.has(key)) {
      clashes.push(incoming.name);
      continue;
    }
    seen.add(key);
    const same = (existingMechs || []).find((m) => mechKey(m.name) === key);
    if (same?.ccId && incoming.ccId && same.ccId !== incoming.ccId) clashes.push(incoming.name);
  }
  return clashes;
}

export function mechClashMessage(names) {
  return `Мех з назвою ${names.map((n) => `«${n}»`).join(', ')} уже є в пілота з іншого файлу COMP/CON. ` +
    'Назви мехів мають бути різні — перейменуйте меха в COMP/CON і завантажте файл знову.';
}

// Файл COMP/CON для кожного влитого меха: увесь файл, але в ньому лише цей мех. З нього
// модуль Foundry створює актора-пілота (таланти, скіли, ліцензії цього профілю) і меха.
// mech_id — той, що мех матиме в апці після mergeMechsByName (наявний за назвою або новий).
export function compconProfiles(existingMechs, importedMechs, json) {
  const byKey = new Map((existingMechs || []).map((m) => [mechKey(m.name), m]));
  const source = json?.data?.mechs || [];
  return (importedMechs || []).flatMap((incoming) => {
    const raw = source.find((m) => m.id === incoming.ccId) ||
      source.find((m) => mechKey(m.name || m.frameData?.name) === mechKey(incoming.name));
    if (!raw) return [];
    const id = byKey.get(mechKey(incoming.name))?.id ?? incoming.id;
    return [{ mechId: String(id), data: { ...json, data: { ...json.data, mechs: [raw] } } }];
  });
}

export function isCompconPilotExport(json) {
  return !!json && json.EXPORT_TYPE === 'Save Pilot' && !!json.data;
}

export function mapCompconPilot(json) {
  if (!isCompconPilotExport(json)) {
    throw new Error('Це не схоже на файл експорту пілота з COMP/CON (Save Pilot).');
  }
  const d = json.data;

  // Рівень пілота переноситься напряму: LL більше не виводиться з кількості ігор.
  const level = clamp(parseInt(d.level, 10) || 2, 2, MAX_LL);

  const bondData = d.bond?.data;
  const state = {
    ...createDefaultPilotState(),
    ll: level,
    status: d.status === 'ACTIVE' ? 'active' : 'archive',
    stress: clamp(d.bond?.stress || 0, 0, 8),
    stressMax: 8,
    bond: {
      ...createDefaultPilotState().bond,
      archetype: bondData?.name || '',
      confirmed: !!bondData?.name,
      xp: Math.max(0, d.bond?.xp || 0),
      powers: (d.bond?.bondPowers || []).map((p) => p.name),
      majorIdeals: (bondData?.major_ideals || []).slice(0, 3),
      minorIdeals: (bondData?.minor_ideals || []).slice(),
    },
    hp: {
      current: d.stats?.current?.hp || d.stats?.max?.hp || 6,
      max: d.stats?.max?.hp || 6,
    },
    skillTriggers: mapSkillTriggers(d.skills, skillCapMax(level, 0)),
    mechs: (d.mechs || []).map((m) =>
      mapMech(m, d.stats?.max?.grit || 0, d.mechSkills?.[0] || 0, limitedBonusFor(d, m).total),
    ),
    actionLog: [
      { ts: nowTs(), msg: `Імпортовано з COMP/CON (${d.callsign || d.name || 'пілот'})` },
      // The bonus is written down per mech so a wrong cap can be traced to its source
      // instead of looking like the import inventing numbers.
      ...(d.mechs || []).map((m) => {
        const b = limitedBonusFor(d, m);
        return {
          ts: nowTs(),
          msg:
            `Ліміт зарядів «${m.name || m.frameData?.name || 'мех'}»: +${b.total} ` +
            `(ENG ${b.fromEngineering} · кор-бонуси ${b.fromCoreBonuses} · фрейм ${b.fromFrame})` +
            (b.total === 0 ? ' — перевірте максимуми вручну' : ''),
        };
      }),
    ],
  };

  return {
    name: (d.name || d.callsign || 'Пілот').trim(),
    callsign: (d.callsign || d.name || 'PILOT').trim(),
    background: (d.background || '').trim() || 'Бекграунд не вказано.',
    state,
  };
}
