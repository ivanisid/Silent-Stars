export default function ManaTxModal({ state, dispatch }) {
  if (!state.mana.txOpen) return null;
  const { txType, amount, comment, target, error } = state.mana;

  const typeOptions = [
    { value: 'deposit', label: 'ПОПОВНЕННЯ' },
    { value: 'withdraw', label: 'ВИТРАТА' },
    { value: 'transfer', label: 'ПЕРЕКАЗ' },
  ];

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_TX' })}>
      <div className="modal-box" style={{ width: 420, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ТРАНЗАКЦІЯ МАНИ</div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8 }}>
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => dispatch({ type: 'SET_TX_TYPE', value: opt.value })}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  fontSize: 12,
                  background: txType === opt.value ? 'var(--header)' : 'transparent',
                  color: txType === opt.value ? 'var(--text)' : 'var(--text-dimmer)',
                  border: '1px solid var(--input-border)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div>
            <div className="field-label">КІЛЬКІСТЬ</div>
            <input type="number" value={amount} onChange={(e) => dispatch({ type: 'SET_TX_AMOUNT', value: e.target.value })} style={{ width: '100%', padding: '8px 10px', fontSize: 14 }} />
          </div>
          {txType === 'transfer' && (
            <div>
              <div className="field-label">ПІЛОТ-ОТРИМУВАЧ</div>
              <input type="text" value={target} onChange={(e) => dispatch({ type: 'SET_TX_TARGET', value: e.target.value })} style={{ width: '100%', padding: '8px 10px', fontSize: 14 }} />
            </div>
          )}
          <div>
            <div className="field-label">КОМЕНТАР</div>
            <input type="text" value={comment} onChange={(e) => dispatch({ type: 'SET_TX_COMMENT', value: e.target.value })} style={{ width: '100%', padding: '8px 10px', fontSize: 14 }} />
          </div>
          {error && <div className="error-box">{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" type="button" onClick={() => dispatch({ type: 'CLOSE_TX' })}>СКАСУВАТИ</button>
            <button className="btn" type="button" onClick={() => dispatch({ type: 'SUBMIT_TX' })}>ПІДТВЕРДИТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
