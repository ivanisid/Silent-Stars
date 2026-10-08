import { Panel } from '../../components/kit.jsx';

// «+300 · Гра #14» → сума окремо від опису, щоб її можна було підфарбувати.
function splitLabel(label) {
  const m = /^([+−-]\s?[\d.,]+)(?:\s·\s(.*))?$/.exec(label || '');
  if (!m) return { amount: '', text: label };
  return { amount: m[1].replace('-', '−'), text: m[2] || '' };
}

export default function ManaPanel({ state, dispatch }) {
  return (
    <Panel title="МАНА" sub="БАЛАНС ≥ 0">
      <div className="ss-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="title-font num" style={{ fontSize: 32, color: 'var(--text-bright)', lineHeight: 1 }}>
            {state.mana.balance}
            <span style={{ fontSize: 14, color: 'var(--text-soft-dim)', fontFamily: "'Share Tech Mono',monospace" }}> М</span>
          </div>
          <button className="btn" type="button" style={{ marginLeft: 'auto' }} title="Записати надходження або витрату мани із коментарем" onClick={() => dispatch({ type: 'OPEN_TX' })}>
            ТРАНЗАКЦІЯ
          </button>
        </div>
        {state.mana.history.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            {state.mana.history.map((h, i) => {
              const { amount, text } = splitLabel(h.label);
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: amount ? '60px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 10, padding: '6px 0', borderTop: '1px solid var(--rule)' }}>
                  {amount && <span className="num" style={{ color: amount.startsWith('+') ? 'var(--success)' : 'var(--danger)' }}>{amount}</span>}
                  <span style={{ color: 'var(--text-soft)', overflowWrap: 'anywhere' }}>{text || '—'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
