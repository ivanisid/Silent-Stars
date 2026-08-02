import { SHOP_DATA } from '../constants';

export default function ShopDrawer({ state, dispatch }) {
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', display: 'flex', alignItems: 'stretch', zIndex: 40 }}>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_SHOP_DRAWER' })}
        style={{
          alignSelf: 'center',
          background: 'var(--header)',
          border: '1px solid var(--header-border)',
          borderRight: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          padding: '16px 8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: 'var(--accent)', fontSize: 14 }}>{state.shop.open ? '→' : '←'}</span>
        <span style={{ writingMode: 'vertical-rl', fontSize: 11, letterSpacing: 3 }}>МАГАЗИН</span>
      </button>

      {state.shop.open && (
        <div style={{ width: 360, maxWidth: '85vw', height: '100vh', overflowY: 'auto', background: 'var(--panel)', borderLeft: '1px solid var(--header-border)', boxShadow: '-8px 0 30px #04070c99' }}>
          <div style={{ background: 'var(--header)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 1 }}>
            <div className="dot" />
            <div className="title">МАГАЗИН</div>
            <div style={{ fontSize: 11, color: '#9dc1e8', marginLeft: 'auto' }}>БАЛАНС: {state.mana.balance} М</div>
          </div>
          <div style={{ padding: '8px 0 20px 0' }}>
            <div style={{ padding: '10px 20px 4px 20px', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>ПОЗИЦІЯ / ЦІНА</div>
            {SHOP_DATA.map((it) => (
              <div key={it.key} style={{ padding: '12px 20px', borderTop: '1px solid #16233490' }}>
                <div style={{ fontSize: 12, color: '#c3d3e6', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{it.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{it.price} М</div>
                  <button className="btn" type="button" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => dispatch({ type: 'OPEN_SHOP_MODAL', key: it.key })}>
                    КУПИТИ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
