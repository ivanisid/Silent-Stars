import { SHOP_DATA } from '../../constants';
import { shopPrice } from '../../logic';
import { MechSelect } from './shared';

// Luxury shop. Позиції з needsMech застосовуються до обраного меха; пачка PR іде
// пілоту, тож вибір меха для неї не показується.
export default function ShopModal({ state, dispatch }) {
  const s = state.shop;
  if (!s.item) return null;
  const item = SHOP_DATA.find((it) => it.key === s.item);
  if (!item) return null;
  const price = shopPrice(item);

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_SHOP_MODAL' })}>
      <div className="modal-box" style={{ width: 460, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ПОКУПКА · {item.title}</div>
        <div className="modal-body">
          {item.needsMech && (
            <div>
              <div className="field-label">ОБЕРІТЬ МЕХА</div>
              <MechSelect mechs={state.mechs} mechId={s.mechId} onPick={(id) => dispatch({ type: 'SET_SHOP_MECH', mechId: id })} />
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Мана: {state.mana.balance} → {state.mana.balance - price}
          </div>

          {s.error && <div className="error-box">{s.error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'SHOP_CONFIRM' })}>
              ПРИДБАТИ ЗА {price} М
            </button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_SHOP_MODAL' })}>
              СКАСУВАТИ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
