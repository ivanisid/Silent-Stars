import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { THEMES, applyTheme, useThemeState } from '../theme';
import { modalIsOpen } from './overlayBus';
import { Icon, useLastMission } from './NavDrawer.jsx';

// Шторка SYS мобільної версії — знизу над таб-баром: блок користувача, тема, акаунт і
// вихід. Пункти навігації тут не дублюються: вони в таб-барі.

export default function SysSheet({ onClose, onAccount }) {
  const [themesOpen, setThemesOpen] = useState(false);
  const { theme } = useThemeState();
  const { user, logout } = useAuth();
  const lastMission = useLastMission(user?.id);
  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !modalIsOpen() && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <>
      <div className="ss-sys-back" onClick={onClose} />
      <div className="ss-sys" role="dialog" aria-label="SYS">
        <div className="line" />
        <div className="top">
          <div className="grid">
            <span className="k">USER</span><span style={{ color: 'var(--text-bright)' }}>{user?.nick || '—'}</span>
            <span className="k">STATUS</span><span style={{ color: 'var(--success)' }}>ACTIVE</span>
            <span className="k">LAST MISSION</span><span style={{ color: 'var(--text)' }}>{lastMission}</span>
          </div>
          <button type="button" className="ss-icon close" aria-label="Закрити" onClick={onClose}>×</button>
        </div>
        <div className="items">
          <button
            type="button"
            className={`item${themesOpen ? ' on' : ''}`}
            title="Кольорова тема"
            aria-expanded={themesOpen}
            onClick={() => setThemesOpen((v) => !v)}
          >
            <span className="ic accent">
              <Icon size={18}>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
              </Icon>
            </span>
            <span className="t">тема: <span style={{ color: 'var(--text-bright)' }}>{current.label}</span></span>
            <span style={{ color: 'var(--accent)' }}>{themesOpen ? '▾' : '▸'}</span>
          </button>
          {themesOpen && (
            <div className="themes">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={t.id === theme ? 'on' : ''}
                  onClick={() => {
                    applyTheme(t.id);
                    setThemesOpen(false);
                  }}
                >
                  <span>{t.label}</span>
                  {!t.dark && <span className="tag">світла</span>}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="item" title="Змінити нікнейм або пароль" onClick={onAccount}>
            <span className="ic"><Icon size={18} d="M7 15a4 4 0 1 1 3.5-6H21v3h-2v3h-3v-3h-5.5A4 4 0 0 1 7 15z" /></span>
            <span className="t">Account manager</span>
          </button>
          <button type="button" className="item out" title="Вийти" onClick={logout}>
            <span className="ic"><Icon size={18} d="M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10" /></span>
            <span className="t">logout</span>
          </button>
        </div>
      </div>
    </>
  );
}
