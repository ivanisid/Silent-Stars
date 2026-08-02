import { SHOP_DATA } from '../../constants';
import { shopPrice } from '../../logic';
import { MechSelect, AllocRows } from './shared';

export default function ShopModal({ state, dispatch }) {
  const s = state.shop;
  if (!s.item) return null;
  const item = SHOP_DATA.find((it) => it.key === s.item);
  const mech = state.mechs.find((m) => m.id === s.mechId);
  const needQty = s.item === 'repair1';
  const needAlloc = s.item === 'charges3' && s.mechId;
  const needPick = s.item === 'refillone' && s.mechId;
  const totalPrice = shopPrice(item, s);
  const allocLeft = 3 - Object.values(s.alloc).reduce((a, b) => a + b, 0);

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_SHOP_MODAL' })}>
      <div className="modal-box" style={{ width: 460, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ПОКУПКА · {item?.title}</div>
        <div className="modal-body">
          <div>
            <div className="field-label">ОБЕРІТЬ МЕХА</div>
            <MechSelect mechs={state.mechs} mechId={s.mechId} onPick={(id) => dispatch({ type: 'SET_SHOP_MECH', mechId: id })} />
          </div>

          {needQty && (
            <div>
              <div className="field-label">СКІЛЬКИ?</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => dispatch({ type: 'SHOP_QTY_SHIFT', dir: -1 })} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '6px 12px', fontSize: 13 }}>−</button>
                <div className="title-font" style={{ minWidth: 28, textAlign: 'center', fontSize: 15 }}>{s.qty}</div>
                <button type="button" onClick={() => dispatch({ type: 'SHOP_QTY_SHIFT', dir: 1 })} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '6px 12px', fontSize: 13 }}>+</button>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>= {totalPrice} М</div>
              </div>
            </div>
          )}

          {needAlloc && (
            <AllocRows mech={mech} alloc={s.alloc} limitLeft={allocLeft} onShift={(idx, dir) => dispatch({ type: 'SHOP_ALLOC_SHIFT', idx, dir })} />
          )}

          {needPick && (
            <div>
              <div className="field-label">ОБЕРІТЬ ЗБРОЮ / СИСТЕМУ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mech.limited.map((li, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => dispatch({ type: 'SET_SHOP_PICK', idx })}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 13,
                      background: s.picked === idx ? 'var(--header)' : 'var(--input-bg)',
                      color: 'var(--text)',
                      border: `1px solid ${s.picked === idx ? 'var(--accent)' : 'var(--input-border)'}`,
                    }}
                  >
                    {li.name} ({li.current}/{li.max})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Баланс: {state.mana.balance} М → {state.mana.balance - totalPrice} М
          </div>
          {s.error && <div className="error-box">{s.error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'SHOP_CONFIRM' })}>ПРИДБАТИ</button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_SHOP_MODAL' })}>СКАСУВАТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
