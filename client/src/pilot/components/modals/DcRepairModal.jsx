import { dcrSpentOf } from '../../logic';
import { MechSelect, AllocRows } from './shared';

export default function DcRepairModal({ state, dispatch }) {
  const d = state.dcr;
  if (!d.open) return null;
  const mech = state.mechs.find((m) => m.id === d.mechId);
  const total = parseFloat(d.total) || 0;
  const spent = dcrSpentOf(d);
  const left = Math.max(0, total - spent);
  const hasBuffer = (state.hangar.owned.buffer || 0) >= 1;
  const leftNote = hasBuffer
    ? ' — лишиться на меху, звідти можна перекинути в буфер'
    : ' — лишиться на меху до наступної гри';
  const showAlloc = d.packs > 0 && d.mechId;
  const allocLeft = 3 * d.packs - Object.values(d.alloc).reduce((a, b) => a + b, 0);

  // Every purchase is checked against the mech's remaining DC before it is offered, so an
  // unaffordable step is visibly disabled instead of silently refusing the click.
  const affords = (cost) => Boolean(mech) && spent + cost <= total;
  const kitsRoom = mech ? mech.repairCurrent + d.kits < mech.repairMax : false;
  const stepStyle = (enabled) => ({
    background: 'var(--btn-bg)',
    color: enabled ? 'var(--text)' : 'var(--text-faint)',
    border: '1px solid var(--btn-border)',
    padding: '4px 10px',
    fontSize: 12,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  });

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_DCR' })}>
      <div className="modal-box" style={{ width: 480, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">РЕМОНТ ЗА DC</div>
        <div className="modal-body">
          <div>
            <div className="field-label">ОБЕРІТЬ МЕХА</div>
            <MechSelect mechs={state.mechs} mechId={d.mechId} onPick={(id) => dispatch({ type: 'SET_DCR_MECH', mechId: id })} />
          </div>
          {/* The budget is the mech's own DC, not a typed number — nothing here can spend
              DC the mech does not have. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="field-label" style={{ margin: 0 }}>DC НА МЕХУ</div>
            <div className="title-font" style={{ fontSize: 20, color: total > 0 ? 'var(--accent)' : 'var(--text-dimmer)' }}>
              {mech ? `${total} DC` : '—'}
            </div>
            {mech && total === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
                нагорода за місію нараховується, коли ГМ закриває гру
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', flex: 1 }}>
              Ремкомплекти <span style={{ color: 'var(--text-dimmer)' }}>(1 DC = 1 шт, лише на шкоду з місії)</span>
            </div>
            <button type="button" disabled={d.kits <= 0} onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'kits', dir: -1 })} style={stepStyle(d.kits > 0)}>−</button>
            <div style={{ minWidth: 24, textAlign: 'center', fontSize: 13 }}>{d.kits}</div>
            <button type="button" disabled={!affords(1) || !kitsRoom} onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'kits', dir: 1 })} style={stepStyle(affords(1) && kitsRoom)}>+</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', flex: 1 }}>
              Лімітні заряди <span style={{ color: 'var(--text-dimmer)' }}>(2 DC = 3 заряди)</span>
            </div>
            <button type="button" disabled={d.packs <= 0} onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'packs', dir: -1 })} style={stepStyle(d.packs > 0)}>−</button>
            <div style={{ minWidth: 24, textAlign: 'center', fontSize: 13 }}>{d.packs}</div>
            <button type="button" disabled={!affords(2)} onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'packs', dir: 1 })} style={stepStyle(affords(2))}>+</button>
          </div>
          {showAlloc && (
            <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--input-border)' }}>
              <AllocRows mech={mech} alloc={d.alloc} limitLeft={allocLeft} onShift={(idx, dir) => dispatch({ type: 'DCR_ALLOC_SHIFT', idx, dir })} />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                disabled={!d.allRefill && !affords(2)}
                onClick={() => dispatch({ type: 'DCR_TOGGLE_ALL_REFILL' })}
                style={{
                  width: 22,
                  height: 22,
                  background: d.allRefill ? 'var(--accent)' : 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  cursor: !d.allRefill && !affords(2) ? 'not-allowed' : 'pointer',
                  opacity: !d.allRefill && !affords(2) ? 0.5 : 1,
                }}
              />
              <div style={{ fontSize: 12, color: 'var(--text-soft)', flex: 1 }}>
                Поповнити всі лімітні системи на 1 заряд <span style={{ color: 'var(--text-dimmer)' }}>(2 DC)</span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 4, paddingLeft: 34 }}>
              Доступно лише з талантом Grease Monkey / Unsanctioned
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
            Витрачено: {spent} DC · Залишок: {left} DC{leftNote}
          </div>
          {d.error && <div className="error-box">{d.error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn"
              type="button"
              disabled={!mech || spent <= 0}
              style={{ flex: 1, opacity: !mech || spent <= 0 ? 0.5 : 1, cursor: !mech || spent <= 0 ? 'not-allowed' : 'pointer' }}
              onClick={() => dispatch({ type: 'DCR_CONFIRM' })}
            >
              ОБМІНЯТИ
            </button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_DCR' })}>СКАСУВАТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
