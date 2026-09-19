import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Card } from './ui';

// One log for both roles. The player reads their own currency operations and can undo
// them; the GM reads and undoes the same rows in anyone's sheet. Sourced from the
// server audit log rather than state.actionLog, because the journal only holds text —
// the audit log holds the state before and after, which is what an undo needs.
//
// Granularity is one save, not one click: edits are autosaved on a debounce, so a
// burst of changes lands as a single revertible entry.

const GOLD = 'var(--gm-ink)';

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Delta({ label, oldVal, newVal }) {
  const diff = (newVal ?? 0) - (oldVal ?? 0);
  if (oldVal === newVal || diff === 0) return null;
  return (
    <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label} </span>
      <span style={{ color: 'var(--text-bright)' }}>{oldVal ?? '·'} → {newVal ?? '·'}</span>{' '}
      <span style={{ color: diff > 0 ? 'var(--success)' : 'var(--danger)' }}>
        ({diff > 0 ? '+' : ''}{diff})
      </span>
    </span>
  );
}

// A row where the journal shrank without anything being added: the player cleared it.
// Visible to both sides now — the log lives on the server and can't be wiped either way.
function journalCleared(r) {
  return r.action === 'update' && r.logNewCount < r.logOldCount && r.logAdded.length === 0;
}

export default function OperationsLogPanel({ pilotId, refreshKey, onReverted, own }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await api.pilotOperationsLog(pilotId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // refreshKey changes on every save, so an operation shows up here right after it
  // happens rather than only on the next page load.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilotId, refreshKey]);

  async function revert(row) {
    if (!window.confirm(
      `Повернути персонажа до стану перед операцією від ${formatDate(row.changedAt)}?\n\n` +
      'Усі зміни, зроблені після неї, буде скасовано. Відкат теж потрапить у журнал.',
    )) return;
    setBusyId(row.id);
    setError('');
    try {
      await api.revertPilotState(row.id);
      await onReverted?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="ЖУРНАЛ ОПЕРАЦІЙ"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {rows !== null && (
            <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>операцій: {rows.length}</span>
          )}
          <button className="btn-ghost" type="button" style={{ fontSize: 11, padding: '4px 10px' }} disabled={loading} onClick={load}>
            {loading ? 'ОНОВЛЮЄТЬСЯ…' : 'ОНОВИТИ'}
          </button>
        </div>
      }
    >
      <div style={{ padding: 20 }}>
        {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
        {rows !== null && rows.length === 0 && !error && (
          <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Операцій з маною чи PR ще не зафіксовано.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 420, overflowY: 'auto' }}>
          {(rows || []).map((r) => (
            <div key={r.id} style={{ borderTop: '1px solid var(--rule)', padding: '9px 0' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>
                  {formatDate(r.changedAt)}
                </span>

                {/* У своєму чарнику автор завжди ти — показуємо його лише в чужому. */}
                {!own && r.nick && (
                  <span style={{ fontSize: 11, color: GOLD, whiteSpace: 'nowrap' }}>{r.nick}</span>
                )}

                {r.action === 'insert' && (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>пілота створено</span>
                )}
                {r.action === 'delete' && (
                  <span style={{ fontSize: 11, color: 'var(--danger)' }}>пілота видалено</span>
                )}

                <Delta label="МАНА" oldVal={r.manaOld} newVal={r.manaNew} />
                <Delta label="PR" oldVal={r.prOld} newVal={r.prNew} />

                {journalCleared(r) && (
                  <span style={{ fontSize: 11, color: 'var(--danger)', letterSpacing: 1 }}>
                    ⚠ ЖУРНАЛ ДІЙ ОЧИЩЕНО ({r.logOldCount} → {r.logNewCount})
                  </span>
                )}

                <button
                  className="btn-ghost"
                  type="button"
                  disabled={!r.revertible || busyId !== null}
                  onClick={() => revert(r)}
                  style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
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
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
          Відкат повертає персонажа до стану перед обраною операцією й скасовує все, що
          було після неї. Кожен відкат теж записується — журнал лежить на сервері й не
          очищується з чарника.
        </div>
      </div>
    </Card>
  );
}
