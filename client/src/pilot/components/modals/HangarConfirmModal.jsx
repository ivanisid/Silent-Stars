import { HANGAR_DATA } from '../../constants';

export default function HangarConfirmModal({ state, dispatch }) {
  const key = state.hangar.confirm;
  if (!key) return null;
  const item = HANGAR_DATA.find((h) => h.key === key);
  if (!item) return null;
  const owned = state.hangar.owned[key] || 0;
  const price = item.prices[Math.min(owned, item.prices.length - 1)];
  const multi = item.prices.length > 1;

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_HANGAR_CONFIRM' })}>
      <div className="modal-box" style={{ width: 420, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ПІДТВЕРДЖЕННЯ ПОКУПКИ</div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.6 }}>
            Придбати «{item.title}»{multi ? ` — рівень ${owned + 1}` : ''} за {price} мани?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Баланс: {state.mana.balance} М → {state.mana.balance - price} М
          </div>
          {state.hangar.error && <div className="error-box">{state.hangar.error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CONFIRM_HANGAR_BUY' })}>ПРИДБАТИ</button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_HANGAR_CONFIRM' })}>СКАСУВАТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
