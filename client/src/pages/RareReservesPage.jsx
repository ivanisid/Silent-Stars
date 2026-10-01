import { useMemo, useState } from 'react';
import { RARE_RESERVES, RARE_RANKS, VAULT_CAP_BASE, VAULT_CAP_STORAGE } from '../pilot/rareReserves';
import NavDrawer from '../components/NavDrawer.jsx';

// Каталог рідкісних резервів — тільки перегляд. Купити їх не можна: вони приходять
// як частина нагороди за місію, а гравець записує отримане на склад у своєму чарнику.
// Розкладка повторює вкладку RESERVES у магазині: перемикач рангів зверху, під ним
// список. Пошук доданий, бо позицій 100, а не 56, і гортати їх незручно.
export default function RareReservesPage() {
  const [rank, setRank] = useState(1);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return RARE_RESERVES.filter(
      (r) =>
        r.rank === rank &&
        (needle === '' ||
          r.name.toLowerCase().includes(needle) ||
          r.desc.toLowerCase().includes(needle) ||
          r.tags.toLowerCase().includes(needle) ||
          r.action.toLowerCase().includes(needle)),
    );
  }, [rank, q]);

  const total = (rk) => RARE_RESERVES.filter((r) => r.rank === rk).length;

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, var(--page-grad) 0%, var(--bg) 70%)',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="title-font" style={{ fontSize: 30, color: 'var(--text-bright)' }}>
            РІДКІСНІ РЕЗЕРВИ
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, marginTop: 8 }}>
            Їх не купують і не знаходять за даунтайм — вони приходять як частина нагороди
            за місію. Отриманий резерв запишіть на склад у своєму чарнику: він вміщує{' '}
            {VAULT_CAP_BASE} штук ({VAULT_CAP_STORAGE} з покращенням ангару «Місце на
            складі») і нічого не витрачає, доки резерв лежить. Згорає лише те, що взяли
            на місію.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {RARE_RANKS.map((rk) => (
            <button
              key={rk}
              type="button"
              onClick={() => setRank(rk)}
              style={{
                padding: '9px 18px',
                fontSize: 12,
                background: rank === rk ? 'var(--header)' : 'var(--input-bg)',
                color: rank === rk ? 'var(--text-bright)' : 'var(--text-dim)',
                border: `1px solid ${rank === rk ? 'var(--accent)' : 'var(--input-border)'}`,
                cursor: 'pointer',
              }}
            >
              РАНГ {rk}
              <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 8 }}>{total(rk)}</span>
            </button>
          ))}
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук за назвою, ефектом, тегом…"
            style={{ flex: 1, minWidth: 220, padding: '9px 12px', fontSize: 13 }}
          />
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
          {list.length === total(rank)
            ? `${list.length} позицій`
            : `${list.length} з ${total(rank)}`}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((r) => (
            <RareCard key={r.key} item={r} />
          ))}
          {list.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-dimmer)', padding: '20px 0' }}>
              Нічого не знайдено.
            </div>
          )}
        </div>
      </div>

      <NavDrawer />
    </div>
  );
}

function RareCard({ item }) {
  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--panel-border)',
        padding: '14px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, color: 'var(--text-bright)', letterSpacing: 1 }}>{item.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-info)', letterSpacing: 1 }}>{item.action}</div>
        {item.tags && (
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>· {item.tags}</div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6, marginTop: 8 }}>
        {item.desc}
      </div>
      {item.flavor && (
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
          {item.flavor}
        </div>
      )}
    </div>
  );
}
