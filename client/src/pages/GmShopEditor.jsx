import { useState } from 'react';
import { api } from '../api';
import { Menu, Msg, Panel } from '../components/kit.jsx';
import { SHOP_KINDS, catalogItems, itemTitle, loadShopCatalog, shopSettings, upgradeByKey, upgradeGroups, useShopCatalog } from '../pilot/shopCatalog';

// ГМ-панель, розділ «МАГАЗИН»: вкладки магазину (PRINTER / SHOP / INSURANCE) і особисті
// покращення. Ціни, тексти й параметри, нові позиції, порядок, приховування. Після кожного
// збереження каталог перечитується — його бачать редюсер і всі відкриті екрани.

const TABS = [...SHOP_KINDS, { key: 'upgrade', title: 'ОСОБИСТІ ПОКРАЩЕННЯ', currency: ['mana', 'pr'] }];

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>{label}</span>
      {children}
    </label>
  );
}

const isCount = (v) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0;
const priceText = (it) =>
  it.key === 'refill'
    ? Object.values(it.tiers || {}).join(' / ') + ' PR'
    : [it.mana ? `${it.mana} М` : '', it.pr ? `${it.pr} PR` : ''].filter(Boolean).join(' + ') || '0';

// Список рядків тексту («ЕФЕКТ», «УТОЧНЕННЯ»): кожен рядок — окреме поле.
function LinesField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {value.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <textarea className="ss-input" rows={2} value={t} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} style={{ flex: 1, resize: 'vertical' }} />
            <button type="button" className="btn-ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...value, ''])}>+ РЯДОК</button>
      </div>
    </Field>
  );
}

