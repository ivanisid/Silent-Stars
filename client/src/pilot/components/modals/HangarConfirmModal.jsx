import { HANGAR_DATA } from '../../constants';
import { hangarPriceText } from '../../derive';

export default function HangarConfirmModal({ state, dispatch }) {
  const key = state.hangar.confirm;
  if (!key) return null;
  const item = HANGAR_DATA.find((h) => h.key === key);
  if (!item) return null;
  const owned = state.hangar.owned[key] || 0;
  const level = Math.min(owned, item.prices.length - 1);
  const price = item.prices[level];
  const prPrice = item.pr?.[level] || 0;
  const multi = item.prices.length > 1;

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_HANGAR_CONFIRM' })}>
      <div className="modal-box" style={{ width: 420, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ПІДТВЕРДЖЕННЯ ПОКУПКИ</div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.6 }}>
            Придбати «{item.title}»{multi ? ` — рівень ${owned + 1}` : ''} за {hangarPriceText(item, owned)}?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Мана: {state.mana.balance} → {state.mana.balance - price} М
            {prPrice > 0 && <> · PR: {state.pr} → {state.pr - prPrice}</>}
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
