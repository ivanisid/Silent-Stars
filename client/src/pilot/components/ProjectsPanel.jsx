import { Card } from './ui';
import { PROJECT_STAGE_LABELS } from '../constants';

const STATUS_COLOR = { активний: 'var(--success)', призупинено: 'var(--warn)', завершено: 'var(--text-dim)' };

export default function ProjectsPanel({ state, dispatch }) {
  const d = state.projectDraft;
  const setField = (field, value) => dispatch({ type: 'SET_PROJECT_DRAFT_FIELD', field, value });

  return (
    <Card title="ПРОЄКТИ">
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.projects.map((p, idx) => {
          const stage = p.stage || 1;
          return (
            <div key={idx} style={{ background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, color: 'var(--text-bright)' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-soft-dim)', marginTop: 4 }}>{p.note}</div>
                </div>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'CYCLE_PROJECT_STATUS', idx })}
                  style={{ background: 'transparent', border: `1px solid ${STATUS_COLOR[p.status]}`, color: STATUS_COLOR[p.status], padding: '6px 10px', fontSize: 11 }}
                >
                  {p.status}
                </button>
                <button type="button" onClick={() => dispatch({ type: 'REMOVE_PROJECT', idx })} style={{ background: 'transparent', border: '1px solid var(--input-border)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, padding: '6px 10px' }}>
                  ВИДАЛИТИ
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[1, 2, 3].map((s) => (
                    <div key={s} style={{ width: 16, height: 16, border: '2px solid var(--header-border)', background: s <= stage ? 'var(--accent)' : 'var(--input-bg)' }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Стадія {stage}/3 · {PROJECT_STAGE_LABELS[stage]}
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 8, marginTop: 8 }}>
          <input type="text" value={d.name} onChange={(e) => setField('name', e.target.value)} placeholder="Назва" style={{ padding: '7px 9px', fontSize: 12 }} />
          <input type="text" value={d.note} onChange={(e) => setField('note', e.target.value)} placeholder="Нотатка" style={{ padding: '7px 9px', fontSize: 12 }} />
          <button className="btn" type="button" onClick={() => dispatch({ type: 'ADD_PROJECT' })}>ДОДАТИ</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
          Стадія проєкту просувається дією «Прогрес проекту» у картці «ЧАС ПРОСТОЮ».
        </div>
      </div>
    </Card>
  );
}