// item — null для нової позиції вкладки kind.
function ShopItemEditor({ item, kind, onClose }) {
  const groups = upgradeGroups();
  const [f, setF] = useState(() => {
    const it = item || {};
    return {
      title: it.title || '',
      pr: String(it.pr ?? 0),
      mana: String(it.mana ?? 0),
      desc: it.desc || '',
      upTitle: it.upgraded?.title || '',
      upDesc: it.upgraded?.desc || '',
      group: it.group || groups[0] || '',
      quote: it.quote || '',
      effect: it.effect ? [...it.effect] : [''],
      notes: it.notes ? [...it.notes] : [],
      requires: it.requires || '',
      cap: String(it.cap ?? ''),
      size: String(it.size ?? ''),
      tiers: { 1: String(it.tiers?.[1] ?? ''), 2: String(it.tiers?.[2] ?? ''), 3: String(it.tiers?.[3] ?? '') },
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const key = item?.key || null;
  const tab = TABS.find((t) => t.key === kind);
  const withPr = tab.currency.includes('pr') && key !== 'refill';
  const withMana = tab.currency.includes('mana');
  const others = catalogItems('upgrade').filter((u) => u.key !== key);
  const insure2 = upgradeByKey('insure2');

  async function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return setError('Вкажіть назву.');
    if ((withPr && !isCount(f.pr)) || (withMana && !isCount(f.mana))) return setError('Ціна — ціле число від 0.');
    let params = {};
    if (kind === 'insurance') {
      params = { desc: f.desc.trim() };
      if (item?.upgraded) params.upgraded = { title: f.upTitle.trim(), desc: f.upDesc.trim() };
    }
    if (kind === 'upgrade') {
      params = {
        quote: f.quote.trim(),
        effect: f.effect.map((t) => t.trim()).filter(Boolean),
        notes: f.notes.map((t) => t.trim()).filter(Boolean),
        ...(f.requires ? { requires: f.requires } : {}),
      };
      if (key === 'buffer') {
        if (!isCount(f.cap) || Number(f.cap) < 1) return setError('Кап PR — ціле число від 1.');
        params.cap = Number(f.cap);
      }
    }
    if (key === 'refill') {
      if (![1, 2, 3].every((n) => isCount(f.tiers[n]))) return setError('Ціна поповнення зарядів — ціле число від 0.');
      params = { tiers: { 1: Number(f.tiers[1]), 2: Number(f.tiers[2]), 3: Number(f.tiers[3]) } };
    }
    if (key === 'prpack') {
      if (!isCount(f.size) || Number(f.size) < 1) return setError('Розмір пачки PR — ціле число від 1.');
      params = { size: Number(f.size) };
    }
    setBusy(true);
    setError('');
    try {
      await api.gmSaveShopItem({
        key,
        kind,
        group: kind === 'upgrade' ? f.group : '',
        title: f.title,
        pr: withPr ? Number(f.pr) : 0,
        mana: withMana ? Number(f.mana) : 0,
        params,
      });
      await loadShopCatalog(true);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-box gm" style={{ width: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-header">{tab.title}</div>
        <div className="modal-body" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {kind === 'upgrade' && (
            <Field label="ГРУПА">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {groups.map((g) => (
                  <button key={g} type="button" className={`ss-chip${f.group === g ? ' on' : ''}`} onClick={() => setF((cur) => ({ ...cur, group: g }))}>
                    {g}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="НАЗВА" style={{ flex: 1, minWidth: 220 }}>
              <input className="ss-input" type="text" value={f.title} onChange={set('title')} autoFocus />
            </Field>
            {withMana && (
              <Field label="ЦІНА, М">
                <input className="ss-input" type="number" min={0} step={1} value={f.mana} onChange={set('mana')} style={{ width: 90 }} />
              </Field>
            )}
            {withPr && (
              <Field label="ЦІНА, PR">
                <input className="ss-input" type="number" min={0} step={1} value={f.pr} onChange={set('pr')} style={{ width: 90 }} />
              </Field>
            )}
            {key === 'prpack' && (
              <Field label="РОЗМІР ПАЧКИ, PR">
                <input className="ss-input" type="number" min={1} step={1} value={f.size} onChange={set('size')} style={{ width: 90 }} />
              </Field>
            )}
            {key === 'buffer' && (
              <Field label="КАП PR">
                <input className="ss-input" type="number" min={1} step={1} value={f.cap} onChange={set('cap')} style={{ width: 90 }} />
              </Field>
            )}
          </div>
          {key === 'refill' && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                [1, '1 ЗАРЯД, PR'],
                [2, '2 ЗАРЯДИ, PR'],
                [3, '3+ ЗАРЯДИ, PR'],
              ].map(([n, label]) => (
                <Field key={n} label={label}>
                  <input
                    className="ss-input"
                    type="number"
                    min={0}
                    step={1}
                    value={f.tiers[n]}
                    onChange={(e) => setF((cur) => ({ ...cur, tiers: { ...cur.tiers, [n]: e.target.value } }))}
                    style={{ width: 90 }}
                  />
                </Field>
              ))}
            </div>
          )}
          {kind === 'insurance' && (
            <Field label="ОПИС">
              <textarea className="ss-input" rows={2} value={f.desc} onChange={set('desc')} style={{ resize: 'vertical' }} />
            </Field>
          )}
          {item?.upgraded && (
            <>
              <Field label={`НАЗВА · ${(insure2?.title || '').toUpperCase()}`}>
                <input className="ss-input" type="text" value={f.upTitle} onChange={set('upTitle')} />
              </Field>
              <Field label={`ОПИС · ${(insure2?.title || '').toUpperCase()}`}>
                <textarea className="ss-input" rows={2} value={f.upDesc} onChange={set('upDesc')} style={{ resize: 'vertical' }} />
              </Field>
            </>
          )}
          {kind === 'upgrade' && (
            <>
              <Field label="ЦИТАТА">
                <textarea className="ss-input" rows={4} value={f.quote} onChange={set('quote')} style={{ resize: 'vertical' }} />
              </Field>
              <LinesField label="ЕФЕКТ" value={f.effect} onChange={(effect) => setF((cur) => ({ ...cur, effect }))} />
              <LinesField label="УТОЧНЕННЯ" value={f.notes} onChange={(notes) => setF((cur) => ({ ...cur, notes }))} />
              <Field label="ПОТРІБНЕ ПОКРАЩЕННЯ">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className={`ss-chip sm${!f.requires ? ' on' : ''}`} onClick={() => setF((cur) => ({ ...cur, requires: '' }))}>—</button>
                  {others.map((u) => (
                    <button key={u.key} type="button" className={`ss-chip sm${f.requires === u.key ? ' on' : ''}`} onClick={() => setF((cur) => ({ ...cur, requires: u.key }))}>
                      {u.title}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}
          {error && <Msg kind="err">{error}</Msg>}
          <div className="modal-actions">
            <button className="btn-ghost" type="button" onClick={onClose} disabled={busy}>СКАСУВАТИ</button>
            <button className="btn-gm" type="submit" disabled={busy}>{busy ? 'ЗБЕРЕЖЕННЯ…' : 'ЗБЕРЕГТИ'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Стартові PR нового пілота й базовий кап PR.
function PrSettings() {
  const s = shopSettings();
  const [f, setF] = useState({ prStart: String(s.prStart), prCapBase: String(s.prCapBase) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!isCount(f.prStart)) return setError('Стартові PR — ціле число від 0.');
    if (!isCount(f.prCapBase) || Number(f.prCapBase) < 1) return setError('Кап PR — ціле число від 1.');
    setBusy(true);
    setError('');
    try {
      await api.gmSaveShopSettings({ prStart: Number(f.prStart), prCapBase: Number(f.prCapBase) });
      await loadShopCatalog(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel tone="gm" title="PRINTER REQUISITION">
      <form onSubmit={save} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 14px' }}>
        <Field label="СТАРТОВІ PR">
          <input className="ss-input" type="number" min={0} step={1} value={f.prStart} onChange={set('prStart')} style={{ width: 90 }} />
        </Field>
        <Field label="КАП PR">
          <input className="ss-input" type="number" min={1} step={1} value={f.prCapBase} onChange={set('prCapBase')} style={{ width: 90 }} />
        </Field>
        <button className="btn-gm" type="submit" disabled={busy}>{busy ? 'ЗБЕРЕЖЕННЯ…' : 'ЗБЕРЕГТИ'}</button>
        {error && <Msg kind="err">{error}</Msg>}
      </form>
    </Panel>
  );
}

export default function GmShopSection() {
  const { loaded, error: loadError } = useShopCatalog();
  const [kind, setKind] = useState('printer');
  const [editing, setEditing] = useState(undefined); // undefined — закрито, null — нова позиція, обʼєкт — правка
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const list = catalogItems(kind);
  const tab = TABS.find((t) => t.key === kind);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await loadShopCatalog(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const move = (i, d) => {
    const keys = list.map((it) => it.key);
    [keys[i], keys[i + d]] = [keys[i + d], keys[i]];
    return run(() => api.gmReorderShopItems(kind, keys));
  };

  return (
    <>
      <div className="ss-seg sm" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={kind === t.key ? 'on' : ''}
            onClick={() => {
              setKind(t.key);
              setError('');
            }}
          >
            {t.title} · {catalogItems(t.key).length}
          </button>
        ))}
      </div>

      {loadError && <Msg kind="err">Каталог не завантажився: {loadError}</Msg>}
      {error && <Msg kind="err">{error}</Msg>}
      {!loaded && !loadError && <div className="ss-note"><span className="pre">&gt; </span>Завантаження каталогу…</div>}

      {loaded && kind === 'printer' && <PrSettings />}

      {loaded && (
        <Panel
          tone="gm"
          title={tab.title}
          sub={`${list.length}`}
          right={
            <button className="btn-gm sm" type="button" onClick={() => setEditing(null)}>
              {kind === 'upgrade' ? '+ ДОДАТИ ПОКРАЩЕННЯ' : '+ ДОДАТИ ПОЗИЦІЮ'}
            </button>
          }
        >
          {list.map((it, i) => (
            <div
              key={it.key}
              style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 14px', borderTop: i ? '1px solid var(--panel-border)' : 'none', opacity: it.archived ? 0.6 : 1 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 200px', minWidth: 0 }}>
                <span style={{ fontSize: 13, color: 'var(--text-bright)' }}>{kind === 'shop' ? itemTitle(it) : it.title}</span>
                <span style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-dimmer)' }}>
                  {[kind === 'upgrade' ? it.group : '', it.archived ? 'ПРИХОВАНО' : ''].filter(Boolean).join(' · ')}
                </span>
              </div>
              <span className="num" style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>{priceText(it)}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="btn-ghost sm" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn-ghost sm" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                <Menu
                  small
                  items={[
                    { label: 'РЕДАГУВАТИ…', onClick: () => setEditing(it) },
                    it.archived
                      ? { label: 'ПОВЕРНУТИ В КАТАЛОГ', onClick: () => run(() => api.gmSetShopItemArchived(it.key, false)) }
                      : { label: 'ПРИХОВАТИ', danger: true, onClick: () => run(() => api.gmSetShopItemArchived(it.key, true)) },
                  ]}
                />
              </div>
            </div>
          ))}
        </Panel>
      )}

      {editing !== undefined && <ShopItemEditor item={editing} kind={kind} onClose={() => setEditing(undefined)} />}
    </>
  );
}

