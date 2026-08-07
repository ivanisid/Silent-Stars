import { Card } from './ui';
import { bufServices } from '../constants';
import { derivePilotView } from '../derive';

export default function DcStorePanel({ state, dispatch }) {
  const view = derivePilotView(state);
  if (!view.dcStoreVisible) return null;

  const services = bufServices(state.hangar.owned);

  return (
    <Card title="ОСОБИСТИЙ СКЛАД" right={<span style={{ fontSize: 11, color: 'var(--text-info)' }}>DC</span>}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div className="title-font" style={{ fontSize: 36, color: 'var(--text-bright)' }}>{state.dcStore}</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {view.dcStoreCap} DC</div>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
          {Array.from({ length: view.dcStoreCap }, (_, i) => (
            <svg key={i} width="18" height="21" viewBox="0 0 20 23" style={{ display: 'block' }}>
              <polygon
                points="10,1 19,6.5 19,16.5 10,22 1,16.5 1,6.5"
                fill={i < state.dcStore ? 'var(--accent)' : 'var(--input-bg)'}
                stroke="var(--accent-dim)"
                strokeWidth="1.5"
              />
            </svg>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'DC_STORE_DEC' })}>−1</button>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'DC_STORE_INC' })}>+1</button>
        </div>
        <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
          <div className="field-label">ОБМІН DC</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {services.map((svc) => (
              <button
                key={svc.key}
                type="button"
                onClick={() => dispatch({ type: 'OPEN_BUF', key: svc.key })}
                disabled={state.dcStore < svc.cost}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  background: 'var(--btn-bg)',
                  color: 'var(--text)',
                  border: '1px solid var(--btn-border)',
                  padding: '8px 12px',
                  fontSize: 12,
                  cursor: state.dcStore < svc.cost ? 'not-allowed' : 'pointer',
                  opacity: state.dcStore < svc.cost ? 0.55 : 1,
                }}
              >
                <span>{svc.title}</span>
                <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>{svc.cost} DC</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
