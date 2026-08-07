import { Card } from './ui';
import { PROJECT_STAGE_LABELS } from '../constants';

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
          const open = state.downtime.open === d.key;
          const roll = state.downtime.rolls[d.key];
          const curMod = state.downtime.modifiers[d.key] || 0;

          return (
            <div key={d.key} style={{ borderBottom: '1px solid var(--rule)' }}>
              <button
                type="button"
                onClick={() => dispatch({ type: 'TOGGLE_DOWNTIME', key: d.key })}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  padding: '14px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 14 }}>{d.title}</span>
                <span style={{ color: 'var(--accent)' }}>{open ? '−' : '+'}</span>
              </button>

              {open && (
                <div style={{ padding: '0 20px 18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {d.trigger && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.trigger}</div>}
                  {d.note && <div style={{ fontSize: 12, color: 'var(--text-soft-dim)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{d.note}</div>}

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

                  {d.isProjectPanel && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {state.projects.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Немає жодного проєкту.</div>
                      )}
                      {state.projects.map((p, idx) => {
                        const stage = p.stage || 1;
                        const maxed = stage >= 3;
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--input-bg)', padding: '8px 12px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13 }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Стадія {stage}/3 · {PROJECT_STAGE_LABELS[stage]}</div>
                            </div>
                            <button
                              type="button"
                              className="btn"
                              disabled={remaining <= 0 || maxed}
                              onClick={() => dispatch({ type: 'ADVANCE_PROJECT', idx })}
                              style={{ fontSize: 11 }}
                            >
                              {maxed ? 'МАКС.' : 'ПРОСУНУТИ'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
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
