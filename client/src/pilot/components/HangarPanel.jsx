import { Card } from './ui';
import { HANGAR_DATA } from '../constants';
import { hangarBuyLabel, hangarPriceText } from '../derive';

export default function HangarPanel({ state, dispatch }) {
  // Завжди розгорнута, як решта панелей чарника: згорнута смужка губилась серед них.
  return (
    <Card title="ОСОБИСТИЙ АНГАР" right={<span style={{ fontSize: 11, color: 'var(--text-info)' }}>ПОКУПНІ БОНУСИ</span>}>
      <div>
          {HANGAR_DATA.map((item) => {
            const owned = state.hangar.owned[item.key] || 0;
            const max = item.prices.length;
            const done = owned >= max;
            return (
              <div key={item.key} style={{ borderBottom: '1px solid var(--rule)', padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {Array.from({ length: max }, (_, i) => (
                      <svg key={i} width="16" height="18" viewBox="0 0 20 23" style={{ display: 'block' }}>
                        <polygon points="10,1 19,6.5 19,16.5 10,22 1,16.5 1,6.5" fill={i < owned ? 'var(--accent)' : 'var(--input-bg)'} stroke="var(--accent-dim)" strokeWidth="1.5" />
                      </svg>
                    ))}
                  </div>
                  <div className="title-font" style={{ fontSize: 17 }}>{item.title}</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                    {done && (
                      <div style={{ fontSize: 11, color: 'var(--success)', letterSpacing: 1, border: '1px solid var(--success-border)', padding: '6px 12px' }}>ПРИДБАНО</div>
                    )}
                    {!done && (
                      <button className="btn" type="button" style={{ fontSize: 11 }} onClick={() => dispatch({ type: 'OPEN_HANGAR_CONFIRM', key: item.key })}>
                        {hangarBuyLabel(item, owned)}
                      </button>
                    )}
                  </div>
                </div>
                {item.desc && (
                  <div style={{ fontSize: 12, color: 'var(--text-soft-dim)', lineHeight: 1.6, marginTop: 8, whiteSpace: 'pre-line' }}>{item.desc}</div>
                )}
                {item.levelTexts.map((text, i) => (
                  <div key={i} style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${i < owned ? 'var(--success)' : 'var(--header-border)'}` }}>
                    <div style={{ fontSize: 11, color: i < owned ? 'var(--success)' : 'var(--text-dim)', letterSpacing: 1 }}>
                      РІВЕНЬ {i + 1}{i < owned ? ' · ПРИДБАНО' : ''} · {hangarPriceText(item, i)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-soft-dim)', lineHeight: 1.6, marginTop: 3, whiteSpace: 'pre-line' }}>{text}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
    </Card>
  );
}
