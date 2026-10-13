import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NavDrawer from './NavDrawer.jsx';
import MobileTabBar from './MobileTabBar.jsx';
import { useIsMobile } from '../useMobile';
import { hasHouses, houseInfo, nextHouse, useThemeState } from '../theme';
import { toggle as toggleCascade } from '../cascade/engine.js';
import { frame as kkFrame, houseStyle, spine as kkSpine } from '../styles/karrakin/frame.js';

// Спільний набір компонентів інтерфейсу 2a: сторінка з фоновою сіткою, шапка, панель,
// меню «⋯», вікно підтвердження (замість window.confirm), лічильник-трек, повідомлення.
// Уся візуальна частина — класи ss-* у styles/theme.css, кольори лише зі змінних теми.

// На телефоні (≤640px) під сторінкою — нижній таб-бар замість рейки; шапка сторінки
// (PageHeader / MobileHead) прилипає згори.
export function PageShell({ children, narrow = false, className = '' }) {
  const { theme, house } = useThemeState();
  const mobile = useIsMobile();
  const wrap = useRef(null);
  const spineSvg = useRef(null);
  useKkSpine(wrap, spineSvg, theme === 'karrakin-interstellar', house);
  return (
    <div className="ss-page" data-mobile={mobile ? '' : undefined}>
      <div className="ss-grid" aria-hidden="true" />
      <main ref={wrap} className={`ss-wrap${narrow ? ' narrow' : ''}${className ? ` ${className}` : ''}`}>
        {theme === 'karrakin-interstellar' && (
          <svg ref={spineSvg} className="kk-spine" aria-hidden="true">
            <path className="s" />
            <path className="dsh" />
            <path className="f" />
          </svg>
        )}
        {children}
      </main>
      {mobile && <MobileTabBar />}
    </div>
  );
}

// KARRAKIN INTERSTELLAR: рамка панелі — SVG під її розмір. Плашка заголовка й правий блок задають, де
// розриваються лінії; data-kk-link (ставить хребет сторінки) додає з'єднувач ліворуч.
function drawKkFrame(el) {
  const svg = el.querySelector(':scope > .kk-frame');
  if (!svg || !el.offsetWidth) return;
  const plate = el.querySelector(':scope > .kk-head > .kk-plate');
  const side = el.querySelector(':scope > .kk-head > .kk-side');
  const { lines } = houseStyle(document.documentElement.dataset.house);
  const f = kkFrame(
    el.offsetWidth,
    el.offsetHeight,
    plate ? plate.offsetWidth : 0,
    side ? side.offsetWidth : 0,
    { link: el.dataset.kkLink === '1', seed: el.id || plate?.textContent || '' },
    lines,
  );
  svg.querySelector('.d').setAttribute('d', f.d);
  svg.querySelector('.d2').setAttribute('d', f.d2);
  svg.querySelector('.dia').setAttribute('d', f.dia || 'M0 0');
}

function useKkFrame(ref, on, house) {
  useLayoutEffect(() => {
    if (on && ref.current) drawKkFrame(ref.current);
  });
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return undefined;
    const draw = () => drawKkFrame(el);
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    el.querySelectorAll(':scope > .kk-head > *').forEach((c) => ro.observe(c));
    document.fonts?.ready.then(draw);
    el.kkDraw = draw;
    draw();
    return () => {
      ro.disconnect();
      delete el.kkDraw;
    };
  }, [ref, on, house]);
}

// KARRAKIN INTERSTELLAR: хребет ліворуч від стовпця панелей. На ньому — панелі, що стоять біля лівого
// краю стовпця; панель у тому ж ряду правіше отримує з'єднувач (data-kk-link).
function useKkSpine(wrapRef, svgRef, on, house) {
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!on || !wrap) return undefined;
    let raf = 0;
    const mobile = window.matchMedia('(max-width: 640px)');
    const layout = () => {
      const svg = svgRef.current;
      const wr = wrap.getBoundingClientRect();
      const left = wr.left + parseFloat(getComputedStyle(wrap).paddingLeft);
      const panels = [...wrap.querySelectorAll('.kk-panel')]
        .filter((p) => !p.parentElement.closest('.ss-panel, .modal-backdrop, .ss-shop'))
        .map((p) => [p, p.getBoundingClientRect()])
        .filter(([, r]) => r.height > 0);
      const onSpine = mobile.matches ? [] : panels.filter(([, r]) => Math.abs(r.left - left) < 2).sort((a, b) => a[1].top - b[1].top);
      const tops = onSpine.map(([, r]) => r.top);
      panels.forEach(([p, r]) => {
        const link = !onSpine.some(([q]) => q === p) && tops.some((t) => Math.abs(t - r.top) < 2);
        if ((p.dataset.kkLink === '1') !== link) {
          if (link) p.dataset.kkLink = '1';
          else delete p.dataset.kkLink;
          p.kkDraw?.();
        }
      });
      if (!svg) return;
      const paths = svg.querySelectorAll('path');
      if (onSpine.length === 0) {
        paths.forEach((el) => el.setAttribute('d', 'M0 0'));
        return;
      }
      const top = tops[0];
      const bottom = Math.max(...onSpine.map(([, r]) => r.bottom));
      svg.style.left = `${left - wr.left}px`;
      svg.style.top = `${top - wr.top}px`;
      const A = kkSpine(bottom - top, tops.map((t) => +(t - top + 26).toFixed(1)), houseStyle(house).spine);
      paths[0].setAttribute('d', A.S || 'M0 0');
      paths[1].setAttribute('d', A.D || 'M0 0');
      paths[1].setAttribute('stroke-dasharray', A.da);
      paths[2].setAttribute('d', A.F || 'M0 0');
    };
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layout);
    };
    const ro = new ResizeObserver(run);
    const watch = () => {
      ro.disconnect();
      ro.observe(wrap);
      wrap.querySelectorAll('.kk-panel').forEach((p) => ro.observe(p));
    };
    const mo = new MutationObserver(() => {
      watch();
      run();
    });
    watch();
    mo.observe(wrap, { childList: true, subtree: true });
    mobile.addEventListener('change', run);
    window.addEventListener('resize', run);
    document.fonts?.ready.then(run);
    run();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      mobile.removeEventListener('change', run);
      window.removeEventListener('resize', run);
    };
  }, [wrapRef, svgRef, on, house]);
}

