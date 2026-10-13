import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { announceOpen, onOtherOpen } from './overlayBus';
import { Icon, NAV_ITEMS } from './NavDrawer.jsx';
import SysSheet from './SysSheet.jsx';
import AccountDialog from './AccountDialog.jsx';

// Нижній таб-бар мобільної версії (≤640px) — замість лівої рейки. Вкладки ведуть на
// розділи, SYS відкриває шторку з темою, акаунтом і виходом. Шторка й стрічка магазину
// не відкриті одночасно — та сама шина, що в рейки й магазину на десктопі.

export default function MobileTabBar() {
  const [sys, setSys] = useState(false);
  const [account, setAccount] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isGm } = useAuth();

  const close = useCallback(() => setSys(false), []);
  useEffect(() => onOtherOpen('nav', close), [close]);
  useEffect(close, [location.pathname, close]);

  const items = NAV_ITEMS.filter((it) => !it.gm || isGm);

  return (
    <>
      {sys && (
        <SysSheet
          onClose={close}
          onAccount={() => {
            close();
            setAccount(true);
          }}
        />
      )}
      <div className="ss-mnav">
        <nav className="ss-tabbar">
          <div className="fx gloss" />
          <div className="fx scale" />
          <div className="fx runwrap"><div className="fx ticks" /></div>
          <div className="fx edge" />
          {items.map((it) => {
            const on = location.pathname === it.to || location.pathname.startsWith(`${it.to}/`);
            return (
              <a
                key={it.to}
                href={it.to}
                title={it.label}
                aria-current={on ? 'page' : undefined}
                className={`tab${on ? ' on' : ''}${it.gm ? ' gm' : ''}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  close();
                  navigate(it.to);
                }}
              >
                <div className="mark" />
                <div className="ic"><Icon d={it.d} /></div>
                <span className="code">{it.code}</span>
              </a>
            );
          })}
          <button
            type="button"
            className={`tab${sys ? ' on' : ''}`}
            title="Навігація"
            aria-expanded={sys}
            onClick={() => {
              if (sys) return close();
              setSys(true);
              announceOpen('nav');
            }}
          >
            <div className="mark" />
            <div className="ic"><span className="glyph">≡</span></div>
            <span className="code">SYS</span>
          </button>
        </nav>
      </div>
      {account && <AccountDialog onClose={() => setAccount(false)} />}
    </>
  );
}
