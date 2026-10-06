import { useMemo, useState } from 'react';
import { RESERVES, RESERVE_CATEGORIES } from '../pilot/reserves';
import { RARE_RANKS, VAULT_CAP_BASE, useRareCatalog, loadRareCatalog } from '../pilot/rareReserves';
import { Menu, Msg, PageHeader, PageShell } from '../components/kit.jsx';
import ReserveIcon, { ReserveGlyph, hasReserveIcon } from '../pilot/components/ReserveIcon.jsx';
import { TagFilter, TagPills, matchTags } from '../pilot/components/ReserveTags.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { RareReserveEditor, TagManager } from './RareReserveEditor.jsx';

// Довідник резервів — тільки перегляд, нічого не купується. Дві категорії:
//
//   ЗВИЧАЙНІ — ті, що є в магазині за PR і знаходяться за даунтайм (Get Creative).
//   РІДКІСНІ — не знаходяться за даунтайм; ціну в PR задає ГМ. Отримані лягають на
//              склад у чарнику. Їхній каталог живе в базі:
//              ГМ тут же редагує, додає й приховує резерви та керує тегами (фракціями).
//
// Купівля звичайних лишилась у магазині: тут саме довідник, щоб не було двох місць,
// де витрачають PR.

const KIND_COMMON = 'common';
const KIND_RARE = 'rare';

export default function ReservesPage() {
  const [kind, setKind] = useState(KIND_COMMON);
  const [q, setQ] = useState('');
  const { reserves: rare } = useRareCatalog();
  const rareCount = rare.filter((r) => !r.archived).length;

  return (
    <PageShell>
      <PageHeader section="ДОВІДНИК" title="РЕЗЕРВИ" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="ss-seg">
          <button type="button" className={kind === KIND_COMMON ? 'on' : ''} style={{ height: 28, padding: '0 16px' }} onClick={() => { setKind(KIND_COMMON); setQ(''); }}>
            ЗВИЧАЙНІ · {RESERVES.length}
          </button>
          <button type="button" className={kind === KIND_RARE ? 'on' : ''} style={{ height: 28, padding: '0 16px' }} onClick={() => { setKind(KIND_RARE); setQ(''); }}>
            РІДКІСНІ · {rareCount}
          </button>
        </div>
        <input className="ss-input" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ пошук за назвою або ефектом" style={{ flex: 1, minWidth: 220, height: 30, fontSize: 12 }} />
      </div>

      {kind === KIND_COMMON ? <CommonList q={q} /> : <RareList q={q} />}
    </PageShell>
  );
}

function Note({ children }) {
  return <div style={{ fontSize: 12, color: 'var(--text-grey)', lineHeight: 1.7, textWrap: 'pretty', maxWidth: 760 }}>{children}</div>;
}

// Панель-список: лічильник позицій угорі, рядки «іконка | назва, мета, опис | ціна».
function ListPanel({ shown, total, children }) {
  return (
    <div className="ss-panel">
      <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--panel-border)', fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>
        {shown === total ? `${total} ПОЗИЦІЙ` : `${shown} З ${total}`}
      </div>
      {shown === 0 && <div style={{ padding: '18px 14px', fontSize: 12, color: 'var(--text-dimmer)' }}>&gt; Нічого не знайдено.</div>}
      {children}
    </div>
  );
}

function Row({ i, icon, name, meta, desc, flavor, price, extra, dim }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 14, alignItems: 'start', padding: '12px 14px', borderTop: i ? '1px solid var(--panel-border)' : 'none', opacity: dim ? 0.55 : 1 }}>
      {icon}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--text-bright)' }}>{name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>{meta}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6, textWrap: 'pretty' }}>{desc}</div>
        {flavor && <div style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.6, fontStyle: 'italic' }}>&gt; {flavor}</div>}
        {extra}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-info)', letterSpacing: 1, whiteSpace: 'nowrap' }}>{price}</div>
    </div>
  );
}

// ---------- Звичайні ----------

function CommonList({ q }) {
  const [rank, setRank] = useState(0); // 0 — усі ранги
  const [category, setCategory] = useState('all');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return RESERVES.filter(
      (r) =>
        (rank === 0 || r.rank === rank) &&
        (category === 'all' || r.category === category) &&
        (needle === '' || r.name.toLowerCase().includes(needle) || r.desc.toLowerCase().includes(needle)),
    );
  }, [q, rank, category]);

  const cats = RESERVE_CATEGORIES.filter((c) => RESERVES.some((r) => (rank === 0 || r.rank === rank) && r.category === c.key));

  return (
    <>
      <Note>
        Купуються в магазині й здобуваються за даунтайм-дію Get Creative. Тут лише
        довідник — витрата PR лишилась у магазині.
      </Note>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip active={rank === 0} onClick={() => { setRank(0); setCategory('all'); }}>УСІ РАНГИ</Chip>
        {[1, 2, 3].map((rk) => (
          <Chip key={rk} active={rank === rk} onClick={() => { setRank(rk); setCategory('all'); }}>
            РАНГ {rk}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: -8 }}>
        <Chip small active={category === 'all'} onClick={() => setCategory('all')}>УСІ</Chip>
        {cats.map((c) => (
          <Chip key={c.key} small active={category === c.key} onClick={() => setCategory(c.key)}>
            {hasReserveIcon(c.key) ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ReserveGlyph kind={c.key} size={14} />
                {c.label}
              </span>
            ) : c.label}
          </Chip>
        ))}
      </div>

      <ListPanel shown={list.length} total={RESERVES.length}>
        {list.map((r, i) => {
          const cat = RESERVE_CATEGORIES.find((c) => c.key === r.category)?.label || r.category;
          return (
            <Row
              key={r.key}
              i={i}
              icon={<ReserveIcon kind={r.category} title={cat} />}
              name={r.name}
              meta={`РАНГ ${r.rank} · ${cat}`}
              desc={r.desc}
            />
          );
        })}
      </ListPanel>
    </>
  );
}

