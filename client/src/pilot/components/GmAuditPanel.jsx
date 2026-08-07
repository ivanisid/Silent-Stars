import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Delta } from './ChangeLogPanel.jsx';

// Hidden GM-only audit of mana/DC operations, sourced from the server-side
// pilot_audit_log — the player can clear their visible action log, but not this.
// Rendered only for GMs (and RLS returns nothing to anyone else anyway).

const GOLD = 'var(--gm)';
const GOLD_DIM = 'var(--gm-dim)';

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function GmAuditPanel({ pilotId, refreshKey, onReverted }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function revert(r) {
    if (!window.confirm(
      `Повернути персонажа до стану перед операцією від ${formatDate(r.changedAt)}?\n\n` +
      'Усі зміни, зроблені після неї, буде скасовано. Відкат теж потрапить в аудит.',
    )) return;
    setBusyId(r.id);
    setError('');
    try {
      await api.revertPilotState(r.id);
      await onReverted?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await api.gmPilotAuditLog(pilotId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null) load();
  }

  // Keep an already-open panel current as the pilot is edited; stay quiet while
  // it's collapsed so a GM reading a profile isn't polling the audit log.
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <div style={{ border: `1px solid ${open ? GOLD_DIM : 'var(--gm-panel-border)'}`, background: 'var(--gm-panel)' }}>
      <button
        type="button"
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: "'Share Tech Mono',monospace",
          color: GOLD,
          fontSize: 12,
          letterSpacing: 2,
        }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>ГМ: АУДИТ МАНИ ТА DC</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>
          серверний лог · гравець не бачить і не може очистити
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 16px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <button className="btn-ghost" type="button" disabled={loading} onClick={load} style={{ fontSize: 11, padding: '4px 10px' }}>
              {loading ? 'ОНОВЛЮЄТЬСЯ…' : 'ОНОВИТИ'}
            </button>
            {rows !== null && (
              <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>операцій: {rows.length}</span>
            )}
          </div>

          {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
          {rows !== null && rows.length === 0 && !error && (
            <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Операцій з маною чи DC ще не зафіксовано.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 420, overflowY: 'auto' }}>
            {(rows || []).map((r, i) => {
              const logCleared = r.action === 'update' && r.logNewCount < r.logOldCount && r.logAdded.length === 0;
              return (
                <div key={i} style={{ borderTop: '1px solid var(--gm-rule)', padding: '8px 0' }}>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>{formatDate(r.changedAt)}</span>
                    <span style={{ fontSize: 11, color: GOLD, whiteSpace: 'nowrap' }}>{r.nick || 'невідомо'}</span>
                    {r.action === 'insert' && (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>пілота створено</span>
                    )}
                    {r.action === 'delete' && (
                      <span style={{ fontSize: 11, color: 'var(--danger)' }}>пілота видалено</span>
                    )}
                    <Delta label="МАНА" oldVal={r.manaOld} newVal={r.manaNew} />
                    <Delta label="DC" oldVal={r.dcOld} newVal={r.dcNew} />
                    {logCleared && (
                      <span style={{ fontSize: 11, color: 'var(--danger)', letterSpacing: 1 }}>
                        ⚠ ЖУРНАЛ ДІЙ ОЧИЩЕНО ({r.logOldCount} → {r.logNewCount})
                      </span>
                    )}
                    <button
                      className="btn-ghost"
                      type="button"
                      disabled={!r.revertible || busyId !== null}
                      onClick={() => revert(r)}
                      style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 9px', whiteSpace: 'nowrap' }}
                    >
                      {busyId === r.id ? 'ВІДКОЧУЄТЬСЯ…' : '↶ ВІДКОТИТИ'}
                    </button>
                  </div>
                  {r.logAdded.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {r.logAdded.map((e, j) => (
                        <div key={j} style={{ fontSize: 11, color: 'var(--text-grey)', paddingLeft: 12 }}>
                          › {e.msg}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
