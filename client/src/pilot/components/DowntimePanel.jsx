import { Card } from './ui';
import { llTier } from '../logic';
import { RESERVES, reserveByKey } from '../reserves';

const MOD_OPTIONS = [0, 2, 4, 6];

function tierColor(tier) {
  if (tier === '20+') return 'var(--success)';
  if (tier === '10–19') return 'var(--warn)';
  if (tier === '1–9') return 'var(--danger)';
  return 'var(--text-soft)';
}

export default function DowntimePanel({ state, dispatch, data, pool, title, capLabel, resetLabel }) {
  const chargesField = pool === 'weekly' ? 'weeklyCharges' : 'downtimeCharges';
  const { used, max } = state[chargesField];
  const remaining = max - used;
  const tier = Number(llTier(state.ll));

  return (
    <Card
      title={title}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{capLabel}: {remaining}/{max}</div>
          <button className="btn-ghost" type="button" onClick={() => dispatch({ type: 'RESET_CHARGES', pool })} style={{ fontSize: 10, padding: '4px 8px' }}>
            {resetLabel}
          </button>
        </div>
      }
    >
      <div>
        {data.map((d) => {
          const locked = (d.minTier || 1) > tier;
          const open = !locked && state.downtime.open === d.key;
          const roll = state.downtime.rolls[d.key];
          const curMod = state.downtime.modifiers[d.key] || 0;

          return (
            <div key={d.key} style={{ borderBottom: '1px solid var(--rule)' }}>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatch({ type: 'TOGGLE_DOWNTIME', key: d.key })}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: locked ? 'var(--text-dimmer)' : 'var(--text)',
                  padding: '14px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: locked ? 'not-allowed' : 'pointer',
                }}
              >
                <span style={{ fontSize: 14 }}>{d.title}</span>
                {locked ? (
                  <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>
                    З ТІРУ {d.minTier}
                  </span>
                ) : (
                  <span style={{ color: 'var(--accent)' }}>{open ? '−' : '+'}</span>
                )}
              </button>

              {open && (
                <div style={{ padding: '0 20px 18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {d.trigger && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.trigger}</div>}
                  {d.note && <div style={{ fontSize: 12, color: 'var(--text-soft-dim)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{d.note}</div>}

                  {d.isRestPanel && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={remaining <= 0 || state.stress <= 0}
                        onClick={() => dispatch({ type: 'REST_DRINK' })}
                        style={{ textAlign: 'left', fontSize: 12 }}
                      >
                        GET A DAMN DRINK — зняти половину стресу + 1Д4
                        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 3 }}>
                          зараз стресу: {state.stress}/{state.stressMax}
                        </div>
                      </button>

                      <div>
                        <div className="field-label">GET AID — полікувати 1Д4 сегментів burden-а</div>
                        {state.burdens.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>Burden-ів немає.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {state.burdens.map((b) => (
                              <button
                                key={b.id}
                                className="btn-ghost"
                                type="button"
                                disabled={remaining <= 0}
                                onClick={() => dispatch({ type: 'REST_AID', id: b.id })}
                                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '7px 12px' }}
                              >
                                <span>{b.name || 'без назви'}</span>
                                <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>{b.healed}/{b.size}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        className="btn"
                        type="button"
                        disabled={remaining <= 0}
                        onClick={() => dispatch({ type: 'REST_MEDICAL' })}
                        style={{ textAlign: 'left', fontSize: 12 }}
                      >
                        GET MEDICAL HELP — повне ХП і зняття down and out
                        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 3 }}>
                          ХП: {state.hp.current}/{state.hp.max}
                          {state.downAndOut ? ' · down and out активний' : ''}
                        </div>
                      </button>
                    </div>
                  )}

                  {d.isSkillPanel && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      Скіл-тригери керуються у картці «SKILL TRIGGERS» нижче.
                    </div>
                  )}

                  {d.isFocusPanel && (
                    <button
                      className="btn"
                      type="button"
                      disabled={remaining <= 0}
                      onClick={() => dispatch({ type: 'USE_FOCUS' })}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      СФОКУСУВАТИСЬ (+1 до ліміту скіл-тригерів)
                    </button>
                  )}

                  {d.isCreativePanel && (
                    <CreativePanel state={state} dispatch={dispatch} remaining={remaining} />
                  )}

                  {d.showRoll && (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {MOD_OPTIONS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => dispatch({ type: 'SET_DOWNTIME_MOD', key: d.key, mod: m })}
                            style={{
                              fontSize: 12,
                              padding: '6px 12px',
                              background: curMod === m ? 'var(--header)' : 'transparent',
                              color: curMod === m ? 'var(--text)' : 'var(--text-dimmer)',
                              border: '1px solid var(--input-border)',
                            }}
                          >
                            +{m}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={remaining <= 0}
                          onClick={() => dispatch({ type: 'ROLL_DOWNTIME', key: d.key, pool })}
                          style={{
                            marginLeft: 'auto',
                            background: remaining > 0 ? 'var(--btn-bg)' : 'transparent',
                            color: remaining > 0 ? 'var(--text)' : 'var(--text-dimmer)',
                            border: '1px solid var(--btn-border)',
                            padding: '6px 14px',
                            fontSize: 12,
                            cursor: remaining > 0 ? 'pointer' : 'not-allowed',
                          }}
                        >
                          КИНУТИ Д20
                        </button>
                      </div>

                      {roll && (
                        <div style={{ fontSize: 13, color: tierColor(roll.tier) }}>
                          Д20({roll.die}) +{curMod} = {roll.total} → {roll.tier}
                        </div>
                      )}
                      {roll && (
                        <div style={{ fontSize: 12, color: 'var(--text-soft-dim)', lineHeight: 1.6, whiteSpace: 'pre-line', borderLeft: `2px solid ${tierColor(roll.tier)}`, paddingLeft: 12 }}>
                          {roll.tier === '20+' ? d.tiers.high : roll.tier === '10–19' ? d.tiers.mid : d.tiers.low}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Трекер Get Creative: вибір мех-резерву, лічильник на стільки секцій, скільки в нього
// рангів, і кидок Д20 перед місією. Один проєкт за раз.
function CreativePanel({ state, dispatch, remaining }) {
  const cur = state.creative;
  const def = reserveByKey(cur.key);

  if (!def) {
    const options = RESERVES.filter((r) => r.category === 'mech');
    return (
      <div>
        <div className="field-label">ОБЕРІТЬ МЕХ-РЕЗЕРВ</div>
        {remaining <= 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 8 }}>
            Тижневий заряд витрачено — почати проєкт не вийде.
          </div>
        )}
        <select
          value=""
          disabled={remaining <= 0}
          onChange={(e) => e.target.value && dispatch({ type: 'START_CREATIVE', key: e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12 }}
        >
          <option value="">— оберіть резерв —</option>
          {options.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name} — ранг {r.rank}, {r.rank} сегм.
            </option>
          ))}
        </select>
      </div>
    );
  }

  const done = cur.filled >= def.rank;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-bright)' }}>{def.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
          ранг {def.rank} · {cur.filled}/{def.rank} секцій
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: def.rank }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 18,
              background: i < cur.filled ? 'var(--accent)' : 'var(--input-bg)',
              border: '1px solid var(--accent-dim)',
            }}
          />
        ))}
      </div>

      {cur.lastRoll && (
        <div style={{ fontSize: 12, color: tierColor(cur.lastRoll.tier) }}>
          Д20({cur.lastRoll.die}) → {cur.lastRoll.tier}, +{cur.lastRoll.gain}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!done && (
          <button className="btn" type="button" style={{ fontSize: 11 }} onClick={() => dispatch({ type: 'ROLL_CREATIVE' })}>
            КИНУТИ Д20 ПЕРЕД МІСІЄЮ
          </button>
        )}
        {done && (
          <button className="btn" type="button" style={{ fontSize: 11 }} onClick={() => dispatch({ type: 'CLAIM_CREATIVE' })}>
            ЗАБРАТИ РЕЗЕРВ
          </button>
        )}
        <button className="btn-ghost" type="button" style={{ fontSize: 10, padding: '5px 10px' }} onClick={() => dispatch({ type: 'SHIFT_CREATIVE_SEG', dir: -1 })}>
          −1 СЕКЦІЯ
        </button>
        <button className="btn-ghost" type="button" style={{ fontSize: 10, padding: '5px 10px' }} onClick={() => dispatch({ type: 'SHIFT_CREATIVE_SEG', dir: 1 })}>
          +1 СЕКЦІЯ
        </button>
        <button className="btn-ghost" type="button" style={{ fontSize: 10, padding: '5px 10px', marginLeft: 'auto' }} onClick={() => dispatch({ type: 'CANCEL_CREATIVE' })}>
          СКАСУВАТИ
        </button>
      </div>
    </div>
  );
}
