import { useEffect, useState } from 'react';
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

// Ліва навігаційна шухляда. Відкривається кнопкою ≡ у шапці сторінки (PageHeader),
// закривається кліком по затемненню, Esc або переходом.

const GOLD = 'var(--gm)';
const GOLD_DIM = 'var(--gm-dim)';

export default function NavDrawer({ open, onClose }) {
  const [theme, setTheme] = useState(loadTheme);
  const [themeMenu, setThemeMenu] = useState(false);
  const current = THEMES.find((t) => t.id === theme) || THEMES[0];
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isGm, logout } = useAuth();

  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open) return null;

  const items = [
    { label: 'ВИБІР ПІЛОТА', desc: 'Ваші персонажі', to: '/pilots' },
    { label: 'ЗАПИС НА ГРУ', desc: 'Слоти ігор та запис на них', to: '/board' },
    { label: 'РЕЗЕРВИ', desc: 'Довідник: звичайні та рідкісні', to: '/reserves' },
    ...(isGm ? [{ label: 'ГМ-ПАНЕЛЬ', desc: 'Персонажі всіх гравців', to: '/gm', gold: true }] : []),
  ];

  return (
    <>
      <div className="ss-drawer-back" onClick={onClose} />
        <div className="ss-drawer">
          <div className="ss-bar" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <div className="dot" />
            <span className="title">НАВІГАЦІЯ</span>
            <span className="sub">{user?.nick}</span>
            <button type="button" className="ss-icon sm" aria-label="Закрити" onClick={onClose} style={{ color: 'var(--header-text)', borderColor: 'var(--header-border)' }}>✕</button>
          </div>
          <div style={{ padding: '14px 14px 0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => {
              const current = location.pathname === it.to;
              return (
                <button
                  key={it.to}
                  type="button"
                  onClick={() => {
                    onClose();
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
    </>
  );
}
