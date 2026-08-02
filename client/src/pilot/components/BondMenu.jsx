import { Card, SegRow } from './ui';
import { burdenLabel } from '../logic';

const TYPE_OPTIONS = [
  { value: 'minor4', label: 'МІНОРНИЙ · 4' },
  { value: 'middle6', label: 'МІДЛ · 6' },
  { value: 'major8', label: 'МЕЙДЖОР · 8' },
];

export default function BondMenu({ state, dispatch }) {
  const isHp = state.resourceMode === 'hp';

  const modeBtnStyle = (active) => ({
    background: active ? 'var(--header)' : 'transparent',
    color: 'var(--text)',
    border: 'none',
    padding: '9px 14px',
    fontSize: 12,
  });

  return (
    <Card
      title="BOND MENU"
      right={
        <div style={{ display: 'flex', border: '1px solid var(--btn-border)' }}>
          <button type="button" style={modeBtnStyle(!isHp)} onClick={() => dispatch({ type: 'SET_RESOURCE_MODE', mode: 'full' })}>
            Стрес
          </button>
          <button type="button" style={modeBtnStyle(isHp)} onClick={() => dispatch({ type: 'SET_RESOURCE_MODE', mode: 'hp' })}>
            ХП
          </button>
        </div>
      }
    >
      {isHp ? (
        <div style={{ padding: 24 }}>
          <div className="field-label">ХП ПІЛОТА (спрощений ресурс)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn" type="button" onClick={() => dispatch({ type: 'DEC_HP' })}>−</button>
            <div className="title-font" style={{ fontSize: 32, minWidth: 90, textAlign: 'center' }}>
              {state.hp.current} / {state.hp.max}
            </div>
            <button className="btn" type="button" onClick={() => dispatch({ type: 'INC_HP' })}>+</button>
            <div style={{ flex: 1, height: 10, background: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
              <div style={{ height: '100%', width: `${Math.round((state.hp.current / state.hp.max) * 100)}%`, background: 'var(--accent)' }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div>
            <div className="field-label">СТРЕС ({state.stress}/8)</div>
            <SegRow filled={state.stress} count={8} size={26} onToggle={(idx) => dispatch({ type: 'SET_STRESS', idx })} />
          </div>

          <div>
            <div className="field-label">БЬОРДЕНИ</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {state.burdens.map((b, bi) => {
                const size = b.type === 'minor4' ? 4 : b.type === 'middle6' ? 6 : 8;
                return (
                  <div key={bi} style={{ flex: 1, minWidth: 220, background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: 14 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {TYPE_OPTIONS.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => dispatch({ type: 'SET_BURDEN_TYPE', bi, value: t.value })}
                          style={{
                            fontSize: 10,
                            letterSpacing: 0.5,
                            padding: '4px 6px',
                            background: b.type === t.value ? 'var(--header)' : 'transparent',
                            color: b.type === t.value ? 'var(--text)' : 'var(--text-dimmer)',
                            border: '1px solid var(--input-border)',
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={b.name}
                      onChange={(e) => dispatch({ type: 'SET_BURDEN_NAME', bi, value: e.target.value })}
                      placeholder="Назва бьордена"
                      style={{ marginBottom: 12, padding: '7px 10px', fontSize: 13, width: '100%' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Прогрес лікування ({burdenLabel(b.type)})</div>
                    <div style={{ marginBottom: 12 }}>
                      <SegRow filled={b.filled} count={size} size={20} gap={6} onToggle={(idx) => dispatch({ type: 'SET_BURDEN_SEG', bi, idx })} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginBottom: 4 }}>ЛІКУВАННЯ</div>
                    <SegRow filled={b.heal} count={4} size={16} gap={6} onToggle={(idx) => dispatch({ type: 'SET_BURDEN_HEAL', bi, idx })} />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div className="field-label" style={{ marginBottom: 0 }}>БОНД</div>
              {state.bond.xp >= 8 && (
                <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn-border)', fontSize: 11, padding: '4px 10px', letterSpacing: 1 }}>
                  СИЛА В ОЧІКУВАННІ (8 XP)
                </div>
              )}
            </div>
            <input
              type="text"
              value={state.bond.archetype}
              onChange={(e) => dispatch({ type: 'SET_ARCHETYPE', value: e.target.value })}
              placeholder="Архетип бонду"
              style={{ marginTop: 10, padding: '8px 10px', fontSize: 14, width: 260, maxWidth: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '12px 0 6px 0' }}>XP ({state.bond.xp}/8)</div>
            <SegRow filled={state.bond.xp} count={8} size={22} onToggle={(idx) => dispatch({ type: 'SET_BOND_XP', idx })} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '16px 0 8px 0' }}>ЗДОБУТІ СИЛИ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.bond.powers.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: '7px 12px', fontSize: 13 }}>
                  <span>{p}</span>
                  <button type="button" onClick={() => dispatch({ type: 'REMOVE_POWER', idx })} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                type="text"
                value={state.bond.newPower}
                onChange={(e) => dispatch({ type: 'SET_BOND_NEW_POWER', value: e.target.value })}
                placeholder="Назва нової сили"
                style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
              />
              <button className="btn" type="button" onClick={() => dispatch({ type: 'ADD_POWER' })}>+</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
