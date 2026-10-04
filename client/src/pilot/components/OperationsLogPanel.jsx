import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Panel, useConfirm } from '../../components/kit.jsx';

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
  const [ask, dialog] = useConfirm();

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
    const ok = await ask({
      title: 'ВІДКОТИТИ ОПЕРАЦІЮ?',
      tone: own ? undefined : 'gm',
      question: `Повернути персонажа до стану перед операцією від ${formatDate(row.changedAt)}?`,
      lines: ['усі зміни, зроблені після неї, буде скасовано', 'відкат теж потрапить у журнал'],
      yesLabel: 'ВІДКОТИТИ',
    });
    if (!ok) return;
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
    <Panel
      title="ЖУРНАЛ ОПЕРАЦІЙ"
      sub={rows !== null ? `${rows.length} ОПЕРАЦІЙ` : undefined}
      right={
        <button
          className="btn-ghost sm"
          type="button"
          style={{ color: 'var(--header-text)', borderColor: 'var(--header-border)' }}
          disabled={loading}
          onClick={load}
        >
          {loading ? 'ОНОВЛЮЄТЬСЯ…' : 'ОНОВИТИ'}
        </button>
      }
    >
      {dialog}
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
        {error && <div className="error-box" style={{ margin: 14 }}>!! {error}</div>}
        {rows !== null && rows.length === 0 && !error && (
          <div className="ss-note" style={{ padding: '12px 14px' }}>&gt; Операцій ще не зафіксовано.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 480, overflowY: 'auto' }}>
          {(rows || []).map((r, i) => (
            <div
              key={r.id}
              className="m-op"
              style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) auto', gap: 12, padding: '9px 14px', alignItems: 'baseline', borderTop: i ? '1px solid var(--rule)' : 'none' }}
            >
              <span style={{ color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>{formatDate(r.changedAt)}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  {/* У своєму чарнику автор завжди ти — показуємо його лише в чужому. */}
                  {!own && r.nick && <span style={{ fontSize: 11, color: GOLD, whiteSpace: 'nowrap' }}>{r.nick}</span>}
                  {r.action === 'insert' && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>пілота створено</span>}
                  {r.action === 'delete' && <span style={{ fontSize: 11, color: 'var(--danger)' }}>пілота видалено</span>}
                  <Delta label="МАНА" oldVal={r.manaOld} newVal={r.manaNew} />
                  <Delta label="PR" oldVal={r.prOld} newVal={r.prNew} />
                  {journalCleared(r) && (
                    <span style={{ fontSize: 11, color: 'var(--danger)', letterSpacing: 1 }}>
                      !! ЖУРНАЛ ДІЙ ОЧИЩЕНО ({r.logOldCount} → {r.logNewCount})
                    </span>
                  )}
                </div>
                {r.logAdded.map((e, j) => (
                  <span key={j} style={{ fontSize: 11, color: 'var(--text-soft-dim)', overflowWrap: 'anywhere' }}>› {e.msg}</span>
                ))}
              </div>
              <button
                className="btn-ghost md"
                type="button"
                disabled={!r.revertible || busyId !== null}
                onClick={() => revert(r)}
              >
                {busyId === r.id ? 'ВІДКОЧУЄТЬСЯ…' : '↶ ВІДКОТИТИ'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--panel-border)', fontSize: 11, color: 'var(--text-grey)', lineHeight: 1.6 }}>
          Відкат повертає персонажа до стану перед обраною операцією й скасовує все, що було після неї. Кожен відкат теж записується.
        </div>
      </div>
    </Panel>
  );
}
