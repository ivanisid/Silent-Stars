import { useState } from 'react';
import { Panel } from '../../components/kit.jsx';
import { derivePilotView } from '../derive';
import { openShop } from '../../components/overlayBus';

// Лічильник PR. Самі покупки за PR — і ремонт, і резерви — живуть у магазині,
// щоб не було двох місць, де можна витратити те саме.
export default function PrPanel({ state, dispatch }) {
  const view = derivePilotView(state);
  const pct = Math.min(100, Math.round((state.pr / view.prCap) * 100));
  const [tx, setTx] = useState(null);

  return (
    <Panel title="PRINTER REQUISITION" sub="PR">
      <div className="ss-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="title-font num" style={{ fontSize: 32, color: 'var(--text-bright)', lineHeight: 1 }}>
            {state.pr}
            <span style={{ fontSize: 14, color: 'var(--text-soft-dim)', fontFamily: "'Share Tech Mono',monospace" }}> /{view.prCap}</span>
          </div>
          {/* Кап — 100 (200 з буфером): смуга показує заповнення одним рухом. */}
          <div style={{ flex: 1, height: 10, background: 'var(--input-bg)', border: '1px solid var(--accent-dim)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>

        {/* Кроки ±1 і ±10 ріжуться по нулю й капу мовчки — це швидка правка лічильника.
            Точну суму з коментарем вписують через транзакцію. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="ss-stepper" style={{ background: 'transparent' }}>
            <button type="button" title="Зменшити PR на 10 (не нижче 0)" onClick={() => dispatch({ type: 'PR_SHIFT', dir: -10 })}>−10</button>
            <button type="button" title="Зменшити PR на 1 (не нижче 0)" onClick={() => dispatch({ type: 'PR_SHIFT', dir: -1 })}>−1</button>
            <div className="v sunk num" style={{ padding: '0 14px', fontSize: 12 }}>{state.pr}</div>
            <button type="button" title="Збільшити PR на 1 (не вище капу)" onClick={() => dispatch({ type: 'PR_SHIFT', dir: 1 })}>+1</button>
            <button type="button" title="Збільшити PR на 10 (не вище капу)" onClick={() => dispatch({ type: 'PR_SHIFT', dir: 10 })}>+10</button>
          </div>
          <button className="btn" type="button" title="Поповнити або списати точну суму PR із коментарем" onClick={() => setTx({ mode: 'deposit', amount: '', comment: '' })}>
            ТРАНЗАКЦІЯ
          </button>
          <button className="btn-ghost" type="button" style={{ marginLeft: 'auto' }} title="Відкрити магазин на вкладці ремонту за PR" onClick={() => openShop('repair')}>
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
    </Panel>
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
      <div className="modal-box" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ТРАНЗАКЦІЯ PR</div>
        <div className="modal-body">
          <div className="ss-seg" style={{ display: 'flex' }}>
            {modes.map((m) => (
              <button key={m.value} type="button" className={tx.mode === m.value ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTx({ ...tx, mode: m.value })}>
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
              className="ss-input" style={{ width: '100%' }}
            />
          </div>

          <div>
            <div className="field-label">КОМЕНТАР</div>
            <input
              type="text"
              value={tx.comment}
              onChange={(e) => setTx({ ...tx, comment: e.target.value })}
              placeholder="За що саме"
              className="ss-input" style={{ width: '100%' }}
            />
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {preview == null ? `Баланс ${pr} / ${cap} PR` : `${pr} → ${preview} / ${cap} PR`}
          </div>

          {error && <div className="error-box">!! {error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" type="button" onClick={() => setTx(null)}>СКАСУВАТИ</button>
            <button
              className="btn"
              type="button"
              disabled={!valid}
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
