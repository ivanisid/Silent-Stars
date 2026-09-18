import { Card, SegRow } from './ui';
import { nextBurdenSize } from '../logic';
import {
  SHARED_MAJOR_IDEALS,
  BOND_XP_PER_POWER,
  BOND_POWERS_FOR_VETERAN,
  BOND_POWERS_FOR_MASTER,
} from '../constants';

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

function Ideal({ label, text, checked, onToggle, muted }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'left',
        padding: '8px 10px',
        fontSize: 12,
        lineHeight: 1.5,
        background: checked ? 'var(--header)' : 'var(--input-bg)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--input-border)'}`,
        color: muted ? 'var(--text-dimmer)' : 'var(--text)',
      }}
    >
      <span style={{ color: checked ? 'var(--accent)' : 'var(--text-dimmer)' }}>{checked ? '▪' : '▫'}</span>
      <span style={{ flex: 1 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>{label}</span>
        <br />
        {text || <span style={{ color: 'var(--text-dimmer)' }}>— не заповнено —</span>}
      </span>
    </button>
  );
}

function BondSection({ state, dispatch }) {
  const b = state.bond;
  const hasBond = b.archetype.trim() !== '';
  const own = b.powers.length;
  const canClaim = hasBond && b.xp >= BOND_XP_PER_POWER;
  const canReset = !hasBond && b.xp >= BOND_XP_PER_POWER;
  const veteranUnlocked = own >= BOND_POWERS_FOR_VETERAN;
  const masterUnlocked = own >= BOND_POWERS_FOR_MASTER;
  const set = (field) => (e) => dispatch({ type: 'SET_BOND_FIELD', field, value: e.target.value });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div className="field-label" style={{ marginBottom: 0 }}>БОНД</div>
        {canClaim && (
          <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn-border)', fontSize: 11, padding: '4px 10px', letterSpacing: 1 }}>
            СИЛА В ОЧІКУВАННІ ({BOND_XP_PER_POWER} XP)
          </div>
        )}
      </div>

      <input
        type="text"
        value={b.archetype}
        onChange={(e) => dispatch({ type: 'SET_ARCHETYPE', value: e.target.value })}
        placeholder="Архетип бонду (обирається на Тірі 2)"
        style={{ marginTop: 10, padding: '8px 10px', fontSize: 14, width: 320, maxWidth: '100%' }}
      />

      {!hasBond && (
        <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 8, lineHeight: 1.6 }}>
          Поки бонд не обрано, XP дають лише два спільні major ideals. Досягнувши{' '}
          {BOND_XP_PER_POWER} XP, лічильник можна скинути — скидів зараз: <b>{b.deferredResets}</b>.
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div className="field-label">ІДЕАЛИ ЗА ЦЮ ГРУ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Ideal
            label="MAJOR · власний для бонду"
            text={b.majorIdealFirst}
            checked={b.marked.major0}
            muted={!hasBond}
            onToggle={() => dispatch({ type: 'TOGGLE_IDEAL', key: 'major0' })}
          />
          <Ideal label="MAJOR · спільний" text={SHARED_MAJOR_IDEALS[0]} checked={b.marked.major1} onToggle={() => dispatch({ type: 'TOGGLE_IDEAL', key: 'major1' })} />
          <Ideal label="MAJOR · спільний" text={SHARED_MAJOR_IDEALS[1]} checked={b.marked.major2} onToggle={() => dispatch({ type: 'TOGGLE_IDEAL', key: 'major2' })} />
          <Ideal
            label="MINOR · ціль на гру"
            text={b.minorIdeal}
            checked={b.marked.minor}
            muted={!hasBond}
            onToggle={() => dispatch({ type: 'TOGGLE_IDEAL', key: 'minor' })}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input type="text" value={b.majorIdealFirst} onChange={set('majorIdealFirst')} placeholder="Перший major ideal вашого бонду" style={{ flex: 1, minWidth: 220, padding: '7px 10px', fontSize: 12 }} />
          <input type="text" value={b.minorIdeal} onChange={set('minorIdeal')} placeholder="Minor ideal на цю гру" style={{ flex: 1, minWidth: 220, padding: '7px 10px', fontSize: 12 }} />
        </div>

        <button className="btn" type="button" style={{ marginTop: 10, fontSize: 11 }} onClick={() => dispatch({ type: 'SCORE_IDEALS' })}>
          ЗАРАХУВАТИ ІДЕАЛИ В КІНЦІ ГРИ
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '18px 0 6px 0' }}>
        XP ({b.xp}/{BOND_XP_PER_POWER})
      </div>
      <SegRow filled={Math.min(b.xp, BOND_XP_PER_POWER)} count={BOND_XP_PER_POWER} size={22} onToggle={(idx) => dispatch({ type: 'SET_BOND_XP', idx })} />

      <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '16px 0 8px 0' }}>
        ВЛАСНІ СИЛИ ({own})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {b.powers.map((p, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: '7px 12px', fontSize: 13 }}>
            <span>{p}</span>
            <button type="button" onClick={() => dispatch({ type: 'REMOVE_POWER', idx })} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input type="text" value={b.newPower} onChange={(e) => dispatch({ type: 'SET_BOND_NEW_POWER', value: e.target.value })} placeholder="Назва нової сили" style={{ flex: 1, minWidth: 180, padding: '8px 10px', fontSize: 13 }} />
        {canClaim && (
          <button className="btn" type="button" onClick={() => dispatch({ type: 'CLAIM_BOND_POWER' })}>
            ВЗЯТИ ЗА {BOND_XP_PER_POWER} XP
          </button>
        )}
        {canReset && (
          <button className="btn" type="button" onClick={() => dispatch({ type: 'RESET_DEFERRED_XP' })}>
            СКИНУТИ ЛІЧИЛЬНИК
          </button>
        )}
        <button className="btn-ghost" type="button" onClick={() => dispatch({ type: 'ADD_POWER' })}>+ ВРУЧНУ</button>
      </div>

      {/* Сила з чужого бонду доступна від двох власних і сама дає veteran power;
          п'ять власних дають master power. */}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div className="field-label">
            СИЛА З ЧУЖОГО БОНДУ {veteranUnlocked ? '' : `· від ${BOND_POWERS_FOR_VETERAN} власних сил`}
          </div>
          <input type="text" value={b.foreignPower} onChange={set('foreignPower')} disabled={!veteranUnlocked} placeholder={veteranUnlocked ? 'Назва сили' : 'Ще недоступно'} style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12, opacity: veteranUnlocked ? 1 : 0.5 }} />
        </div>
        <div>
          <div className="field-label">VETERAN POWER {veteranUnlocked ? '' : '· ще недоступно'}</div>
          <input type="text" value={b.veteranPower} onChange={set('veteranPower')} disabled={!veteranUnlocked} placeholder={veteranUnlocked ? 'Назва сили' : 'Ще недоступно'} style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12, opacity: veteranUnlocked ? 1 : 0.5 }} />
        </div>
        <div>
          <div className="field-label">
            MASTER POWER {masterUnlocked ? '' : `· від ${BOND_POWERS_FOR_MASTER} власних сил`}
          </div>
          <input type="text" value={b.masterPower} onChange={set('masterPower')} disabled={!masterUnlocked} placeholder={masterUnlocked ? 'Назва сили' : 'Ще недоступно'} style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12, opacity: masterUnlocked ? 1 : 0.5 }} />
        </div>
      </div>
    </div>
  );
}
