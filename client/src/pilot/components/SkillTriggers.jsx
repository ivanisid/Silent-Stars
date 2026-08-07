import { Card, StepButton } from './ui';
import { derivePilotView } from '../derive';

export default function SkillTriggers({ state, dispatch }) {
  const view = derivePilotView(state);

  return (
    <Card title="SKILL TRIGGERS">
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 14 }}>
          Ліміт рівнів тригерів: {view.skillCapUsed} / {view.skillCapMax} (1 рівень = +2)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.skillTriggers.map((tr) => (
            <div key={tr.id} style={{ background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-bright)' }}>{tr.name}</div>
                {tr.desc && <div style={{ fontSize: 12, color: 'var(--text-soft-dim)', marginTop: 2 }}>{tr.desc}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StepButton onClick={() => dispatch({ type: 'CHANGE_SKILL_LEVEL', id: tr.id, delta: -1 })} disabled={tr.level <= 1}>−</StepButton>
                <div className="title-font" style={{ fontSize: 15, minWidth: 40, textAlign: 'center', color: 'var(--accent)' }}>+{tr.level * 2}</div>
                <StepButton onClick={() => dispatch({ type: 'CHANGE_SKILL_LEVEL', id: tr.id, delta: 1 })} disabled={tr.level >= 3}>+</StepButton>
              </div>
              <button type="button" onClick={() => dispatch({ type: 'REMOVE_SKILL_TRIGGER', id: tr.id })} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={state.skillDraft.name}
              onChange={(e) => dispatch({ type: 'SET_SKILL_DRAFT_FIELD', field: 'name', value: e.target.value })}
              placeholder="Назва тригеру"
              style={{ flex: 1, minWidth: 140, padding: '7px 9px', fontSize: 12 }}
            />
            <input
              type="text"
              value={state.skillDraft.desc}
              onChange={(e) => dispatch({ type: 'SET_SKILL_DRAFT_FIELD', field: 'desc', value: e.target.value })}
              placeholder="Опис"
              style={{ flex: 1, minWidth: 140, padding: '7px 9px', fontSize: 12 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_SKILL_DRAFT_LEVEL', level: lvl })}
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    background: state.skillDraft.level === lvl ? 'var(--header)' : 'transparent',
                    color: state.skillDraft.level === lvl ? 'var(--text)' : 'var(--text-dimmer)',
                    border: '1px solid var(--input-border)',
                  }}
                >
                  +{lvl * 2}
                </button>
              ))}
            </div>
            <button className="btn" type="button" onClick={() => dispatch({ type: 'ADD_SKILL_TRIGGER' })}>ДОДАТИ</button>
          </div>
        </div>
      </div>
    </Card>
  );
}
