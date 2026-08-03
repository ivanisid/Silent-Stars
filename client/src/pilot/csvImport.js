// Parses an "Adventure League"-style character log CSV export. The export stacks three
// different tables into one file without section markers: a character-info table (row 0-1),
// a log-entry table (header on its own row, columns include player_level/gp_gained), and a
// MAGIC ITEM table (different column layout, rows tagged with type "MAGIC ITEM" interleaved
// among the log entries). Only the log-entry rows are relevant here — level and mana.

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

const LOG_ROW_TYPES = ['CharacterLogEntry', 'PurchaseLogEntry', 'TradeLogEntry'];

export function parseAdventureLeagueCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headerIdx = lines.findIndex((l) => l.startsWith('type,adventure_title'));
  if (headerIdx === -1) {
    throw new Error('Не знайдено заголовок логу («type,adventure_title,...») у CSV-файлі.');
  }
  const header = parseCsvLine(lines[headerIdx]);

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (!LOG_ROW_TYPES.includes(fields[0])) continue; // skips MAGIC ITEM rows and anything else
    const row = {};
    header.forEach((h, idx) => {
      row[h] = fields[idx];
    });
    rows.push(row);
  }
  return rows;
}

export function summarizeAdventureLeagueLog(rows) {
  let manaTotal = 0;
  let levelFound = null;
  const historyLabels = [];

  rows.forEach((r) => {
    const gp = parseFloat(r.gp_gained);
    if (!Number.isNaN(gp) && gp !== 0) {
      manaTotal += gp;
      const label = (r.adventure_title || r.notes || r.type || '').trim();
      historyLabels.push(`${gp > 0 ? '+' : ''}${gp}${label ? ' · ' + label : ''}`);
    }
    const lvl = parseInt(r.player_level, 10);
    if (!Number.isNaN(lvl) && lvl > 0) {
      levelFound = levelFound === null ? lvl : Math.max(levelFound, lvl);
    }
  });

  return { manaTotal, levelFound, historyLabels, entryCount: rows.length };
}
