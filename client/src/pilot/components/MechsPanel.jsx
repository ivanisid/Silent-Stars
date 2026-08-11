import { Card, SegRow, StepButton } from './ui';
import { OC_STEPS } from '../constants';

export default function MechsPanel({ state, dispatch }) {
  const d = state.mechDraft;
  // Banking mission DC needs the Resource Buffer, and only as much as still fits in it.
  const hasBuffer = (state.hangar.owned.buffer || 0) >= 1;
  const bufferRoom = Math.max(0, ((state.hangar.owned.buffer || 0) >= 2 ? 10 : 5) - state.dcStore);

  return (
    <Card
      title="МЕХИ"
      right={
        <button className="btn-ghost" type="button" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => dispatch({ type: 'OPEN_DCR' })}>
          РЕМОНТ ЗА DC
        </button>
      }
    >
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {state.mechs.map((m) => {
          const editing = state.mechEditId === m.id;
          const ocIdx = Math.min(m.overcharge, 3);

          return (
            <div key={m.id} style={{ background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <div className="title-font" style={{ fontSize: 20 }}>{m.name}</div>
                  {m.frame && (
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: 1,
                        color: 'var(--accent)',
                        border: '1px solid var(--accent-dim)',
                        padding: '2px 7px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {[m.frameSource, m.frame].filter(Boolean).join(' ').toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-ghost" type="button" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => dispatch({ type: 'FULL_REPAIR_MECH', id: m.id })}>
                    ПОВНИЙ РЕМОНТ
                  </button>
                  <button className="btn-ghost" type="button" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => dispatch({ type: 'TOGGLE_MECH_EDIT', id: m.id })}>
                    {editing ? 'ЗАКРИТИ' : 'РЕДАГУВАТИ'}
                  </button>
                  <button className="btn-ghost" type="button" style={{ fontSize: 11, padding: '6px 10px', color: 'var(--danger)' }} onClick={() => dispatch({ type: 'REMOVE_MECH', id: m.id })}>
                    ВИДАЛИТИ
                  </button>
                </div>
              </div>

              {editing && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12, background: 'var(--panel-inset)', border: '1px solid var(--input-border)', padding: 12 }}>
                  <div>
                    <div className="field-label">HP КАП</div>
                    <input type="number" value={state.mechEdit.hpMax} onChange={(e) => dispatch({ type: 'SET_EDIT_HP', value: e.target.value })} style={{ width: 80, padding: '6px 8px', fontSize: 13 }} />
                  </div>
                  <div>
                    <div className="field-label">РЕМ. КАП</div>
                    <input type="number" value={state.mechEdit.repairMax} onChange={(e) => dispatch({ type: 'SET_EDIT_REPAIR', value: e.target.value })} style={{ width: 80, padding: '6px 8px', fontSize: 13 }} />
                  </div>
                  <div>
                    <div className="field-label">ФРЕЙМ</div>
                    <input
                      type="text"
                      value={state.mechEdit.frame || ''}
                      onChange={(e) => dispatch({ type: 'SET_EDIT_FRAME', value: e.target.value })}
                      placeholder="Tortuga"
                      style={{ width: 140, padding: '6px 8px', fontSize: 13 }}
                    />
                  </div>
                  <button className="btn" type="button" onClick={() => dispatch({ type: 'SAVE_MECH_EDIT' })}>ЗБЕРЕГТИ</button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 16 }}>
                <div>
                  <div className="field-label">HP</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StepButton onClick={() => dispatch({ type: 'DEC_MECH_HP', id: m.id })}>−</StepButton>
                    <div style={{ minWidth: 60, textAlign: 'center', fontSize: 15 }}>{m.hpCurrent} / {m.hpMax}</div>
                    <StepButton onClick={() => dispatch({ type: 'INC_MECH_HP', id: m.id })}>+</StepButton>
                  </div>
                </div>
                <div>
                  <div className="field-label">РЕМКОМПЛЕКТИ</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StepButton onClick={() => dispatch({ type: 'DEC_MECH_REPAIR', id: m.id })}>−</StepButton>
                    <div style={{ minWidth: 60, textAlign: 'center', fontSize: 15 }}>{m.repairCurrent} / {m.repairMax}</div>
                    <StepButton onClick={() => dispatch({ type: 'INC_MECH_REPAIR', id: m.id })}>+</StepButton>
                  </div>
                </div>
                <div>
                  <div className="field-label">DC ЗА МІСІЮ</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StepButton onClick={() => dispatch({ type: 'SHIFT_MECH_DC', id: m.id, dir: -1 })} disabled={(m.dc || 0) <= 0}>−</StepButton>
                    <div
                      style={{
                        minWidth: 60,
                        textAlign: 'center',
                        fontSize: 15,
                        color: (m.dc || 0) > 0 ? 'var(--accent)' : 'var(--text-dimmer)',
                      }}
                    >
                      {m.dc || 0} DC
                    </div>
                    <StepButton onClick={() => dispatch({ type: 'SHIFT_MECH_DC', id: m.id, dir: 1 })}>+</StepButton>
                  </div>
                  {hasBuffer && (m.dc || 0) > 0 && (
                    <button
                      className="btn-ghost"
                      type="button"
                      disabled={bufferRoom <= 0}
                      onClick={() => dispatch({ type: 'MECH_DC_TO_BUFFER', id: m.id })}
                      style={{
                        fontSize: 10,
                        padding: '3px 8px',
                        marginTop: 6,
                        opacity: bufferRoom <= 0 ? 0.5 : 1,
                        cursor: bufferRoom <= 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {bufferRoom > 0 ? `→ У БУФЕР (${Math.min(m.dc || 0, bufferRoom)})` : 'БУФЕР ПОВНИЙ'}
                    </button>
                  )}
                </div>
                <div>
                  <div className="field-label">CORE POWER</div>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'TOGGLE_MECH_CORE', id: m.id })}
                    style={{
                      fontSize: 11,
                      letterSpacing: 1,
                      padding: '6px 12px',
                      background: m.corePower ? 'var(--ok-bg)' : 'var(--bad-bg)',
                      color: m.corePower ? 'var(--success)' : 'var(--danger)',
                      border: `1px solid ${m.corePower ? 'var(--ok-border)' : 'var(--bad-border)'}`,
                    }}
                  >
                    {m.corePower ? 'ЗАРЯДЖЕНО' : 'ВИТРАЧЕНО'}
                  </button>
                </div>
                <div>
                  <div className="field-label">OVERCHARGE</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StepButton onClick={() => dispatch({ type: 'SHIFT_MECH_OVERCHARGE', id: m.id, dir: -1 })} disabled={m.overcharge <= 0}>−</StepButton>
                    <div style={{ minWidth: 60, textAlign: 'center', fontSize: 14 }}>{OC_STEPS[ocIdx]}</div>
                    <StepButton onClick={() => dispatch({ type: 'SHIFT_MECH_OVERCHARGE', id: m.id, dir: 1 })} disabled={m.overcharge >= 3}>+</StepButton>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= m.overcharge ? 'var(--accent)' : 'var(--input-bg)', border: '1px solid var(--accent-dim)' }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div>
                  <div className="field-label">СТРУКТУРА ({m.structureFilled}/4)</div>
                  <SegRow filled={m.structureFilled} count={4} size={20} gap={6} onToggle={(idx) => dispatch({ type: 'SET_MECH_STRUCTURE', id: m.id, idx })} />
                </div>
                <div>
                  <div className="field-label">РЕАКТОР ({m.reactorFilled}/4)</div>
                  <SegRow filled={m.reactorFilled} count={4} size={18} gap={6} onToggle={(idx) => dispatch({ type: 'SET_MECH_REACTOR', id: m.id, idx })} />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="field-label">ЛІМІТНІ СИСТЕМИ</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {m.limited.map((li, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel-sunken)', padding: '8px 10px' }}>
                      <div style={{ flex: 1, fontSize: 13, color: li.destroyed ? 'var(--text-dimmer)' : 'var(--text)', textDecoration: li.destroyed ? 'line-through' : 'none' }}>
                        {li.name}
                      </div>
                      <StepButton onClick={() => dispatch({ type: 'DEC_LIMITED', id: m.id, idx })}>−</StepButton>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
                        <span style={{ minWidth: 18, textAlign: 'right' }}>{li.current}</span>
                        <span style={{ color: 'var(--text-dimmer)' }}>/</span>
                        {/* The cap is editable in place: Engineering, core bonuses and frame
                            traits all raise it, and the import cannot always see them all. */}
                        <input
                          type="number"
                          min={1}
                          value={li.max}
                          onChange={(e) => dispatch({ type: 'SET_LIMITED_MAX', id: m.id, idx, value: e.target.value })}
                          title="Максимум зарядів"
                          style={{ width: 44, padding: '2px 4px', fontSize: 13, textAlign: 'center' }}
                        />
                      </div>
                      <StepButton onClick={() => dispatch({ type: 'INC_LIMITED', id: m.id, idx })}>+</StepButton>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_LIMITED_DESTROYED', id: m.id, idx })}
                        style={{ fontSize: 10, padding: '4px 8px', background: 'transparent', color: li.destroyed ? 'var(--danger)' : 'var(--text-dimmer)', border: `1px solid ${li.destroyed ? 'var(--danger-border)' : 'var(--input-border)'}` }}
                      >
                        {li.destroyed ? 'ЗНИЩЕНО' : 'ЦІЛЕ'}
                      </button>
                      <button type="button" onClick={() => dispatch({ type: 'REMOVE_LIMITED', id: m.id, idx })} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    value={state.limitedDraft[m.id]?.name || ''}
                    onChange={(e) => dispatch({ type: 'SET_LIMITED_DRAFT', id: m.id, field: 'name', value: e.target.value })}
                    placeholder="Назва зброї/системи"
                    style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                  />
                  <input
                    type="number"
                    value={state.limitedDraft[m.id]?.max || ''}
                    onChange={(e) => dispatch({ type: 'SET_LIMITED_DRAFT', id: m.id, field: 'max', value: e.target.value })}
                    placeholder="Макс."
                    style={{ width: 70, padding: '6px 8px', fontSize: 12 }}
                  />
                  <button className="btn" type="button" onClick={() => dispatch({ type: 'ADD_LIMITED', id: m.id })}>+</button>
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 8 }}>
          <input type="text" value={d.name} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'name', value: e.target.value })} placeholder="Назва меха" style={{ padding: '8px 10px', fontSize: 13 }} />
          <input type="text" value={d.frame || ''} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'frame', value: e.target.value })} placeholder="Фрейм (Tortuga)" style={{ padding: '8px 10px', fontSize: 13 }} />
          <input type="number" value={d.hpMax} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'hpMax', value: e.target.value })} placeholder="HP" style={{ width: 80, padding: '8px 10px', fontSize: 13 }} />
          <input type="number" value={d.repairMax} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'repairMax', value: e.target.value })} placeholder="Рем." style={{ width: 80, padding: '8px 10px', fontSize: 13 }} />
          <button className="btn" type="button" onClick={() => dispatch({ type: 'ADD_MECH' })}>ДОДАТИ МЕХА</button>
        </div>
      </div>
    </Card>
  );
}
