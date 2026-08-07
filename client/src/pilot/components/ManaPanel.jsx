import { Card } from './ui';

export default function ManaPanel({ state, dispatch }) {
  return (
    <Card title="МАНА">
      <div style={{ padding: 20 }}>
        <div className="title-font" style={{ fontSize: 36, color: 'var(--text-bright)' }}>{state.mana.balance}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>БАЛАНС ≥ 0</div>
        <button className="btn" type="button" style={{ marginTop: 14 }} onClick={() => dispatch({ type: 'OPEN_TX' })}>
          ЗРОБИТИ ТРАНЗАКЦІЮ
        </button>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {state.mana.history.map((h, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-soft-dim)', borderTop: '1px solid var(--rule)', paddingTop: 6 }}>
              {h.label}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
