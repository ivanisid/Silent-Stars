import { Card } from './ui';
import { derivePilotView } from '../derive';

// Лічильник PR. Самі покупки за PR — і ремонт, і резерви — живуть у магазині,
// щоб не було двох місць, де можна витратити те саме.
export default function PrPanel({ state, dispatch }) {
  const view = derivePilotView(state);
  const pct = Math.min(100, Math.round((state.pr / view.prCap) * 100));

  return (
    <Card title="PRINTER REQUISITION" right={<span style={{ fontSize: 11, color: 'var(--text-info)' }}>PR</span>}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div className="title-font" style={{ fontSize: 36, color: 'var(--text-bright)' }}>{state.pr}</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {view.prCap} PR</div>
        </div>

        {/* Кап — 100 (200 з буфером), тож посегментна шкала зі старого складу DC тут
            не читається; смуга показує заповнення одним рухом. */}
        <div style={{ height: 10, marginTop: 10, background: 'var(--input-bg)', border: '1px solid var(--accent-dim)' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'PR_SHIFT', dir: -1 })}>−1</button>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'PR_SHIFT', dir: 1 })}>+1</button>
          <button
            className="btn-ghost"
            type="button"
            style={{ marginLeft: 'auto', fontSize: 11 }}
            onClick={() => dispatch({ type: 'OPEN_SHOP_TAB', tab: 'repair' })}
          >
            РЕМОНТ ЗА PR →
          </button>
          <button
            className="btn-ghost"
            type="button"
            style={{ fontSize: 11 }}
            onClick={() => dispatch({ type: 'OPEN_SHOP_TAB', tab: 'reserves' })}
          >
            РЕЗЕРВИ →
          </button>
        </div>
      </div>
    </Card>
  );
}
