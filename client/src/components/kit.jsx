import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NavDrawer from './NavDrawer.jsx';
import { houseInfo, nextHouse, useThemeState } from '../theme';

// Спільний набір компонентів інтерфейсу 2a: сторінка з фоновою сіткою, шапка, панель,
// меню «⋯», вікно підтвердження (замість window.confirm), лічильник-трек, повідомлення.
// Уся візуальна частина — класи ss-* у styles/theme.css, кольори лише зі змінних теми.

export function PageShell({ children, narrow = false }) {
  return (
    <div className="ss-page">
      <div className="ss-grid" aria-hidden="true" />
      <div className={`ss-wrap${narrow ? ' narrow' : ''}`}>{children}</div>
    </div>
  );
}

// Лого FERUM VOX; у темі KARRAKIN замість нього прапор вибраного дому — клік перемикає
// на наступний дім.
function HeaderMark() {
  const { theme, house } = useThemeState();
  if (theme !== 'karrakin') {
    return <img src="/logo-ferum-vox.webp" alt="" width="28" height="28" style={{ display: 'block' }} />;
  }
  const h = houseInfo(house);
  return (
    <button type="button" className="ss-flag" title={`${h.label} — наступний дім`} aria-label={`${h.label}. Наступний дім`} onClick={nextHouse}>
      <img src={`/houses/${h.id}.png`} alt="" data-house-flag="" />
    </button>
  );
}

// «[лого] > РОЗДІЛ / НАЗВА … нік». Навігація — ліва рейка, яка завжди на екрані.
export function PageHeader({ section, sectionTo, title, tag, right }) {
  const { user } = useAuth();
  return (
    <div className="ss-head">
      <HeaderMark />
      {sectionTo ? (
        <Link to={sectionTo} className="crumb">&gt; {section} /</Link>
      ) : (
        <span className="crumb">&gt; {section} /</span>
      )}
      <div className="h1">{title}</div>
      {tag}
      <div className="right">
        {right}
        <div className="nick">{user?.nick}</div>
      </div>
      <NavDrawer />
    </div>
  );
}

export function Panel({ id, title, sub, right, tone, className = '', children, style }) {
  return (
    <div id={id} className={`ss-panel${tone === 'gm' ? ' gm' : ''} ${className}`} style={style}>
      {title != null && (
        <div className={`ss-bar${tone ? ` ${tone}` : ''}`}>
          <div className="dot" />
          <span className="title">{title}</span>
          {sub != null && <span className="sub">{sub}</span>}
          {right && <div style={{ marginLeft: sub != null ? 8 : 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Msg({ kind = 'ok', children, style }) {
  const cls = kind === 'err' ? 'error-box' : kind === 'warn' ? 'warn-box' : 'success-box';
  const prefix = kind === 'err' ? '!!' : kind === 'warn' ? '::' : '>>';
  const text = typeof children === 'string' && children.startsWith(prefix) ? children : <>{prefix} {children}</>;
  return <div className={cls} style={style}>{text}</div>;
}

// Кнопка «⋯» з випадним меню. items: [{label, onClick, danger, disabled}] | {header} | {node}.
export function Menu({ items, icon = '⋯', small = false, width, title = 'Дії', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="ss-menu-wrap" ref={ref}>
      <button
        type="button"
        className={`ss-icon${small ? ' sm' : ''}`}
        aria-label={title}
        title={title}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {icon}
      </button>
      {open && (
        <div className="ss-menu" style={width ? { minWidth: width } : undefined} onClick={(e) => e.stopPropagation()}>
          {(items || []).filter(Boolean).map((it, i) => {
            if (it.header) return <div key={i} className="mh">{it.header}</div>;
            if (it.node) return <div key={i}>{it.node}</div>;
            return (
              <button
                key={i}
                type="button"
                className={`mi${it.danger ? ' danger' : ''}`}
                disabled={it.disabled}
                onClick={(e) => {
                  e.preventDefault();
                  if (!it.keepOpen) setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.label}
              </button>
            );
          })}
          {children}
        </div>
      )}
    </div>
  );
}

// Вікно підтвердження. tone: undefined (звичайний) | 'danger' | 'gm'.
// lines — рядки «> …» або {t, ink}; yesLabel/altLabel — підписи дій.
export function ConfirmDialog({ title, question, lines = [], note, tone, yesLabel = 'ТАК', noLabel = 'НІ', altLabel, canYes = true, onYes, onNo, onAlt, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onNo?.();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onNo]);
  const yesCls = tone === 'danger' ? 'btn-danger' : tone === 'gm' ? 'btn-gm' : 'btn';
  return (
    <div className="modal-backdrop" onClick={onNo}>
      <div className={`modal-box${tone ? ` ${tone}` : ''}`} style={{ width: 430 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">{title}</div>
        <div className="modal-body">
          {question && <div style={{ fontSize: 14, color: 'var(--text-bright)', lineHeight: 1.5 }}>{question}</div>}
          {lines.length > 0 && (
            <div className="modal-lines">
              {lines.filter((l) => l != null && l !== false).map((l, i) =>
                typeof l === 'string' ? (
                  <div key={i}>&gt; {l}</div>
                ) : (
                  <div key={i} style={{ color: l.ink || undefined }}>{l.t}</div>
                ),
              )}
            </div>
          )}
          {children}
          {note && <div style={{ fontSize: 12, color: 'var(--text-dimmer)', lineHeight: 1.6 }}>{note}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onNo}>{noLabel}</button>
            {altLabel && <button type="button" className="btn-ghost" onClick={onAlt}>{altLabel}</button>}
            <button type="button" className={yesCls} disabled={!canYes} onClick={() => canYes && onYes?.()} autoFocus>
              {yesLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// const [ask, dialog] = useConfirm();  …  if (await ask({ title, lines })) { … }
// Повертає true (так), false (ні / клік по оверлею) або 'alt' (альтернативна дія).
export function useConfirm() {
  const [req, setReq] = useState(null);
  const ask = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setReq({ ...opts, resolve });
      }),
    [],
  );
  const done = (v) => {
    req?.resolve(v);
    setReq(null);
  };
  const el = req ? (
    <ConfirmDialog {...req} onYes={() => done(true)} onNo={() => done(false)} onAlt={() => done('alt')} />
  ) : null;
  return [ask, el];
}

// Лічильник-трек: [значення /макс | сегменти на всю ширину | риска].
// size: 'lg' (40), undefined (30), 'sm' (26). onSeg(i) — клік по сегменту (необов'язково).
export function Track({ value, max, size, green = false, onSeg, label }) {
  const segs = Array.from({ length: max }, (_, i) => i < value);
  return (
    <div className={`ss-track${size ? ` ${size}` : ''}${green ? ' green' : ''}`} aria-label={label}>
      <div className="val">
        <b>{value}</b>
        <small>/{max}</small>
      </div>
      <div className="segs" style={{ gridTemplateColumns: `repeat(${Math.max(1, max)}, minmax(0, 1fr))` }}>
        {segs.map((on, i) =>
          onSeg ? (
            <button key={i} type="button" className={on ? 'on' : ''} onClick={() => onSeg(i)} aria-label={`${i + 1}`} />
          ) : (
            <div key={i} className={on ? 'on' : ''} />
          ),
        )}
      </div>
      <div className="tick" />
    </div>
  );
}

export function SyncBadge({ saving, at }) {
  return (
    <span className={`ss-sync${saving ? ' saving' : ''}`}>
      <i />
      {saving ? 'SYNC…' : `SYNC ■ ${at || '—'}`}
    </span>
  );
}
