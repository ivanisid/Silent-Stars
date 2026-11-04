import { Suspense, lazy, useMemo, useState } from 'react';
import { MobileHead, PageShell } from '../components/kit.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import { useIsMobile } from '../useMobile.js';
import { useThemeState } from '../theme';
import { SECTOR, TYPE_LABEL, childrenOf, findObject, flatObjects } from '../starmap/data.js';
import { bodyTexture } from '../starmap/textures.js';
import '../styles/starmap.css';

// Зоряна мапа. Десктоп: 3D-мапа на весь екран, навігація рівнями (СЕКТОР / СИСТЕМА / об'єкт)
// плашкою зліва вгорі, деталі — панеллю-оверлеєм праворуч, яка закривається й відкривається.
// Телефон: меню-список тих самих рівнів; повна 3D-мапа відкривається кнопкою на весь екран,
// «МЕНЮ» повертає назад. Сцена (three.js) вантажиться окремим чанком лише тут.

const StarMapScene = lazy(() => import('../starmap/Scene.jsx'));

function StationIcon({ size = 22, stroke = 1.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17" />
      <rect x="9.5" y="9.5" width="5" height="5" className="core" />
    </svg>
  );
}

function FieldIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="sm-field-ic">
      <circle cx="5" cy="14" r="1.6" />
      <circle cx="10" cy="9" r="2.2" />
      <circle cx="15" cy="15" r="1.4" />
      <circle cx="19" cy="8" r="1.8" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

// Сфера з тією ж процедурною текстурою, що й у 3D: CSS-фон, що прокручується, + тінь.
function Orb({ o, size, spin = false }) {
  const tex = useMemo(() => bodyTexture(o), [o]);
  return (
    <span
      className={`sm-orb${o.kind === 'star' ? ' star' : ''}${spin ? ' spin' : ''}`}
      style={{ '--d': `${size}px`, '--pc': `var(${o.color})`, backgroundImage: `url(${tex.url})` }}
    />
  );
}

function ObjIcon({ o, size = 22 }) {
  if (o.kind === 'station') return <span className="sm-stn"><StationIcon size={size} /></span>;
  if (o.kind === 'field') return <FieldIcon size={size} />;
  return <Orb o={o} size={size} />;
}

const FIELD_ROCKS = (() => {
  let s = 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 80 }, () => ({
    left: `${(rnd() * 96).toFixed(1)}%`,
    top: `${(50 + (rnd() + rnd() - 1) * 40).toFixed(1)}%`,
    d: (rnd() * 6 + 1.5).toFixed(1),
    op: (rnd() * 0.6 + 0.4).toFixed(2),
  }));
})();

function Hero({ o, system }) {
  if (!o) {
    return (
      <div className="sm-hero">
        {system.stars.map((s) => <Orb key={s.id} o={s} size={64} spin />)}
      </div>
    );
  }
  return (
    <div className="sm-hero">
      {o.kind === 'station' && <span className="sm-stn big"><StationIcon size={110} stroke={0.8} /></span>}
      {o.kind === 'field' && (
        <span className="sm-rocks">
          {FIELD_ROCKS.map((r, i) => (
            <i key={i} style={{ left: r.left, top: r.top, width: `${r.d}px`, height: `${r.d}px`, opacity: r.op }} />
          ))}
        </span>
      )}
      {o.kind !== 'station' && o.kind !== 'field' && <Orb o={o} size={o.kind === 'star' ? 110 : 140} spin />}
    </div>
  );
}

function Chip({ o, indent, onClick, chevron }) {
  return (
    <button type="button" className={`sm-chip${indent ? ' in' : ''}`} onClick={onClick}>
      <span className="ci">{o.kind ? <ObjIcon o={o} /> : <span className="sm-pair"><i /><i /></span>}</span>
      <span className="nm">{o.name}</span>
      {o.kind && <span className="ty">{TYPE_LABEL[o.kind]}</span>}
      {chevron && <span className="chev" aria-hidden="true">›</span>}
    </button>
  );
}

