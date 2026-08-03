import { createDefaultPilotState } from './pilotDefaults';
import { GAMES_TABLE } from './constants';
import { clamp, nowTs, skillCapMax } from './logic';

// Imports a "Save Pilot" export from COMP/CON (the Lancer TTRPG companion app).
// COMP/CON tracks a much richer character sheet than this app (full mech loadouts,
// talents, licenses, skill triggers as numeric ranks, etc.) — only the fields with a
// direct equivalent in our schema are carried over; everything homebrew-specific to
// this app (mana, DC store, hangar upgrades, skill triggers, projects, contacts) has
// no COMP/CON source and is left at its normal empty default.

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

// Full weapon/system reference list — most Lancer equipment has no ammo-style Limited
// count, so this is separate from collectLimited() above: a read-only "what's it
// carrying" list rather than something with trackable charges.
function collectEquipment(mech) {
  const results = [];
  const loadout = mech.loadouts?.[mech.active_loadout_index ?? 0];
  if (!loadout) return results;

  (loadout.mounts || []).forEach((mount) => {
    (mount.slots || []).forEach((slot) => {
      const w = slot.weapon?.data;
      if (!w) return;
      const detail = [mount.mount_type, w.type].filter(Boolean).join(' · ');
      results.push({ name: w.name, detail, kind: 'weapon' });
    });
  });

  (loadout.systems || []).forEach((sys) => {
    const s = sys.data || sys;
    if (!s?.name) return;
    const detail = s.sp ? `Система · ${s.sp} SP` : 'Система';
    results.push({ name: s.name, detail, kind: 'system' });
  });

  return results;
}

// COMP/CON pilot skills (Lancer's ~24 fixed named skills, each ranked 0–6) don't map 1:1 onto
// this app's homebrew Skill Triggers (arbitrary named triggers, level 1–3 giving +2/+4/+6,
// budget-capped by skillCapMax). Each skill becomes one trigger, rank halved into our 1–3 scale,
// and the import stops adding once it would exceed this pilot's own cap so the imported sheet
// stays internally consistent with our own economy.
function mapSkillTriggers(skills, cap) {
  const ranked = [...(skills || [])]
    .filter((s) => s?.data?.name && s.rank > 0)
    .sort((a, b) => b.rank - a.rank);

  const triggers = [];
  let used = 0;
  ranked.forEach((s, i) => {
    if (used >= cap) return;
    const level = clamp(Math.round(s.rank / 2) || 1, 1, 3);
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

function describeTalents(talents) {
  const names = (talents || [])
    .filter((t) => t?.data?.name)
    .map((t) => `${t.data.name} (${t.rank})`);
  return names.length ? `Таланти: ${names.join(', ')}` : '';
}

function describeLicenses(licenses) {
  const names = (licenses || [])
    .filter((l) => l?.stub?.name)
    .map((l) => `${l.stub.name} (${l.rank})`);
  return names.length ? `Ліцензії: ${names.join(', ')}` : '';
}

function mapMech(m) {
  const frameStats = m.frameData?.stats || {};
  const hpMax = frameStats.hp || 10;
  const repairMax = frameStats.repcap || 0;
  const liveHp = m.stats?.current?.hp;

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: m.name || m.frameData?.name || 'Мех',
    hpCurrent: liveHp > 0 ? liveHp : hpMax,
    hpMax,
    repairCurrent: repairMax,
    repairMax,
    structureFilled: 0,
    reactorFilled: 0,
    corePower: m.corePower ?? true,
    overcharge: 0,
    limited: collectLimited(m),
    equipment: collectEquipment(m),
  };
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

  const narrativeParts = [
    stripHtml(d.history),
    stripHtml(d.notes),
    (d.quirks || []).join('; '),
    describeTalents(d.talents),
    describeLicenses(d.licenses),
  ].filter(Boolean);

  const bondData = d.bond?.data;
  const state = {
    ...createDefaultPilotState(),
    games,
    status: d.status === 'ACTIVE' ? 'active' : 'archive',
    narrative: narrativeParts.join('\n\n'),
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
    mechs: (d.mechs || []).map(mapMech),
    actionLog: [{ ts: nowTs(), msg: `Імпортовано з COMP/CON (${d.callsign || d.name || 'пілот'})` }],
  };

  return {
    name: (d.name || d.callsign || 'Пілот').trim(),
    callsign: (d.callsign || d.name || 'PILOT').trim(),
    background: (d.background || '').trim() || 'Бекграунд не вказано.',
    state,
  };
}
