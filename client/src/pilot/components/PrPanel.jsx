import { useState } from 'react';
import { Card } from './ui';
import { derivePilotView } from '../derive';

// Лічильник PR. Самі покупки за PR — і ремонт, і резерви — живуть у магазині,
// щоб не було двох місць, де можна витратити те саме.
export default function PrPanel({ state, dispatch }) {
  const view = derivePilotView(state);
  const pct = Math.min(100, Math.round((state.pr / view.prCap) * 100));
  const [tx, setTx] = useState(null);

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

        {/* Кроки ±1 і ±10 ріжуться по нулю й капу мовчки — це швидка правка лічильника.
            Точну суму з коментарем вписують через транзакцію. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {[-10, -1, 1, 10].map((d) => (
            <button key={d} className="btn" type="button" onClick={() => dispatch({ type: 'PR_SHIFT', dir: d })}>
              {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
            </button>
          ))}
          <button
            className="btn"
            type="button"
            style={{ fontSize: 11 }}
            onClick={() => setTx({ mode: 'deposit', amount: '', comment: '' })}
          >
            ТРАНЗАКЦІЯ
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            className="btn-ghost"
            type="button"
            style={{ fontSize: 11 }}
            onClick={() => dispatch({ type: 'OPEN_SHOP_TAB', tab: 'repair' })}
          >
            РЕМОНТ ЗА PR →
          </button>
        </div>
      </div>

      {tx && (
        <PrTxModal
          tx={tx}
          setTx={setTx}
          pr={state.pr}
          cap={view.prCap}
          onSubmit={(payload) => {
            dispatch({ type: 'PR_TX', ...payload });
            setTx(null);
          }}
        />
      )}
    </Card>
  );
}

// Форма транзакції тримається в локальному стані панелі, а не в стані пілота: те, що
// набрано наполовину, не має їхати в базу автозбереженням і осідати в знімках аудиту.
// Тому перевірки тут, а редюсер лише виконує вже коректну суму.
function PrTxModal({ tx, setTx, pr, cap, onSubmit }) {
  const raw = tx.amount.trim();
  const amount = Math.floor(Number(raw));
  const isNumber = raw !== '' && Number.isFinite(amount);

  let error = '';
  if (raw !== '' && (!isNumber || amount <= 0)) {
    error = 'Вкажіть ціле додатне число.';
  } else if (isNumber && amount > 0) {
    const next = tx.mode === 'withdraw' ? pr - amount : pr + amount;
    if (next < 0) error = `Недостатньо PR: на балансі ${pr}.`;
    else if (next > cap) error = `Кап ${cap} — вийшло б ${next}. Максимум зараз: +${cap - pr}.`;
  }

  const valid = isNumber && amount > 0 && !error;
  const preview = valid ? (tx.mode === 'withdraw' ? pr - amount : pr + amount) : null;

  const modes = [
    { value: 'deposit', label: 'ПОПОВНЕННЯ' },
    { value: 'withdraw', label: 'ВИТРАТА' },
  ];

  return (
    <div className="modal-backdrop" onClick={() => setTx(null)}>
      <div className="modal-box" style={{ width: 380, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ТРАНЗАКЦІЯ PR</div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8 }}>
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setTx({ ...tx, mode: m.value })}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  fontSize: 12,
                  background: tx.mode === m.value ? 'var(--header)' : 'transparent',
                  color: tx.mode === m.value ? 'var(--text)' : 'var(--text-dimmer)',
                  border: '1px solid var(--input-border)',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div>
            <div className="field-label">КІЛЬКІСТЬ PR</div>
            <input
              type="number"
              min={1}
              autoFocus
              value={tx.amount}
              onChange={(e) => setTx({ ...tx, amount: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) onSubmit({ mode: tx.mode, amount, comment: tx.comment });
              }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 14 }}
            />
          </div>

          <div>
            <div className="field-label">КОМЕНТАР</div>
            <input
              type="text"
              value={tx.comment}
              onChange={(e) => setTx({ ...tx, comment: e.target.value })}
              placeholder="За що саме"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 14 }}
            />
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {preview == null ? `Баланс ${pr} / ${cap} PR` : `${pr} → ${preview} / ${cap} PR`}
          </div>

          {error && <div className="error-box">{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" type="button" onClick={() => setTx(null)}>СКАСУВАТИ</button>
            <button
              className="btn"
              type="button"
              disabled={!valid}
              style={{ opacity: valid ? 1 : 0.55, cursor: valid ? 'pointer' : 'not-allowed' }}
              onClick={() => onSubmit({ mode: tx.mode, amount, comment: tx.comment })}
            >
              ПІДТВЕРДИТИ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
