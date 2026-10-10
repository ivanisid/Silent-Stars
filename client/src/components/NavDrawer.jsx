import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { THEMES, applyTheme, houseInfo, useThemeState } from '../theme';
import { announceOpen, modalIsOpen, onOtherOpen } from './overlayBus';
import AccountDialog from './AccountDialog.jsx';

// Ліва термінальна рейка (інтерфейс 2c). Завжди на екрані: закрита — 64px з іконками,
// відкрита — 300px з назвами, темою й виходом. Відкривається кліком по блоку
// користувача, по порожньому простору або по «темі»; закривається тим самим, кліком
// по затемненню, Esc або переходом. Відкриття рейки закриває магазин і навпаки.

const ITEMS = [
  { label: 'ВИБІР ПІЛОТА', desc: 'Ваші персонажі', to: '/pilots', code: 'ROS', d: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21c0-4 4-6 8-6s8 2 8 6' },
  { label: 'ЗАПИС НА ГРУ', desc: 'Слоти ігор та запис на них', to: '/board', code: 'BRD', d: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4' },
  { label: 'РЕЗЕРВИ', desc: 'Довідник: звичайні та рідкісні', to: '/reserves', code: 'RSV', d: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10' },
  { label: 'ГМ-ПАНЕЛЬ', desc: 'Персонажі всіх гравців', to: '/gm', code: 'GMP', d: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', gm: true },
];

function Icon({ d, size = 20, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" style={{ flex: 'none' }}>
      {d && <path d={d} />}
      {children}
    </svg>
  );
}

// Остання місія не змінюється, поки людина ходить між сторінками, — читаємо раз на акаунт.
const missionCache = new Map();

function missionLabel(slot) {
  if (!slot) return '—';
  const at = slot.game_at ? new Date(slot.game_at) : null;
  const pad = (n) => String(n).padStart(2, '0');
  const date = at && !Number.isNaN(at.getTime()) ? `${pad(at.getDate())}.${pad(at.getMonth() + 1)} · ` : '';
  return `${date}${slot.title || 'Гра без назви'}`;
}

function useLastMission(userId) {
  const [label, setLabel] = useState(() => missionCache.get(userId) ?? '—');
  useEffect(() => {
    if (!userId) return undefined;
    if (missionCache.has(userId)) {
      setLabel(missionCache.get(userId));
      return undefined;
    }
    let cancelled = false;
    api
      .lastMission(userId)
      .then((slot) => {
        const text = missionLabel(slot);
        missionCache.set(userId, text);
        if (!cancelled) setLabel(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return label;
}

export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const [themeMenu, setThemeMenu] = useState(false);
  const { theme, house } = useThemeState();
  const [railY, setRailY] = useState(null);
  const [account, setAccount] = useState(false);
  const raf = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isGm, logout } = useAuth();
  const lastMission = useLastMission(user?.id);
  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  const close = () => {
    setOpen(false);
    setThemeMenu(false);
  };
  const toggle = () => {
    if (open) return close();
    setOpen(true);
    announceOpen('nav');
  };

  useEffect(() => onOtherOpen('nav', close), []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && !modalIsOpen() && close();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const items = ITEMS.filter((it) => !it.gm || isGm);
  // Курсорний фрагмент шкали замінює біжучий лише у відкритій рейці під курсором.
  const follow = open && railY != null;

  return (
    <>
      {open && <div className="ss-rail-back" onClick={close} />}
      <nav
        className={`ss-rail${open ? ' open' : ''}`}
        onMouseMove={(e) => {
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
          cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(() => setRailY(y));
        }}
        onMouseLeave={() => {
          cancelAnimationFrame(raf.current);
          setRailY(null);
        }}
      >
        <div className="fx gloss" />
        <div className="fx aurora"><i /><i /></div>
        <div className="fx scale" />
        <div className="fx runwrap" style={{ opacity: follow ? 0 : 1 }}><div className="fx ticks" /></div>
        <div className="fx ticks follow" style={{ top: Math.max(0, (railY ?? 0) - 30), opacity: follow ? 1 : 0 }} />
        <div className="fx edge" />
        <div className="fx arrow">
          <Icon size={14} d={open ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
        </div>

        <div className="col">
          <button type="button" className="user" aria-label="Навігація" aria-expanded={open} onClick={toggle}>
            <span className="lbl grid">
              <span className="k">USER</span><span style={{ color: 'var(--text-bright)' }}>{user?.nick || '—'}</span>
              <span className="k">STATUS</span><span style={{ color: 'var(--success)' }}>ACTIVE</span>
              <span className="k">LAST MISSION</span><span style={{ color: 'var(--text)' }}>{lastMission}</span>
            </span>
          </button>
          <div className="sep" />
          {items.map((it) => {
            const on = location.pathname === it.to || location.pathname.startsWith(`${it.to}/`);
            return (
              <a
                key={it.to}
                href={it.to}
                className={`nav${on ? ' on' : ''}${it.gm ? ' gm' : ''}`}
                title={it.label}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  close();
                  navigate(it.to);
                }}
              >
                <div className="mark" />
                <div className="ic">
                  <Icon d={it.d} />
                  <span className="code">{it.code}</span>
                </div>
                <div className="lbl txt">
                  <span className="t">{on ? '▸ ' : ''}{it.label}</span>
                  <span className="d">// {it.desc}</span>
                </div>
              </a>
            );
          })}
          <div className="spacer" onClick={toggle} />
          {open && themeMenu && (
            <div className="themes">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={t.id === theme ? 'on' : ''}
                  onClick={() => {
                    applyTheme(t.id);
                    setThemeMenu(false);
                  }}
                >
                  <span>{t.label}</span>
                  {!t.dark && <span className="tag">світла</span>}
                </button>
              ))}
            </div>
          )}
          <div className="sep" />
          <button
            type="button"
            className="foot theme"
            title="Кольорова тема"
            aria-expanded={open && themeMenu}
            onClick={() => {
              if (!open) {
                setOpen(true);
                announceOpen('nav');
                setThemeMenu(true);
              } else setThemeMenu((v) => !v);
            }}
          >
            <span className="ic">
              <Icon size={16}>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
              </Icon>
            </span>
            <span className="lbl" style={{ color: 'var(--text)' }}>
              тема: {current.label}{theme === 'karrakin' ? ` · ${houseInfo(house).label}` : ''} <span style={{ color: 'var(--accent)' }}>{themeMenu && open ? '▾' : '▸'}</span>
            </span>
          </button>
          <button
            type="button"
            className="foot theme"
            title="Змінити нікнейм або пароль"
            onClick={() => {
              close();
              setAccount(true);
            }}
          >
            <span className="ic">
              <Icon size={16} d="M7 15a4 4 0 1 1 3.5-6H21v3h-2v3h-3v-3h-5.5A4 4 0 0 1 7 15z" />
            </span>
            <span className="lbl">Account manager</span>
          </button>
          <button type="button" className="foot out" title="Вийти" onClick={logout}>
            <span className="ic"><Icon size={16} d="M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10" /></span>
            <span className="lbl">logout</span>
          </button>
        </div>
      </nav>
      {account && <AccountDialog onClose={() => setAccount(false)} />}
    </>
  );
}
