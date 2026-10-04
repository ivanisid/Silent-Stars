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
          <div className="ss-seg" style={{ display: 'flex' }}>
            {typeOptions.map((opt) => (
              <button key={opt.value} type="button" className={txType === opt.value ? 'on' : ''} style={{ flex: 1 }} onClick={() => dispatch({ type: 'SET_TX_TYPE', value: opt.value })}>
                {opt.label}
              </button>
            ))}
          </div>
          <div>
            <div className="field-label">КІЛЬКІСТЬ</div>
            <input type="number" value={amount} onChange={(e) => dispatch({ type: 'SET_TX_AMOUNT', value: e.target.value })} className="ss-input" style={{ width: '100%' }} />
          </div>
          {txType === 'transfer' && (
            <div>
              <div className="field-label">ПІЛОТ-ОТРИМУВАЧ</div>
              <input type="text" value={target} onChange={(e) => dispatch({ type: 'SET_TX_TARGET', value: e.target.value })} className="ss-input" style={{ width: '100%' }} />
            </div>
          )}
          <div>
            <div className="field-label">КОМЕНТАР</div>
            <input type="text" value={comment} onChange={(e) => dispatch({ type: 'SET_TX_COMMENT', value: e.target.value })} className="ss-input" style={{ width: '100%' }} />
          </div>
          {error && <div className="error-box">!! {error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" type="button" onClick={() => dispatch({ type: 'CLOSE_TX' })}>СКАСУВАТИ</button>
            <button className="btn" type="button" onClick={() => dispatch({ type: 'SUBMIT_TX' })}>ПІДТВЕРДИТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