// Вміст деталей — спільний для панелі десктопа і меню телефона.
function Details({ view, system, selObj, onPick, onOpenSystem, onShowMap }) {
  if (view === 'sector') {
    return (
      <div className="sm-sec">
        <div className="cap">СИСТЕМИ</div>
        {SECTOR.systems.map((s) => (
          <Chip key={s.id} o={{ name: s.name }} onClick={() => onOpenSystem(s.id)} chevron />
        ))}
      </div>
    );
  }
  const parent = selObj?.parent ? findObject(system, selObj.parent) : null;
  const list = selObj ? childrenOf(system, selObj.id) : flatObjects(system);
  return (
    <>
      <Hero o={selObj} system={system} />
      {onShowMap && (
        <button type="button" className="sm-cta" onClick={onShowMap}>
          {selObj ? 'ПОКАЗАТИ НА МАПІ' : 'ВІДКРИТИ МАПУ'}
        </button>
      )}
      <div className="sm-sec">
        <div className="cap">ОПИС</div>
        <p className="sm-desc">{selObj ? selObj.desc : system.desc}</p>
      </div>
      {parent && (
        <div className="sm-sec">
          <div className="cap">ОРБІТА</div>
          <Chip o={parent} onClick={() => onPick(parent.id)} />
        </div>
      )}
      {list.length > 0 && (
        <div className="sm-sec">
          <div className="cap">{selObj ? 'СУПУТНИКИ' : "ОБ'ЄКТИ"}</div>
          {list.map((o) => (
            <Chip key={o.id} o={o} indent={!selObj && !!o.parent} onClick={() => onPick(o.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function SceneSlot(props) {
  return (
    <Suspense fallback={null}>
      <StarMapScene key={props.view} {...props} />
    </Suspense>
  );
}

function useMapState() {
  const [view, setView] = useState('system');
  const [sysId, setSysId] = useState(SECTOR.systems[0].id);
  const [sel, setSel] = useState(null);
  const system = SECTOR.systems.find((s) => s.id === sysId) || SECTOR.systems[0];
  const selObj = sel ? findObject(system, sel) : null;
  return {
    view, system, sel, selObj,
    openSystem: (id) => { setSysId(id); setView('system'); setSel(null); },
    toSector: () => { setView('sector'); setSel(null); },
    toSystem: () => { setView('system'); setSel(null); },
    pick: (id) => { setView('system'); setSel(id); },
    toggle: (id) => setSel((cur) => (cur === id ? null : id)),
    setSel,
  };
}

// Плашка рівня: на якому шарі зараз камера (СЕКТОР / СИСТЕМА / тип об'єкта) і що у фокусі.
function Layers({ m }) {
  const parent = m.selObj?.parent ? findObject(m.system, m.selObj.parent) : null;
  const inSystem = m.view === 'system';
  const lv = (state) => `lv${state ? ` ${state}` : ''}`;
  const focus = !inSystem ? '[СЕКТОР]' : m.selObj ? m.selObj.name : m.system.name;
  return (
    <header className="sm-head">
      <h1>ЗОРЯНА МАПА</h1>
      <nav className="sm-layers" aria-label="Рівень мапи">
        <button type="button" className={lv(inSystem ? 'done' : 'cur')} aria-current={inSystem ? undefined : 'step'} onClick={m.toSector}>
          <i /><span>СЕКТОР</span>
        </button>
        <button type="button" className={lv(!inSystem ? '' : m.selObj ? 'done' : 'cur')} aria-current={inSystem && !m.selObj ? 'step' : undefined} onClick={inSystem ? m.toSystem : undefined} disabled={!inSystem}>
          <i /><span>СИСТЕМА</span>
        </button>
        <span className={lv(m.selObj ? 'cur' : '')} aria-current={m.selObj ? 'step' : undefined}>
          <i /><span>{m.selObj ? (m.selObj.kind === 'field' ? 'ПОЛЕ' : TYPE_LABEL[m.selObj.kind]) : "ОБ'ЄКТ"}</span>
        </span>
      </nav>
      <div className="sm-focus">
        {parent && <button type="button" className="par" onClick={() => m.pick(parent.id)}>{parent.name}</button>}
        <span className="nm">{focus}</span>
      </div>
    </header>
  );
}

function DesktopMap({ themeKey }) {
  const m = useMapState();
  const [panel, setPanel] = useState(true);
  const select = (id) => { m.toggle(id); setPanel(true); };
  const pick = (id) => { m.pick(id); setPanel(true); };
  const title = m.view === 'sector' ? 'СЕКТОР' : m.selObj ? m.selObj.name : m.system.name;
  return (
    <div className="sm-page">
      <NavDrawer />
      <div className="sm-stage">
        <SceneSlot
          view={m.view}
          sector={SECTOR}
          system={m.system}
          sel={m.sel}
          onSelect={select}
          onOpenSystem={m.openSystem}
          themeKey={themeKey}
        />
        <Layers m={m} />
        {panel ? (
          <aside className="sm-panel" aria-label="Деталі">
            <div className="sm-panel-head">
              <h2>{title}</h2>
              {m.selObj && <span className="ty">{TYPE_LABEL[m.selObj.kind]}</span>}
              <button type="button" className="sm-ib ghost" aria-label="Закрити панель" onClick={() => setPanel(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="sm-panel-body">
              <Details view={m.view} system={m.system} selObj={m.selObj} onPick={pick} onOpenSystem={m.openSystem} />
            </div>
          </aside>
        ) : (
          <button type="button" className="sm-ib sm-open" aria-label="Відкрити панель" onClick={() => setPanel(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true"><path d="M3 4h18v16H3zM15 4v16M8 9l-3 3 3 3" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function MobileMap({ themeKey }) {
  const m = useMapState();
  const [full, setFull] = useState(false);
  const [mapSel, setMapSel] = useState(null);
  const mapObj = mapSel ? findObject(m.system, mapSel) : null;
  const back = m.selObj
    ? () => (m.selObj.parent ? m.pick(m.selObj.parent) : m.toSystem())
    : m.view === 'system'
      ? m.toSector
      : undefined;
  const title = m.view === 'sector' ? 'ЗОРЯНА МАПА' : m.selObj ? m.selObj.name : m.system.name;
  const openMap = () => { setMapSel(m.sel); setFull(true); };
  return (
    <PageShell className="sm-m">
      <MobileHead
        section={back ? undefined : 'ЗОРЯНА МАПА'}
        title={back ? title : 'СЕКТОР'}
        back={back}
        right={m.selObj ? <span className="sm-mty">{TYPE_LABEL[m.selObj.kind]}</span> : null}
      />
      <div className="sm-m-body">
        <Details view={m.view} system={m.system} selObj={m.selObj} onPick={m.pick} onOpenSystem={m.openSystem} onShowMap={openMap} />
      </div>
      {full && (
        <div className="sm-full">
          <SceneSlot
            view="system"
            sector={SECTOR}
            system={m.system}
            sel={mapSel}
            onSelect={(id) => setMapSel((cur) => (cur === id ? null : id))}
            onOpenSystem={m.openSystem}
            paused={!!mapSel}
            compact
            themeKey={themeKey}
          />
          <button type="button" className="sm-menu" onClick={() => setFull(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            МЕНЮ
          </button>
          {mapObj && (
            <div className="sm-sheet">
              <div className="row">
                <span className="nm">{mapObj.name}</span>
                <span className="ty">{TYPE_LABEL[mapObj.kind]}</span>
              </div>
              <button type="button" className="sm-cta" onClick={() => { m.pick(mapObj.id); setFull(false); }}>ДЕТАЛІ</button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

export default function StarMapPage() {
  const mobile = useIsMobile();
  const { theme, house } = useThemeState();
  const themeKey = `${theme}|${house || ''}`;
  return mobile ? <MobileMap themeKey={themeKey} /> : <DesktopMap themeKey={themeKey} />;
}
