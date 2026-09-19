import { Card } from './ui';
import { PR_SERVICES, LIMITED_REFILL_PR } from '../constants';
import { derivePilotView } from '../derive';

// Ціна послуги для списку. refillone залежить від конкретної системи, тож у списку
// показуємо діапазон, а точну ціну — вже в модалці після вибору системи.
function priceLabel(svc) {
  if (svc.cost != null) {
    return svc.manaCost ? `${svc.cost} PR / ${svc.manaCost} М` : `${svc.cost} PR`;
  }
  const vals = Object.values(LIMITED_REFILL_PR);
  return `${Math.min(...vals)}–${Math.max(...vals)} PR`;
}

// Найдешевший можливий варіант — ним вирішуємо, чи кнопка взагалі активна.
function minCost(svc) {
  if (svc.cost != null) return svc.cost;
  return Math.min(...Object.values(LIMITED_REFILL_PR));
}

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

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'PR_SHIFT', dir: -1 })}>−1</button>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'PR_SHIFT', dir: 1 })}>+1</button>
        </div>

        <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
          <div className="field-label">ДОДАТКОВИЙ РЕМОНТ · DOWNTIME «PRINTER USE»</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {PR_SERVICES.map((svc) => {
              const affordable = state.pr >= minCost(svc);
              return (
                <button
                  key={svc.key}
                  type="button"
                  onClick={() => dispatch({ type: 'OPEN_PR_SPEND', key: svc.key })}
                  disabled={!affordable}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    background: 'var(--btn-bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--btn-border)',
                    padding: '8px 12px',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: affordable ? 'pointer' : 'not-allowed',
                    opacity: affordable ? 1 : 0.55,
                  }}
                >
                  <span>{svc.title}</span>
                  <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>{priceLabel(svc)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
