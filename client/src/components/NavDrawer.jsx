import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { THEMES, applyTheme, loadTheme } from '../theme';

function Swatch({ colors }) {
  return (
    <span style={{ display: 'flex', width: 26, height: 13, flexShrink: 0, border: '1px solid var(--rule)' }}>
      {colors.map((c) => (
        <span key={c} style={{ flex: 1, background: c }} />
      ))}
    </span>
  );
}

// Left-side navigation drawer, mirroring the pilot profile's ShopDrawer on the right.
// Rendered on every authenticated page so navigation is in the same place everywhere.

const GOLD = 'var(--gm)';
const GOLD_DIM = 'var(--gm-dim)';

const TAB_W = 48;
const TAB_H = 190;
const TAB_SLANT = 26; // how far the outer edge tapers in, top and bottom
const TAB_RADIUS = 5; // just enough to take the point off the corners, edges stay straight

// Tab shape: flush against the screen edge on the left, tapering to a shorter outer
// edge on the right — a trapezoid whose two visible corners are rounded off.
function trapezoidPath(w, h, slant, r) {
  const corners = [
    [0, 0],
    [w, slant],
    [w, h - slant],
    [0, h],
  ];
  const toward = (from, to, dist) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.min(dist, len / 2);
    return [from[0] + (dx / len) * d, from[1] + (dy / len) * d];
  };

  const [a, b, c, d] = corners;
  const bIn = toward(b, a, r);
  const bOut = toward(b, c, r);
  const cIn = toward(c, b, r);
  const cOut = toward(c, d, r);
  const pt = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;

  return `M ${pt(a)} L ${pt(bIn)} Q ${pt(b)} ${pt(bOut)} L ${pt(cIn)} Q ${pt(c)} ${pt(cOut)} L ${pt(d)} Z`;
}

export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [themeMenu, setThemeMenu] = useState(false);
  const current = THEMES.find((t) => t.id === theme) || THEMES[0];
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isGm, logout } = useAuth();

  const items = [
    { label: 'ВИБІР ПІЛОТА', desc: 'Ваші персонажі', to: '/pilots' },
    { label: 'ДОШКА ЗАВДАНЬ', desc: 'Слоти ігор та запис на них', to: '/board' },
    ...(isGm ? [{ label: 'ГМ-ПАНЕЛЬ', desc: 'Персонажі всіх гравців', to: '/gm', gold: true }] : []),
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', display: 'flex', alignItems: 'stretch', zIndex: 40 }}>
      {open && (
        <div style={{ width: 280, maxWidth: '85vw', height: '100vh', overflowY: 'auto', background: 'var(--panel)', borderRight: '1px solid var(--header-border)', boxShadow: '8px 0 30px var(--overlay)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--header)', color: 'var(--header-text)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 1 }}>
            <div className="dot" />
            <div className="title">НАВІГАЦІЯ</div>
            <div style={{ fontSize: 11, opacity: 0.75, marginLeft: 'auto' }}>{user?.nick}</div>
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
                    navigate(it.to);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    background: it.gold ? 'var(--gm-item)' : 'var(--panel-inset)',
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
          <div style={{ marginTop: 'auto', padding: '14px 14px 0 14px', position: 'relative' }}>
            <div className="field-label">КОЛЬОРОВА ТЕМА</div>
            <button
              type="button"
              onClick={() => setThemeMenu((v) => !v)}
              aria-expanded={themeMenu}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                color: 'var(--text)',
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Swatch colors={current.swatch} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.label}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>{themeMenu ? '▾' : '▸'}</span>
            </button>

            {themeMenu && (
              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  right: 14,
                  bottom: '100%',
                  maxHeight: 320,
                  overflowY: 'auto',
                  background: 'var(--panel)',
                  border: '1px solid var(--header-border)',
                  boxShadow: '0 -10px 30px var(--shadow)',
                  zIndex: 2,
                }}
              >
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTheme(applyTheme(t.id));
                      setThemeMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 10px',
                      textAlign: 'left',
                      background: t.id === theme ? 'var(--panel-inset)' : 'transparent',
                      border: 'none',
                      borderTop: '1px solid var(--rule)',
                      color: t.id === theme ? 'var(--text-bright)' : 'var(--text-dim)',
                      fontFamily: "'Share Tech Mono',monospace",
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <Swatch colors={t.swatch} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                    {!t.dark && (
                      <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dimmer)' }}>світла</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: 14 }}>
            <button
              type="button"
              onClick={logout}
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                textAlign: 'left',
                background: 'var(--panel-inset)',
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
        aria-label="Меню"
        style={{
          alignSelf: 'center',
          position: 'relative',
          width: TAB_W,
          height: TAB_H,
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--header-text)',
          cursor: 'pointer',
        }}
      >
        <svg
          viewBox={`0 0 ${TAB_W} ${TAB_H}`}
          width={TAB_W}
          height={TAB_H}
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          <path
            d={trapezoidPath(TAB_W - 1, TAB_H - 1, TAB_SLANT, TAB_RADIUS)}
            fill="var(--header)"
            stroke={isGm ? GOLD_DIM : 'var(--header-border)'}
            strokeWidth="1"
          />
        </svg>
        <span
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 10,
          }}
        >
          <span style={{ color: isGm ? GOLD : 'var(--header-text)', fontSize: 17 }}>{open ? '←' : '→'}</span>
          <span style={{ writingMode: 'vertical-rl', fontSize: 14, letterSpacing: 5 }}>МЕНЮ</span>
        </span>
      </button>
    </div>
  );
}
