import { PR_SERVICES, limitedRefillPr } from '../../constants';
import { MechSelect } from './shared';

// Вибір однієї системи для поповнення зарядів. Ціна показується біля кожної,
// бо залежить від базового запасу саме цієї системи (1 заряд — найдорожче).
function SystemPick({ mech, pick, onPick }) {
  if (!mech) return null;
  if (mech.limited.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>У цього меха немає лімітних систем.</div>;
  }
  return (
    <div>
      <div className="field-label">ОБЕРІТЬ СИСТЕМУ</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mech.limited.map((li, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onPick(idx)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              textAlign: 'left',
              padding: '9px 12px',
              fontSize: 13,
              background: pick === idx ? 'var(--header)' : 'var(--input-bg)',
              color: 'var(--text)',
              border: `1px solid ${pick === idx ? 'var(--accent)' : 'var(--input-border)'}`,
            }}
          >
            <span>{li.name} ({li.current}/{li.max})</span>
            <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>{limitedRefillPr(li.max)} PR</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PrSpendModal({ state, dispatch }) {
  const { item: key, mechId, pick, error } = state.prSpend;
  if (!key) return null;
  const svc = PR_SERVICES.find((s) => s.key === key);
  const mech = state.mechs.find((m) => m.id === mechId);

  const cost =
    key === 'refillone'
      ? pick == null
        ? null
        : limitedRefillPr(mech?.limited[pick]?.max)
      : svc?.cost;

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_PR_SPEND' })}>
      <div className="modal-box" style={{ width: 460, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ПРИНТЕР · {svc?.title}</div>
        <div className="modal-body">
          <div>
            <div className="field-label">ОБЕРІТЬ МЕХА</div>
            <MechSelect mechs={state.mechs} mechId={mechId} onPick={(id) => dispatch({ type: 'SET_PR_SPEND_MECH', mechId: id })} />
          </div>

          {key === 'refillone' && mechId && (
            <SystemPick mech={mech} pick={pick} onPick={(idx) => dispatch({ type: 'SET_PR_SPEND_PICK', idx })} />
          )}

          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {cost == null ? `PR: ${state.pr}` : `PR: ${state.pr} → ${state.pr - cost}`}
            {svc?.manaCost ? ` · або ${svc.manaCost} мани` : ''}
          </div>

          {error && <div className="error-box">{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'PR_SPEND_CONFIRM' })}>
              ВИТРАТИТИ PR
            </button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_PR_SPEND' })}>
              СКАСУВАТИ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
