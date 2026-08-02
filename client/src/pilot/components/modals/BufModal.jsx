import { bufServices } from '../../constants';
import { MechSelect, AllocRows } from './shared';

export default function BufModal({ state, dispatch }) {
  const { item: key, mechId, alloc, error } = state.buf;
  if (!key) return null;
  const svc = bufServices(state.hangar.owned).find((s) => s.key === key);
  const mech = state.mechs.find((m) => m.id === mechId);
  const needAlloc = key === 'charges' && mechId;
  const allocLeft = 3 - Object.values(alloc).reduce((a, b) => a + b, 0);

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_BUF' })}>
      <div className="modal-box" style={{ width: 460, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">СКЛАД · {svc?.title}</div>
        <div className="modal-body">
          <div>
            <div className="field-label">ОБЕРІТЬ МЕХА</div>
            <MechSelect mechs={state.mechs} mechId={mechId} onPick={(id) => dispatch({ type: 'SET_BUF_MECH', mechId: id })} />
          </div>
          {needAlloc && (
            <AllocRows mech={mech} alloc={alloc} limitLeft={allocLeft} onShift={(idx, dir) => dispatch({ type: 'BUF_ALLOC_SHIFT', idx, dir })} />
          )}
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Склад: {state.dcStore} DC → {state.dcStore - (svc?.cost || 0)} DC
          </div>
          {error && <div className="error-box">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'BUF_CONFIRM' })}>ОБМІНЯТИ</button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_BUF' })}>СКАСУВАТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
