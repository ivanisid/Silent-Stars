import { Card, SegRow } from './ui';
import { nextBurdenSize } from '../logic';
import { BOND_XP_PER_POWER } from '../constants';

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="field-label" style={{ marginBottom: 0 }}>СТРЕС ({state.stress}/{state.stressMax})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>ЛІМІТ</span>
                <input
                  type="number"
                  min={1}
                  value={state.stressMax}
                  onChange={(e) => dispatch({ type: 'SET_STRESS_MAX', value: e.target.value })}
                  style={{ width: 56, padding: '4px 6px', fontSize: 12 }}
                />
              </div>
              {state.downAndOut && (
                <div style={{ background: 'var(--bad-bg)', color: 'var(--danger)', border: '1px solid var(--bad-border)', fontSize: 10, padding: '3px 8px', letterSpacing: 1 }}>
                  DOWN AND OUT
                </div>
              )}
              <button
                className="btn-ghost"
                type="button"
                style={{ fontSize: 10, padding: '3px 8px', marginLeft: 'auto' }}
                onClick={() => dispatch({ type: 'TOGGLE_DOWN_AND_OUT' })}
              >
                {state.downAndOut ? 'ЗНЯТИ DOWN AND OUT' : 'ПОЗНАЧИТИ DOWN AND OUT'}
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <SegRow filled={state.stress} count={state.stressMax} size={26} onToggle={(idx) => dispatch({ type: 'SET_STRESS', idx })} />
            </div>
            {/* Стрес не витрачається, а записується — обидві дії його додають. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                className="btn"
                type="button"
                style={{ fontSize: 11 }}
                onClick={() => dispatch({ type: 'TAKE_STRESS', amount: 1, reason: 'допомога, +1 ACCURACY' })}
              >
                +1 СТРЕС · ДОПОМОГА (+1 ACCURACY)
              </button>
              <button
                className="btn"
                type="button"
                style={{ fontSize: 11 }}
                onClick={() => dispatch({ type: 'TAKE_STRESS', amount: 2, reason: 'push' })}
              >
                +2 СТРЕСУ · PUSH (перекид)
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 8, lineHeight: 1.6 }}>
              Допомагаючи, ви розділяєте наслідки з тим, хто кидає. Push робить кидок ризиковим;
              ризикований стає героїчним, героїчний перекинути не можна.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div className="field-label" style={{ marginBottom: 0 }}>
                BURDEN-И ({state.burdens.length}/3)
              </div>
              {nextBurdenSize(state.burdens.length) == null ? (
                <div style={{ background: 'var(--bad-bg)', color: 'var(--danger)', border: '1px solid var(--bad-border)', fontSize: 11, padding: '4px 10px', letterSpacing: 1 }}>
                  ЧЕТВЕРТИЙ BURDEN — СМЕРТЬ ПЕРСОНАЖА
                </div>
              ) : (
                <button className="btn-ghost" type="button" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => dispatch({ type: 'ADD_BURDEN' })}>
                  + BURDEN ({nextBurdenSize(state.burdens.length)} СЕГМ.)
                </button>
              )}
            </div>

            {state.burdens.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-dimmer)', marginTop: 10 }}>
                Burden-ів немає. Перший матиме 4 сегменти, другий 6, третій 8.
              </div>
            )}

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10 }}>
              {state.burdens.map((b) => (
                <div key={b.id} style={{ flex: 1, minWidth: 220, background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      value={b.name}
                      onChange={(e) => dispatch({ type: 'SET_BURDEN_NAME', id: b.id, value: e.target.value })}
                      placeholder="Опишіть травму"
                      style={{ flex: 1, padding: '7px 10px', fontSize: 13 }}
                    />
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'REMOVE_BURDEN', id: b.id })}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    ЛІКУВАННЯ {b.healed}/{b.size} — заповниться повністю, burden зникне
                  </div>
                  <SegRow filled={b.healed} count={b.size} size={20} gap={6} onToggle={(idx) => dispatch({ type: 'SET_BURDEN_HEALED', id: b.id, idx })} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 10, lineHeight: 1.6 }}>
              Burden сам по собі не заважає в наративних сценах — хіба що ви самі візьмете
              на кидок 1 DIFFICULTY і отримаєте за це XP.
            </div>
          </div>

          <BondSection state={state} dispatch={dispatch} />
        </div>
      )}
    </Card>
  );
}

// Від секції бонду лишився тільки лічильник XP. Ідеали (разом із захардкодженими
// спільними major ideals), архетип, власні сили та veteran/master живуть у COMP/CON —
// у чарнику їм місця немає. Стан `state.bond` і всі екшени редюсера не чіпані, тож
// повернути будь-що з цього — питання розмітки, а не даних.
function BondSection({ state, dispatch }) {
  const b = state.bond;

  return (
    <div>
      <div className="field-label">XP ({b.xp}/{BOND_XP_PER_POWER})</div>
      <SegRow
        filled={Math.min(b.xp, BOND_XP_PER_POWER)}
        count={BOND_XP_PER_POWER}
        size={22}
        onToggle={(idx) => dispatch({ type: 'SET_BOND_XP', idx })}
      />
    </div>
  );
}