// ---------- Рідкісні ----------

function RareList({ q }) {
  const { isGm } = useAuth();
  const { reserves, tags, loaded, error } = useRareCatalog();
  const [rank, setRank] = useState(0);
  const [tagSel, setTagSel] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState(undefined); // undefined — закрито, null — новий, обʼєкт — правка
  const [tagsOpen, setTagsOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  // Приховані бачить лише ГМ і лише коли попросив.
  const pool = useMemo(() => reserves.filter((r) => !r.archived || (isGm && showHidden)), [reserves, isGm, showHidden]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool.filter(
      (r) =>
        (rank === 0 || r.rank === rank) &&
        matchTags(r, tagSel) &&
        (needle === '' ||
          r.name.toLowerCase().includes(needle) ||
          r.desc.toLowerCase().includes(needle) ||
          r.traits.toLowerCase().includes(needle) ||
          r.action.toLowerCase().includes(needle)),
    );
  }, [q, rank, tagSel, pool]);

  async function setArchived(r, archived) {
    setActionError('');
    try {
      await api.gmSetRareReserveArchived(r.key, archived);
      await loadRareCatalog(true);
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <>
      <Note>
        Не знаходяться за даунтайм. Ціну в PR задає ГМ для кожного резерву. Отриманий
        резерв записують на склад у чарнику: він вміщує {VAULT_CAP_BASE}{' '}
        і нічого не витрачає, доки резерв лежить. Згорає лише те, що взяли на місію.
        Теги фракцій допомагають перед грою відібрати резерви, доступні від замовника.
      </Note>

      {isGm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-gm sm" type="button" onClick={() => setEditing(null)}>+ НОВИЙ РЕЗЕРВ</button>
          <button className="btn-gm sm" type="button" onClick={() => setTagsOpen(true)}>ТЕГИ · {tags.length}</button>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            ПОКАЗАТИ ПРИХОВАНІ · {reserves.filter((r) => r.archived).length}
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip active={rank === 0} onClick={() => setRank(0)}>УСІ РАНГИ</Chip>
        {RARE_RANKS.map((rk) => (
          <Chip key={rk} active={rank === rk} onClick={() => setRank(rk)}>
            РАНГ {rk} · {pool.filter((r) => r.rank === rk).length}
          </Chip>
        ))}
      </div>

      <TagFilter small tags={tags} selected={tagSel} onChange={setTagSel} />

      {error && <Msg kind="err">Каталог не завантажився: {error}</Msg>}
      {actionError && <Msg kind="err">{actionError}</Msg>}

      {!loaded && !error ? (
        <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>&gt; Завантаження каталогу…</div>
      ) : (
        <ListPanel shown={list.length} total={pool.length}>
          {list.map((r, i) => (
            <Row
              key={r.key}
              i={i}
              dim={r.archived}
              icon={<ReserveIcon kind="rare" title="Рідкісний резерв" />}
              name={r.name}
              meta={[`РАНГ ${r.rank}`, r.action, r.traits, r.archived && 'ПРИХОВАНО'].filter(Boolean).join(' · ')}
              desc={r.desc}
              flavor={r.flavor}
              extra={<TagPills tagIds={r.tagIds} tags={tags} />}
              price={
                isGm ? (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    {r.pricePr} PR
                    <Menu
                      small
                      items={[
                        { label: 'РЕДАГУВАТИ…', onClick: () => setEditing(r) },
                        r.archived
                          ? { label: 'ПОВЕРНУТИ В КАТАЛОГ', onClick: () => setArchived(r, false) }
                          : { label: 'ПРИХОВАТИ', danger: true, onClick: () => setArchived(r, true) },
                      ]}
                    />
                  </span>
                ) : `${r.pricePr} PR`
              }
            />
          ))}
        </ListPanel>
      )}

      {editing !== undefined && <RareReserveEditor reserve={editing} tags={tags} onClose={() => setEditing(undefined)} />}
      {tagsOpen && <TagManager tags={tags} reserves={reserves} onClose={() => setTagsOpen(false)} />}
    </>
  );
}

function Chip({ active, onClick, children, small }) {
  return (
    <button type="button" className={`ss-chip${active ? ' on' : ''}`} onClick={onClick} style={small ? { height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center' } : { fontSize: 11 }}>
      {children}
    </button>
  );
}
