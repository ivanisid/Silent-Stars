import { useMemo, useState } from 'react';
import { RESERVES, RESERVE_CATEGORIES, RESERVE_RANK_PR } from '../pilot/reserves';
import { RARE_RESERVES, RARE_RANKS, VAULT_CAP_BASE, VAULT_CAP_STORAGE } from '../pilot/rareReserves';
import NavDrawer from '../components/NavDrawer.jsx';
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
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, var(--page-grad) 0%, var(--bg) 70%)',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="title-font" style={{ fontSize: 30, color: 'var(--text-bright)' }}>
          РЕЗЕРВИ
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KindButton active={kind === KIND_COMMON} onClick={() => { setKind(KIND_COMMON); setQ(''); }} label="ЗВИЧАЙНІ" count={RESERVES.length} />
          <KindButton active={kind === KIND_RARE} onClick={() => { setKind(KIND_RARE); setQ(''); }} label="РІДКІСНІ" count={RARE_RESERVES.length} />
        </div>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук за назвою або ефектом…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 13 }}
        />

        {kind === KIND_COMMON ? <CommonList q={q} /> : <RareList q={q} />}
      </div>

      <NavDrawer />
    </div>
  );
}

function KindButton({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 20px',
        fontSize: 13,
        letterSpacing: 1,
        background: active ? 'var(--header)' : 'var(--input-bg)',
        color: active ? 'var(--text-bright)' : 'var(--text-dim)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--input-border)'}`,
        cursor: 'pointer',
      }}
    >
      {label}
      <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 8 }}>{count}</span>
    </button>
  );
}

function Note({ children }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>{children}</div>
  );
}

function Counter({ shown, total }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
      {shown === total ? `${total} позицій` : `${shown} з ${total}`}
    </div>
  );
}

function Empty() {
  return (
    <div style={{ fontSize: 13, color: 'var(--text-dimmer)', padding: '20px 0' }}>
      Нічого не знайдено.
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

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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

      <Counter shown={list.length} total={RESERVES.length} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((r) => (
          <div key={r.key} style={{ ...cardStyle, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <ReserveIcon kind={r.category} title={RESERVE_CATEGORIES.find((c) => c.key === r.category)?.label} />
            <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, color: 'var(--text-bright)' }}>{r.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-info)', letterSpacing: 1 }}>
                РАНГ {r.rank} · {RESERVE_RANK_PR[r.rank]} PR
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>
                · {RESERVE_CATEGORIES.find((c) => c.key === r.category)?.label || r.category}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6, marginTop: 8 }}>{r.desc}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <Empty />}
      </div>
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
        ({VAULT_CAP_STORAGE} з покращенням ангару «Місце на складі») і нічого не
        витрачає, доки резерв лежить. Згорає лише те, що взяли на місію.
      </Note>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip active={rank === 0} onClick={() => setRank(0)}>УСІ РАНГИ</Chip>
        {RARE_RANKS.map((rk) => (
          <Chip key={rk} active={rank === rk} onClick={() => setRank(rk)}>
            РАНГ {rk} · {RARE_RESERVES.filter((r) => r.rank === rk).length}
          </Chip>
        ))}
      </div>

      <Counter shown={list.length} total={RARE_RESERVES.length} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((r) => (
          <div key={r.key} style={{ ...cardStyle, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <ReserveIcon kind="rare" title="Рідкісний резерв" />
            <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, color: 'var(--text-bright)' }}>{r.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-info)', letterSpacing: 1 }}>РАНГ {r.rank}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>· {r.action}</div>
              {r.tags && (
                <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>· {r.tags}</div>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6, marginTop: 8 }}>{r.desc}</div>
            {r.flavor && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-dimmer)',
                  lineHeight: 1.6,
                  marginTop: 8,
                  borderLeft: '2px solid var(--rule)',
                  paddingLeft: 10,
                  fontStyle: 'italic',
                }}
              >
                {r.flavor}
              </div>
            )}
            </div>
          </div>
        ))}
        {list.length === 0 && <Empty />}
      </div>
    </>
  );
}

const cardStyle = {
  background: 'var(--panel)',
  border: '1px solid var(--panel-border)',
  padding: '14px 16px',
};

function Chip({ active, onClick, children, small }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: small ? '5px 10px' : '7px 13px',
        fontSize: small ? 10 : 11,
        background: active ? 'var(--header)' : 'var(--input-bg)',
        color: active ? 'var(--text-bright)' : 'var(--text-dim)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--input-border)'}`,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
