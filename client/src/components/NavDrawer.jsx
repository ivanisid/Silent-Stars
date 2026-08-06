import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Left-side navigation drawer, mirroring the pilot profile's ShopDrawer on the right.
// Rendered on every authenticated page so navigation is in the same place everywhere.

const GOLD = '#e2b13c';
const GOLD_DIM = '#6b5320';

export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isGm, logout } = useAuth();

  const fromGm = location.state?.from === 'gm';

  const items = [
    { label: 'ВИБІР ПІЛОТА', desc: 'Ваші персонажі', to: '/pilots' },
    { label: 'ДОШКА ІГОР', desc: 'Слоти ігор та запис на них', to: '/board' },
    ...(isGm ? [{ label: 'ГМ-ПАНЕЛЬ', desc: 'Персонажі всіх гравців', to: '/gm', gold: true }] : []),
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', display: 'flex', alignItems: 'stretch', zIndex: 40 }}>
      {open && (
        <div style={{ width: 280, maxWidth: '85vw', height: '100vh', overflowY: 'auto', background: 'var(--panel)', borderRight: '1px solid var(--header-border)', boxShadow: '8px 0 30px #04070c99', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--header)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 1 }}>
            <div className="dot" />
            <div className="title">НАВІГАЦІЯ</div>
            <div style={{ fontSize: 11, color: '#9dc1e8', marginLeft: 'auto' }}>{user?.nick}</div>
          </div>
          <div style={{ padding: '14px 14px 0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => {
              const current = location.pathname === it.to;
              return (
                <button
                  key={it.to}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(it.to, fromGm && it.to !== '/gm' ? { state: { from: 'gm' } } : undefined);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    background: it.gold ? '#1a1409' : '#142031',
                    border: `1px solid ${it.gold ? GOLD_DIM : 'var(--input-border)'}`,
                    borderLeft: `3px solid ${current ? (it.gold ? GOLD : 'var(--accent)') : 'transparent'}`,
                    cursor: 'pointer',
                    padding: '14px 16px',
                    fontFamily: "'Share Tech Mono',monospace",
                  }}
                >
                  <div style={{ fontSize: 13, letterSpacing: 2, color: it.gold ? GOLD : 'var(--text-bright)' }}>{it.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 4 }}>
                    {current ? 'ви тут' : it.desc}
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto', padding: 14 }}>
            <button
              type="button"
              onClick={logout}
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                textAlign: 'left',
                background: '#151b26',
                border: '1px solid var(--input-border)',
                cursor: 'pointer',
                padding: '12px 16px',
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: 12,
                letterSpacing: 2,
                color: 'var(--text-dim)',
              }}
            >
              ВИЙТИ З АКАУНТА
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          alignSelf: 'center',
          background: 'var(--header)',
          border: `1px solid ${isGm ? GOLD_DIM : 'var(--header-border)'}`,
          borderLeft: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          padding: '16px 8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: isGm ? GOLD : 'var(--accent)', fontSize: 14 }}>{open ? '←' : '→'}</span>
        <span style={{ writingMode: 'vertical-rl', fontSize: 11, letterSpacing: 3 }}>МЕНЮ</span>
      </button>
    </div>
  );
}
