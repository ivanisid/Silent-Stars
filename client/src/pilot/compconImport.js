import { createDefaultPilotState } from './pilotDefaults';
import { GAMES_TABLE } from './constants';
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

function collectLimited(mech) {
  const results = [];
  const loadout = mech.loadouts?.[mech.active_loadout_index ?? 0];
  if (!loadout) return results;

  (loadout.mounts || []).forEach((mount) => {
    (mount.slots || []).forEach((slot) => {
      const w = slot.weapon?.data;
      if (!w) return;
      const max = tagValue(w.tags, 'tg_limited');
      if (max) results.push({ name: w.name, current: max, max, destroyed: false });
    });
  });

  (loadout.systems || []).forEach((sys) => {
    const s = sys.data || sys;
    const max = tagValue(s.tags, 'tg_limited');
    if (max) results.push({ name: s.name, current: max, max, destroyed: false });
  });

  return results;
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
function mapMech(m, grit, hull) {
  const frameStats = m.frameData?.stats || {};
  const hpMax = (frameStats.hp || 10) + grit + 2 * hull;
  const repairMax = (frameStats.repcap || 0) + Math.floor(hull / 2);
  const liveHp = m.stats?.current?.hp;

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: m.name || m.frameData?.name || 'Мех',
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
    dc: m.dc ?? 0,
    limited: collectLimited(m),
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
      result[idx] = { ...incoming, id: result[idx].id };
    } else {
      result.push(incoming);
    }
  });
  return result;
}

export function isCompconPilotExport(json) {
  return !!json && json.EXPORT_TYPE === 'Save Pilot' && !!json.data;
}

export function mapCompconPilot(json) {
  if (!isCompconPilotExport(json)) {
    throw new Error('Це не схоже на файл експорту пілота з COMP/CON (Save Pilot).');
  }
  const d = json.data;

  const level = clamp(parseInt(d.level, 10) || 2, 2, 12);
  const games = GAMES_TABLE[level - 2];

  const bondData = d.bond?.data;
  const state = {
    ...createDefaultPilotState(),
    games,
    status: d.status === 'ACTIVE' ? 'active' : 'archive',
    stress: clamp(d.bond?.stress || 0, 0, 8),
    bond: {
      archetype: bondData?.name || '',
      xp: clamp(d.bond?.xp || 0, 0, 8),
      powers: (d.bond?.bondPowers || []).map((p) => p.name),
      newPower: '',
    },
    hp: {
      current: d.stats?.current?.hp || d.stats?.max?.hp || 6,
      max: d.stats?.max?.hp || 6,
    },
    skillTriggers: mapSkillTriggers(d.skills, skillCapMax(level, 0)),
    mechs: (d.mechs || []).map((m) => mapMech(m, d.stats?.max?.grit || 0, d.mechSkills?.[0] || 0)),
    actionLog: [{ ts: nowTs(), msg: `Імпортовано з COMP/CON (${d.callsign || d.name || 'пілот'})` }],
  };

  return {
    name: (d.name || d.callsign || 'Пілот').trim(),
    callsign: (d.callsign || d.name || 'PILOT').trim(),
    background: (d.background || '').trim() || 'Бекграунд не вказано.',
    state,
  };
}
