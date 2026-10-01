import { useState } from 'react';
import { SHOP_DATA, PR_SERVICES, LIMITED_REFILL_PR } from '../constants';

const TABS = [
  { key: 'repair', label: 'PRINTER', hint: 'ремонт за PR' },
  { key: 'mana', label: 'LUXURY', hint: 'за ману' },
];

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


function servicePrice(svc) {
  if (svc.cost != null) {
    return svc.manaCost ? `${svc.cost} PR / ${svc.manaCost} М` : `${svc.cost} PR`;
  }
  const vals = Object.values(LIMITED_REFILL_PR);
  return `${Math.min(...vals)}–${Math.max(...vals)} PR`;
}

// Найдешевший можливий варіант — ним вирішуємо, чи позиція взагалі по кишені.
function serviceMinCost(svc) {
  return svc.cost != null ? svc.cost : Math.min(...Object.values(LIMITED_REFILL_PR));
}

// Додатковий ремонт за PR. Раніше жив окремо на панелі PRINTER REQUISITION — переїхав
// сюди, щоб усі покупки були в одному місці. Чи потрібна downtime-дія — питання правил
// за столом, додаток його не стежить.
function RepairTab({ state, dispatch }) {
  return (
    <div style={{ padding: '8px 0 20px 0' }}>
      <div style={{ padding: '10px 20px 4px 20px', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>
        ДОДАТКОВИЙ РЕМОНТ
      </div>
      {PR_SERVICES.map((svc) => {
        const affordable = state.pr >= serviceMinCost(svc);
        return (
          <div key={svc.key} style={{ padding: '12px 20px', borderTop: '1px solid var(--rule)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.5 }}>{svc.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{servicePrice(svc)}</div>
              <button
                className="btn"
                type="button"
                disabled={!affordable}
                style={{ marginLeft: 'auto', fontSize: 11, opacity: affordable ? 1 : 0.55, cursor: affordable ? 'pointer' : 'not-allowed' }}
                onClick={() => dispatch({ type: 'OPEN_PR_SPEND', key: svc.key })}
              >
                КУПИТИ
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManaTab({ state, dispatch }) {
  return (
    <div style={{ padding: '8px 0 20px 0' }}>
      <div style={{ padding: '10px 20px 4px 20px', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>
        ПОЗИЦІЯ / ЦІНА
      </div>
      {SHOP_DATA.map((it) => {
        const affordable = state.mana.balance >= it.price;
        return (
          <div key={it.key} style={{ padding: '12px 20px', borderTop: '1px solid var(--rule)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
              {it.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{it.price} М</div>
              <button
                className="btn"
                type="button"
                disabled={!affordable}
                style={{ marginLeft: 'auto', fontSize: 11, opacity: affordable ? 1 : 0.55, cursor: affordable ? 'pointer' : 'not-allowed' }}
                onClick={() => dispatch({ type: 'OPEN_SHOP_MODAL', key: it.key })}
              >
                КУПИТИ
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ padding: '14px 20px 0 20px', fontSize: 10, color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
        Екзотичне спорядження купується тут же, коли ГМ назве позицію й ціну — сталого
        переліку в правилах немає.
      </div>
    </div>
  );
}

export default function ShopDrawer({ state, dispatch }) {
  // Вкладки RESERVES більше немає, але вона могла лишитись у збереженому стані —
  // невідому зводимо до першої, інакше шухляда відкрилася б порожньою.
  const stored = state.shop.tab;
  const tab = TABS.some((t) => t.key === stored) ? stored : TABS[0].key;

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

          {tab === 'repair' && <RepairTab state={state} dispatch={dispatch} />}
          {tab === 'mana' && <ManaTab state={state} dispatch={dispatch} />}
        </div>
      )}
    </div>
  );
}
