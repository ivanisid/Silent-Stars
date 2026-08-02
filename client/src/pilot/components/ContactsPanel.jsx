import { Card } from './ui';
import { relationshipLabel } from '../logic';

const REL_COLOR = { good: 'var(--success)', neutral: 'var(--warn)', bad: 'var(--danger)' };

export default function ContactsPanel({ state, dispatch }) {
  const d = state.contactDraft;
  const setField = (field, value) => dispatch({ type: 'SET_CONTACT_DRAFT_FIELD', field, value });

  return (
    <Card title="КОНТАКТИ">
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.contacts.map((c, idx) => (
          <div key={idx} style={{ background: 'var(--input-bg)', border: '1px solid var(--panel-border)', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, color: 'var(--text-bright)' }}>{c.name} <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>· {c.circle}</span></div>
              <div style={{ fontSize: 12, color: '#8ba5c3', marginTop: 4 }}>{c.help}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 2 }}>{c.debt}</div>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CYCLE_RELATIONSHIP', idx })}
              style={{ background: 'transparent', border: `1px solid ${REL_COLOR[c.relationship]}`, color: REL_COLOR[c.relationship], padding: '6px 10px', fontSize: 11, letterSpacing: 1 }}
            >
              {relationshipLabel(c.relationship)}
            </button>
            <button type="button" onClick={() => dispatch({ type: 'REMOVE_CONTACT', idx })} style={{ background: 'transparent', border: '1px solid var(--input-border)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, padding: '6px 10px' }}>
              ВИДАЛИТИ
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="text" value={d.name} onChange={(e) => setField('name', e.target.value)} placeholder="Ім'я" style={{ padding: '7px 9px', fontSize: 12 }} />
            <input type="text" value={d.circle} onChange={(e) => setField('circle', e.target.value)} placeholder="Коло" style={{ padding: '7px 9px', fontSize: 12 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="text" value={d.help} onChange={(e) => setField('help', e.target.value)} placeholder="Профіль допомоги" style={{ padding: '7px 9px', fontSize: 12 }} />
            <input type="text" value={d.debt} onChange={(e) => setField('debt', e.target.value)} placeholder="Стан боргу" style={{ padding: '7px 9px', fontSize: 12 }} />
          </div>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'ADD_CONTACT' })} style={{ alignSelf: 'flex-start' }}>ДОДАТИ</button>
        </div>
      </div>
    </Card>
  );
}
