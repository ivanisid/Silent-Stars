import { createDefaultPilotState } from './pilotDefaults';
import { GAMES_TABLE } from './constants';
import { clamp, nowTs } from './logic';

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

  const narrativeParts = [stripHtml(d.history), stripHtml(d.notes), (d.quirks || []).join('; ')].filter(Boolean);

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
