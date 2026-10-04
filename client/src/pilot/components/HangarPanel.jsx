import { Panel } from '../../components/kit.jsx';
import { HANGAR_DATA } from '../constants';

// Покращення ангару. Ціна — мана плюс PR; червоним лише та валюта, якої бракує.
// Купівля підтверджується у HangarConfirmModal.
export default function HangarPanel({ state, dispatch }) {
  const boughtCount = HANGAR_DATA.filter((it) => (state.hangar.owned[it.key] || 0) >= it.prices.length).length;

  return (
    <Panel title="ОСОБИСТИЙ АНГАР" sub={`${boughtCount} / ${HANGAR_DATA.length}`}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {HANGAR_DATA.map((item, i) => {
          const owned = state.hangar.owned[item.key] || 0;
          const done = owned >= item.prices.length;
          const lvl = Math.min(owned, item.prices.length - 1);
          const mana = item.prices[lvl];
          const pr = item.pr?.[lvl] || 0;
          const req = item.requires && !state.hangar.owned[item.requires] ? HANGAR_DATA.find((h) => h.key === item.requires) : null;
          const manaShort = !done && mana > state.mana.balance;
          const prShort = !done && pr > state.pr;
          const canBuy = !done && !req && !manaShort && !prShort;
          const texts = [item.desc, ...item.levelTexts].filter(Boolean).join('\n');
          return (
            <div
              key={item.key}
              className="m-hangar"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) auto 96px',
                gap: 16,
                alignItems: 'center',
                padding: '10px 14px',
                borderLeft: `3px solid ${done ? 'var(--success)' : 'transparent'}`,
                borderTop: i ? '1px solid var(--panel-border)' : 'none',
                opacity: req ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-bright)' }}>{item.title}</span>
                  {req && <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>ПІСЛЯ «{req.title.toUpperCase()}»</span>}
                </div>
                {texts && <div className="ss-note" style={{ whiteSpace: 'pre-line', textWrap: 'pretty' }}>{texts}</div>}
              </div>
              <div className="num" style={{ fontSize: 12, whiteSpace: 'nowrap', textAlign: 'right' }}>
                <span style={{ color: manaShort ? 'var(--danger)' : 'var(--text)' }}>{mana} М</span>
                {pr > 0 && (
                  <>
                    <span style={{ color: 'var(--text-faint)' }}> + </span>
                    <span style={{ color: prShort ? 'var(--danger)' : 'var(--text)' }}>{pr} PR</span>
                  </>
                )}
              </div>
              {done ? (
                <div className="ss-tag ok" style={{ height: 26, width: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ПРИДБАНО</div>
              ) : (
                <button
                  className={canBuy ? 'btn md' : 'btn-ghost md'}
                  type="button"
                  style={{ width: 96 }}
                  disabled={!canBuy}
                  title={req ? `Спершу «${req.title}»` : !canBuy ? 'Недостатньо коштів' : undefined}
                  onClick={() => dispatch({ type: 'OPEN_HANGAR_CONFIRM', key: item.key })}
                >
                  ПРИДБАТИ
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
