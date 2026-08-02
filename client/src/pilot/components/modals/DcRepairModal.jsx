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
  const leftNote = hasBuffer ? ' → у буфер (Особистий склад)' : ' (згорить без Ресурсного буфера)';
  const showAlloc = d.packs > 0 && d.mechId;
  const allocLeft = 3 * d.packs - Object.values(d.alloc).reduce((a, b) => a + b, 0);

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_DCR' })}>
      <div className="modal-box" style={{ width: 480, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">РЕМОНТ ЗА DC</div>
        <div className="modal-body">
          <div>
            <div className="field-label">DC ОТРИМАНІ ЗА МІСІЮ</div>
            <input type="number" value={d.total} onChange={(e) => dispatch({ type: 'SET_DCR_TOTAL', value: e.target.value })} placeholder="0" style={{ width: 120, padding: '8px 10px', fontSize: 14 }} />
          </div>
          <div>
            <div className="field-label">ОБЕРІТЬ МЕХА</div>
            <MechSelect mechs={state.mechs} mechId={d.mechId} onPick={(id) => dispatch({ type: 'SET_DCR_MECH', mechId: id })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#c3d3e6', flex: 1 }}>
              Ремкомплекти <span style={{ color: 'var(--text-dimmer)' }}>(1 DC = 1 шт, лише на шкоду з місії)</span>
            </div>
            <button type="button" onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'kits', dir: -1 })} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '4px 10px', fontSize: 12 }}>−</button>
            <div style={{ minWidth: 24, textAlign: 'center', fontSize: 13 }}>{d.kits}</div>
            <button type="button" onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'kits', dir: 1 })} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '4px 10px', fontSize: 12 }}>+</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#c3d3e6', flex: 1 }}>
              Лімітні заряди <span style={{ color: 'var(--text-dimmer)' }}>(2 DC = 3 заряди)</span>
            </div>
            <button type="button" onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'packs', dir: -1 })} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '4px 10px', fontSize: 12 }}>−</button>
            <div style={{ minWidth: 24, textAlign: 'center', fontSize: 13 }}>{d.packs}</div>
            <button type="button" onClick={() => dispatch({ type: 'DCR_SHIFT', field: 'packs', dir: 1 })} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '4px 10px', fontSize: 12 }}>+</button>
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
                onClick={() => dispatch({ type: 'DCR_TOGGLE_ALL_REFILL' })}
                style={{ width: 22, height: 22, background: d.allRefill ? 'var(--accent)' : 'var(--input-bg)', border: '1px solid var(--input-border)' }}
              />
              <div style={{ fontSize: 12, color: '#c3d3e6', flex: 1 }}>
                Поповнити всі лімітні системи на 1 заряд <span style={{ color: 'var(--text-dimmer)' }}>(2 DC)</span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 4, paddingLeft: 34 }}>
              Доступно лише з талантом Grease Monkey / Unsanctioned
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', borderTop: '1px solid #16233490', paddingTop: 12 }}>
            Витрачено: {spent} DC · Залишок: {left} DC{leftNote}
          </div>
          {d.error && <div className="error-box">{d.error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'DCR_CONFIRM' })}>ОБМІНЯТИ</button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_DCR' })}>СКАСУВАТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
