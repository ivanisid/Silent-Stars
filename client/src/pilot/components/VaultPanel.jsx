import { useMemo, useState } from 'react';
import { Card } from './ui';
import { RARE_RESERVES, rareReserveByKey, anyReserveByKey } from '../rareReserves';
import { derivePilotView } from '../derive';
import ReserveIcon from './ReserveIcon.jsx';
import { reserveByKey } from '../reserves';

// Склад рідкісних резервів. Не магазин: тут нічого не купується й не витрачається —
// гравець записує те, що видали як частину нагороди за місію. На складі резерв лежить
// і не згорає; «взяти на місію» перекладає його на руки, де він згорить після місії.
export default function VaultPanel({ state, dispatch }) {
  const [picking, setPicking] = useState(false);
  const vault = state.vault || [];
  // Кап приходить із derive — там же, де й решта похідних величин пілота.
  const cap = derivePilotView(state).vaultCap;
  const full = vault.length >= cap;

  return (
    <Card
      title="СКЛАД РІДКІСНИХ РЕЗЕРВІВ"
      right={
        <span style={{ fontSize: 11, color: full ? 'var(--warn)' : 'var(--text-info)' }}>
          {vault.length} / {cap}
        </span>
      }
    >
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {vault.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
            Склад порожній. Рідкісні резерви не купуються — їх видають як частину
            нагороди за місію. Отриманий запишіть сюди: вміщується {cap}.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vault.map((v) => {
            const def = rareReserveByKey(v.key);
            return (
              <div
                key={v.id}
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--panel-border)',
                  padding: '10px 12px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <ReserveIcon kind="rare" title="Рідкісний резерв" size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-bright)' }}>
                    {def?.name || v.key}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>
                    РАНГ {def?.rank ?? '?'} · {def?.action || '—'}
                    {def?.tags ? ` · ${def.tags}` : ''}
                  </span>
                </div>
                {def?.desc && (
                  <div style={{ fontSize: 11, color: 'var(--text-soft-dim)', lineHeight: 1.6, marginTop: 6 }}>
                    {def.desc}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    type="button"
                    style={{ fontSize: 11 }}
                    onClick={() => dispatch({ type: 'TAKE_VAULT_TO_MISSION', id: v.id })}
                  >
                    ВЗЯТИ НА МІСІЮ
                  </button>
                  <button
                    className="btn-ghost"
                    type="button"
                    style={{ fontSize: 11 }}
                    onClick={() => dispatch({ type: 'REMOVE_FROM_VAULT', id: v.id })}
                  >
                    СПИСАТИ
                  </button>
                </div>
                </div>
              </div>
            );
          })}
        </div>

        <OnHand state={state} dispatch={dispatch} />

        {full ? (
          <div style={{ fontSize: 11, color: 'var(--warn)' }}>
            Склад заповнений — звільніть місце, щоб записати ще один.
          </div>
        ) : (
          <button className="btn-ghost" type="button" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={() => setPicking(true)}>
            + ЗАПИСАТИ РЕЗЕРВ
          </button>
        )}

        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
          Поки резерв на складі, він не витрачається. Узятий на місію переходить «на руки»
          й згорає після неї.
        </div>
      </div>

      {picking && (
        <PickModal
          onClose={() => setPicking(false)}
          onPick={(key) => {
            dispatch({ type: 'ADD_TO_VAULT', key });
            setPicking(false);
          }}
        />
      )}
    </Card>
  );
}

// Резерви «на руках» — і куплені колись за PR, і взяті зі складу. Жили у вкладці
// RESERVES магазину; коли вкладку прибрали, переїхали сюди, бо це наступний крок
// того самого шляху: склад → на руках → згоріло після місії.
function OnHand({ state, dispatch }) {
  const list = state.reserves || [];
  if (list.length === 0) return null;
  return (
    <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
      <div className="field-label">НА РУКАХ ({list.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map((r) => {
          const def = anyReserveByKey(r.key);
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <ReserveIcon kind={reserveByKey(r.key)?.category || 'rare'} size={24} />
              <span style={{ flex: 1, color: 'var(--text-soft)' }}>{def?.name || r.key}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>
                {r.gamesLeft == null ? 'не згорає' : `${r.gamesLeft} ігор`}
              </span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'REMOVE_RESERVE', id: r.id })}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="btn-ghost"
        type="button"
        style={{ fontSize: 10, padding: '4px 10px', marginTop: 10 }}
        onClick={() => dispatch({ type: 'BURN_MISSION_RESERVES' })}
      >
        КІНЕЦЬ МІСІЇ — СПАЛИТИ РЕЗЕРВИ
      </button>
    </div>
  );
}

function PickModal({ onClose, onPick }) {
  const [rank, setRank] = useState(1);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return RARE_RESERVES.filter(
      (r) => r.rank === rank && (needle === '' || r.name.toLowerCase().includes(needle) || r.desc.toLowerCase().includes(needle)),
    );
  }, [rank, q]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ width: 620, maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">ЗАПИСАТИ РІДКІСНИЙ РЕЗЕРВ</div>
        <div className="modal-body" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2].map((rk) => (
              <button
                key={rk}
                type="button"
                onClick={() => setRank(rk)}
                style={{
                  padding: '7px 14px',
                  fontSize: 11,
                  background: rank === rk ? 'var(--header)' : 'var(--input-bg)',
                  color: rank === rk ? 'var(--text-bright)' : 'var(--text-dim)',
                  border: `1px solid ${rank === rk ? 'var(--accent)' : 'var(--input-border)'}`,
                }}
              >
                РАНГ {rk}
              </button>
            ))}
            <input
              type="text"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Пошук…"
              style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 12 }}
            />
          </div>

          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
            {list.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onPick(r.key)}
                style={{
                  textAlign: 'left',
                  padding: '9px 11px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <ReserveIcon kind="rare" size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-bright)' }}>{r.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 3 }}>
                  {r.action}
                  {r.tags ? ` · ${r.tags}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-soft-dim)', lineHeight: 1.5, marginTop: 5 }}>
                  {r.desc}
                </div>
                </div>
              </button>
            ))}
            {list.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Нічого не знайдено.</div>
            )}
          </div>

          <button className="btn-ghost" type="button" onClick={onClose} style={{ alignSelf: 'flex-end' }}>
            ЗАКРИТИ
          </button>
        </div>
      </div>
    </div>
  );
}