// Лого FERUM VOX; у темах KARRAKIN INTERSTELLAR і KARRAKIN ACADEMY замість нього прапор вибраного дому — клік перемикає
// на наступний дім. Потрійний клік по лого вмикає/вимикає ефекти каскаду поверх теми.
function HeaderMark() {
  const { theme, house } = useThemeState();
  const clicks = useRef({ n: 0, t: 0 });
  if (!hasHouses(theme)) {
    const onClick = () => {
      const now = Date.now(), c = clicks.current;
      c.n = now - c.t < 500 ? c.n + 1 : 1; c.t = now;
      if (c.n === 3) { c.n = 0; toggleCascade(); }
    };
    return (
      <button type="button" className="ss-logo" aria-label="FERUM VOX" onClick={onClick}>
        <img src="/logo-ferum-vox.webp" alt="" width="28" height="28" />
      </button>
    );
  }
  const h = houseInfo(house);
  return (
    <button type="button" className="ss-flag" title={`${h.label} — наступний дім`} aria-label={`${h.label}. Наступний дім`} onClick={nextHouse}>
      <img src={`/houses/${h.id}.png`} alt="" data-house-flag="" />
    </button>
  );
}

// Шапка мобільної версії: [прапор дому | лого] РОЗДІЛ / НАЗВА … праворуч. З back —
// кнопка «‹» і назва в рядок. children — рядок під шапкою (вкладки профілю).
// Лого FERUM VOX (у темах KARRAKIN — прапор дому) — на кожній сторінці, як і на ПК:
// потрійний тап по ньому вмикає/вимикає ефекти каскаду.
export function MobileHead({ section, title, back, right, tone, children }) {
  const navigate = useNavigate();
  return (
    <div className={`ss-mhead${children ? ' stack' : ''}${tone === 'gm' ? ' gm' : ''}`}>
      <div className="row">
        <HeaderMark />
        {back != null && (
          <button type="button" className="ss-icon" aria-label="Назад" onClick={() => (typeof back === 'function' ? back() : navigate(back))}>‹</button>
        )}
        {back != null ? (
          <h1 className="title-font h1 inline">{title}</h1>
        ) : (
          <div className="tt">
            {section && <span className="sec">{section}</span>}
            <h1 className="title-font h1">{title}</h1>
          </div>
        )}
        {right && <div className="right">{right}</div>}
      </div>
      {children}
    </div>
  );
}

