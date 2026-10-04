import { useMemo, useState } from 'react';
import { RESERVES, RESERVE_CATEGORIES, RESERVE_RANK_PR } from '../pilot/reserves';
import { RARE_RESERVES, RARE_RANKS, VAULT_CAP_BASE } from '../pilot/rareReserves';
import { PageHeader, PageShell } from '../components/kit.jsx';
import ReserveIcon, { ReserveGlyph, hasReserveIcon } from '../pilot/components/ReserveIcon.jsx';

// Довідник резервів — тільки перегляд, нічого не купується. Дві категорії:
//
//   ЗВИЧАЙНІ — ті, що є в магазині за PR і знаходяться за даунтайм (Get Creative).
//   РІДКІСНІ — ті, що не купуються й не знаходяться: їх видають як частину нагороди
//              за місію, і вони лягають на склад у чарнику.
//
// Купівля звичайних лишилась у магазині: тут саме довідник, щоб не було двох місць,
// де витрачають PR.

const KIND_COMMON = 'common';
const KIND_RARE = 'rare';

export default function ReservesPage() {
  const [kind, setKind] = useState(KIND_COMMON);
  const [q, setQ] = useState('');

  return (
    <PageShell>
      <PageHeader section="ДОВІДНИК" title="РЕЗЕРВИ" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="ss-seg">
          <button type="button" className={kind === KIND_COMMON ? 'on' : ''} style={{ height: 28, padding: '0 16px' }} onClick={() => { setKind(KIND_COMMON); setQ(''); }}>
            ЗВИЧАЙНІ · {RESERVES.length}
          </button>
          <button type="button" className={kind === KIND_RARE ? 'on' : ''} style={{ height: 28, padding: '0 16px' }} onClick={() => { setKind(KIND_RARE); setQ(''); }}>
            РІДКІСНІ · {RARE_RESERVES.length}
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

function Row({ i, icon, name, meta, desc, flavor, price }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 14, alignItems: 'start', padding: '12px 14px', borderTop: i ? '1px solid var(--panel-border)' : 'none' }}>
      {icon}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--text-bright)' }}>{name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>{meta}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6, textWrap: 'pretty' }}>{desc}</div>
        {flavor && <div style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.6, fontStyle: 'italic' }}>&gt; {flavor}</div>}
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
        Купуються за PR у магазині й здобуваються за даунтайм-дію Get Creative. Ціна
        залежить від рангу: {RESERVE_RANK_PR[1]} / {RESERVE_RANK_PR[2]} / {RESERVE_RANK_PR[3]} PR.
        Тут лише довідник — витрата PR лишилась у магазині.
      </Note>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip active={rank === 0} onClick={() => { setRank(0); setCategory('all'); }}>УСІ РАНГИ</Chip>
        {[1, 2, 3].map((rk) => (
          <Chip key={rk} active={rank === rk} onClick={() => { setRank(rk); setCategory('all'); }}>
            РАНГ {rk} · {RESERVE_RANK_PR[rk]} PR
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
              price={`${RESERVE_RANK_PR[r.rank]} PR`}
            />
          );
        })}
      </ListPanel>
    </>
  );
}

// ---------- Рідкісні ----------

function RareList({ q }) {
  const [rank, setRank] = useState(0);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return RARE_RESERVES.filter(
      (r) =>
        (rank === 0 || r.rank === rank) &&
        (needle === '' ||
          r.name.toLowerCase().includes(needle) ||
          r.desc.toLowerCase().includes(needle) ||
          r.tags.toLowerCase().includes(needle) ||
          r.action.toLowerCase().includes(needle)),
    );
  }, [q, rank]);

  return (
    <>
      <Note>
        Не купуються й не знаходяться за даунтайм — їх видають як частину нагороди за
        місію. Отриманий резерв записують на склад у чарнику: він вміщує {VAULT_CAP_BASE}{' '}
        і нічого не витрачає, доки резерв лежить. Згорає лише те, що взяли на місію.
      </Note>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip active={rank === 0} onClick={() => setRank(0)}>УСІ РАНГИ</Chip>
        {RARE_RANKS.map((rk) => (
          <Chip key={rk} active={rank === rk} onClick={() => setRank(rk)}>
            РАНГ {rk} · {RARE_RESERVES.filter((r) => r.rank === rk).length}
          </Chip>
        ))}
      </div>

      <ListPanel shown={list.length} total={RARE_RESERVES.length}>
        {list.map((r, i) => (
          <Row
            key={r.key}
            i={i}
            icon={<ReserveIcon kind="rare" title="Рідкісний резерв" />}
            name={r.name}
            meta={[`РАНГ ${r.rank}`, r.action, r.tags].filter(Boolean).join(' · ')}
            desc={r.desc}
            flavor={r.flavor}
            price="НАГОРОДА"
          />
        ))}
      </ListPanel>
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
