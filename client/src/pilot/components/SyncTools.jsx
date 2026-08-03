import { useRef, useState } from 'react';
import { mapCompconPilot } from '../compconImport';
import { parseAdventureLeagueCsv, summarizeAdventureLeagueLog } from '../csvImport';

export default function SyncTools({ dispatch }) {
  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [busy, setBusy] = useState(null); // 'csv' | 'json' | null
  const [error, setError] = useState('');

  async function handleCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy('csv');
    setError('');
    try {
      const text = await file.text();
      const rows = parseAdventureLeagueCsv(text);
      const summary = summarizeAdventureLeagueLog(rows);
      dispatch({ type: 'IMPORT_ADVENTURE_LOG', payload: summary });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleJson(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy('json');
    setError('');
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const mapped = mapCompconPilot(json);
      dispatch({ type: 'MERGE_COMPCON_MECHS', payload: { mechs: mapped.state.mechs, callsign: mapped.callsign } });
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Файл не є коректним JSON.' : err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-ghost" type="button" disabled={!!busy} onClick={() => csvInputRef.current?.click()} style={{ fontSize: 11, padding: '6px 12px' }}>
          {busy === 'csv' ? 'СИНХРОНІЗУЄТЬСЯ…' : 'ОНОВИТИ РІВЕНЬ/МАНУ З CSV'}
        </button>
        <button className="btn-ghost" type="button" disabled={!!busy} onClick={() => jsonInputRef.current?.click()} style={{ fontSize: 11, padding: '6px 12px' }}>
          {busy === 'json' ? 'ОНОВЛЮЄТЬСЯ…' : 'ОНОВИТИ МЕХА З COMP/CON JSON'}
        </button>
        <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsv} style={{ display: 'none' }} />
        <input ref={jsonInputRef} type="file" accept=".json,application/json" onChange={handleJson} style={{ display: 'none' }} />
      </div>
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