// «[лого] > РОЗДІЛ / НАЗВА … нік». Навігація — ліва рейка, яка завжди на екрані.
// На телефоні — мобільна шапка, а навігація в таб-барі (PageShell).
export function PageHeader({ section, sectionTo, title, tag, right }) {
  const { user } = useAuth();
  const mobile = useIsMobile();
  if (mobile) {
    const side = tag || right ? <>{tag}{right}</> : null;
    return <MobileHead section={section} title={title} back={sectionTo} right={side} />;
  }
  return (
    <div className="ss-head">
      <HeaderMark />
      {sectionTo ? (
        <Link to={sectionTo} className="crumb"><span className="pre">&gt; </span>{section}<span className="sep"> /</span></Link>
      ) : (
        <span className="crumb"><span className="pre">&gt; </span>{section}<span className="sep"> /</span></span>
      )}
      <h1 className="h1">{title}</h1>
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
  const { theme, house } = useThemeState();
  const ref = useRef(null);
  const kk = theme === 'karrakin-interstellar';
  useKkFrame(ref, kk, house);
  if (kk) {
    return (
      <div id={id} ref={ref} className={`ss-panel kk-panel${tone ? ` ${tone}` : ''} ${className}`} style={style}>
        <svg className="kk-frame" aria-hidden="true">
          <path className="d2" />
          <path className="d" />
          <path className="dia" />
        </svg>
        {title != null && (
          <div className="kk-head">
            <div className="kk-plate">
              <i />
              <span className="title" title={typeof title === 'string' ? title : undefined}>{title}</span>
            </div>
            {(sub != null || right) && (
              <div className="kk-side">
                {sub != null && <span className="sub" title={typeof sub === 'string' ? sub : undefined}>{sub}</span>}
                {right}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    );
  }
  return (
    <div id={id} className={`ss-panel${tone === 'gm' ? ' gm' : ''} ${className}`} style={style}>
      {title != null && (
        <div className={`ss-bar${tone ? ` ${tone}` : ''}`}>
          <div className="dot" />
          <span className="title" title={typeof title === 'string' ? title : undefined}>{title}</span>
          {sub != null && <span className="sub" title={typeof sub === 'string' ? sub : undefined}>{sub}</span>}
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
  const text = typeof children === 'string' && children.startsWith(prefix)
    ? <><span className="pre">{prefix} </span>{children.slice(prefix.length).trimStart()}</>
    : <><span className="pre">{prefix} </span>{children}</>;
  return <div className={cls} style={style}>{text}</div>;
}

// Кнопка «⋯» з випадним меню. items: [{label, onClick, danger, disabled}] | {header} | {node}.
export function Menu({ items, icon = '⋯', small = false, width, title = 'Дії', children }) {
  const [open, setOpen] = useState(false);
  // Меню вирівняне по правому краю кнопки; якщо так воно виходить за край екрана
  // (кнопка біля лівого краю телефона), зсуваємо його рівно настільки, щоб вмістилось.
  // Знизу не вміщується (на телефоні — над таб-баром і стрічкою магазину), а згори є
  // місце — розкриваємо вгору.
  const [shift, setShift] = useState(0);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  useLayoutEffect(() => {
    if (!open || !menuRef.current) {
      setUp(false);
      return setShift(0);
    }
    const r = menuRef.current.getBoundingClientRect();
    if (!up) {
      const bottomEdge = window.innerHeight - (document.querySelector('.ss-mnav') ? 110 : 8);
      const btn = ref.current.getBoundingClientRect();
      if (r.bottom > bottomEdge && btn.top - r.height - 6 > 8) setUp(true);
    }
    const left = r.left - shift;
    const right = r.right - shift;
    const vw = document.documentElement.clientWidth;
    const next = left < 8 ? 8 - left : right > vw - 8 ? Math.max(8 - left, vw - 8 - right) : 0;
    if (Math.abs(next - shift) > 0.5) setShift(next);
  }, [open, shift, up]);
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
        <div
          ref={menuRef}
          className="ss-menu"
          style={{ ...(width ? { minWidth: width } : null), ...(shift ? { transform: `translateX(${shift}px)` } : null), ...(up ? { top: 'auto', bottom: 'calc(100% + 6px)' } : null) }}
          onClick={(e) => e.stopPropagation()}
        >
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
export function ConfirmDialog({ title, question, lines = [], note, tone, yesLabel = 'ТАК', noLabel = 'НІ', altLabel, canYes = true, canAlt = true, onYes, onNo, onAlt, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onNo?.();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onNo]);
  const { theme } = useThemeState();
  const yesCls = tone === 'danger' ? 'btn-danger' : tone === 'gm' ? 'btn-gm' : 'btn';
  const body = (
        <div className="modal-body">
          {question && <div style={{ fontSize: 14, color: 'var(--text-bright)', lineHeight: 1.5 }}>{question}</div>}
          {lines.length > 0 && (
            <div className="modal-lines">
              {lines.filter((l) => l != null && l !== false).map((l, i) =>
                typeof l === 'string' ? (
                  <div key={i}><span className="pre">&gt; </span>{l}</div>
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
            {altLabel && <button type="button" className="btn-ghost" disabled={!canAlt} onClick={() => canAlt && onAlt?.()}>{altLabel}</button>}
            <button type="button" className={yesCls} disabled={!canYes} onClick={() => canYes && onYes?.()} autoFocus>
              {yesLabel}
            </button>
          </div>
        </div>
  );
  return (
    <div className="modal-backdrop" onClick={onNo}>
      {theme === 'karrakin-interstellar' ? (
        <div className="kk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <Panel title={title} tone={tone}>{body}</Panel>
        </div>
      ) : (
        <div className={`modal-box${tone ? ` ${tone}` : ''}`} style={{ width: 430 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="modal-header">{title}</div>
          {body}
        </div>
      )}
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
    <div className={`ss-track${size ? ` ${size}` : ''}${green ? ' green' : ''}${max > 6 ? ' long' : ''}`} aria-label={label}>
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
      {saving ? (
        <span className="lbl">SYNC…</span>
      ) : (
        <>
          <span className="lbl">SYNC</span> <span className="sq">■</span> <span className="time">{at || '—'}</span>
        </>
      )}
    </span>
  );
}
