import { useState } from 'react';
import { SHOP_DATA } from '../constants';
import { RESERVES, RESERVE_CATEGORIES, RESERVE_RANK_PR, RESERVE_FREE_BUY_MAX_RANK, reserveByKey } from '../reserves';

const TABS = [
  { key: 'reserves', label: 'РЕЗЕРВИ', hint: 'за PR' },
  { key: 'mana', label: 'ЗА МАНУ', hint: 'екзотика й ремонт' },
];

const RANKS = [1, 2, 3];

function Tab({ active, label, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 8px',
        background: active ? 'var(--panel-inset)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        color: active ? 'var(--text-bright)' : 'var(--text-dimmer)',
        fontFamily: "'Share Tech Mono',monospace",
        fontSize: 12,
        letterSpacing: 1,
        cursor: 'pointer',
      }}
    >
      {label}
      <div style={{ fontSize: 9, letterSpacing: 0, opacity: 0.7, marginTop: 2 }}>{hint}</div>
    </button>
  );
}

// Куплені резерви: скільки ігор ще живуть. null — не згорає сам.
function OwnedReserves({ state, dispatch }) {
  if (state.reserves.length === 0) return null;
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--header-border)', background: 'var(--panel-inset)' }}>
      <div className="field-label">НА РУКАХ ({state.reserves.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {state.reserves.map((r) => {
          const def = reserveByKey(r.key);
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ flex: 1, color: 'var(--text-soft)' }}>{def?.name || r.key}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>
                {r.gamesLeft == null ? 'не згорає' : `${r.gamesLeft} ігор`}
              </span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'REMOVE_RESERVE', id: r.id })}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn-ghost" type="button" style={{ fontSize: 10, padding: '4px 10px', marginTop: 10 }} onClick={() => dispatch({ type: 'BURN_MISSION_RESERVES' })}>
        КІНЕЦЬ МІСІЇ — СПАЛИТИ РЕЗЕРВИ
      </button>
    </div>
  );
}

function ReservesTab({ state, dispatch }) {
  const [rank, setRank] = useState(1);
  const [category, setCategory] = useState('all');

  const list = RESERVES.filter(
    (r) => r.rank === rank && (category === 'all' || r.category === category),
  );
  const cost = RESERVE_RANK_PR[rank];
  const cats = RESERVE_CATEGORIES.filter((c) => RESERVES.some((r) => r.rank === rank && r.category === c.key));

  return (
    <div>
      <OwnedReserves state={state} dispatch={dispatch} />

      <div style={{ padding: '12px 20px 0 20px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANKS.map((rk) => (
            <button
              key={rk}
              type="button"
              onClick={() => { setRank(rk); setCategory('all'); }}
              style={{
                flex: 1,
                padding: '7px 6px',
                fontSize: 11,
                background: rank === rk ? 'var(--header)' : 'var(--input-bg)',
                color: rank === rk ? 'var(--text-bright)' : 'var(--text-dim)',
                border: `1px solid ${rank === rk ? 'var(--accent)' : 'var(--input-border)'}`,
                cursor: 'pointer',
              }}
            >
              РАНГ {rk}
              <div style={{ fontSize: 9, opacity: 0.8 }}>{RESERVE_RANK_PR[rk]} PR</div>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 8, lineHeight: 1.5 }}>
          {rank <= RESERVE_FREE_BUY_MAX_RANK
            ? 'Купується без downtime-дії.'
            : 'Потребує downtime-дії Printer use.'}
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
          {[{ key: 'all', label: 'УСІ' }, ...cats].map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              style={{
                padding: '4px 8px',
                fontSize: 10,
                background: category === c.key ? 'var(--panel-inset)' : 'transparent',
                color: category === c.key ? 'var(--text-bright)' : 'var(--text-dimmer)',
                border: '1px solid var(--rule)',
                cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {state.shop.error && (
        <div style={{ padding: '10px 20px 0 20px' }}>
          <div className="error-box">{state.shop.error}</div>
        </div>
      )}

      <div style={{ padding: '10px 0 20px 0' }}>
        {list.map((r) => {
          const affordable = state.pr >= cost;
          return (
            <div key={r.key} style={{ padding: '12px 20px', borderTop: '1px solid var(--rule)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-bright)' }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-soft-dim)', lineHeight: 1.55, marginTop: 5 }}>{r.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{cost} PR</div>
                <button
                  className="btn"
                  type="button"
                  disabled={!affordable}
                  style={{ marginLeft: 'auto', fontSize: 11, opacity: affordable ? 1 : 0.55, cursor: affordable ? 'pointer' : 'not-allowed' }}
                  onClick={() => dispatch({ type: 'BUY_RESERVE', key: r.key })}
                >
                  ПРИДБАТИ
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManaTab({ state, dispatch }) {
  return (
    <div style={{ padding: '8px 0 20px 0' }}>
      <div style={{ padding: '10px 20px 4px 20px', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>
        ПОЗИЦІЯ / ЦІНА
      </div>
      {SHOP_DATA.map((it) => (
        <div key={it.key} style={{ padding: '12px 20px', borderTop: '1px solid var(--rule)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {it.title}
            {/* Позиції, яких нові правила не згадують — лишені зі старою ціною. */}
            {it.unspecified && (
              <span style={{ fontSize: 9, color: 'var(--warn)', marginLeft: 8 }}>ЦІНА НЕ ПІДТВЕРДЖЕНА</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{it.price} М</div>
            <button className="btn" type="button" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => dispatch({ type: 'OPEN_SHOP_MODAL', key: it.key })}>
              КУПИТИ
            </button>
          </div>
        </div>
      ))}
      <div style={{ padding: '14px 20px 0 20px', fontSize: 10, color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
        Екзотичне спорядження купується тут же, коли ГМ назве позицію й ціну — сталого
        переліку в правилах немає.
      </div>
    </div>
  );
}

export default function ShopDrawer({ state, dispatch }) {
  const tab = state.shop.tab || 'reserves';

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
        <div style={{ width: 400, maxWidth: '90vw', height: '100vh', overflowY: 'auto', background: 'var(--panel)', borderLeft: '1px solid var(--header-border)', boxShadow: '-8px 0 30px var(--overlay)' }}>
          <div style={{ background: 'var(--header)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 1 }}>
            <div className="dot" />
            <div className="title">МАГАЗИН</div>
            <div style={{ fontSize: 11, color: 'var(--text-info)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {state.pr} PR · {state.mana.balance} М
            </div>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--header-border)', position: 'sticky', top: 49, background: 'var(--panel)', zIndex: 1 }}>
            {TABS.map((t) => (
              <Tab key={t.key} active={tab === t.key} label={t.label} hint={t.hint} onClick={() => dispatch({ type: 'SET_SHOP_TAB', tab: t.key })} />
            ))}
          </div>

          {tab === 'reserves' ? <ReservesTab state={state} dispatch={dispatch} /> : <ManaTab state={state} dispatch={dispatch} />}
        </div>
      )}
    </div>
  );
}
