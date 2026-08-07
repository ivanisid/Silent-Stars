import { Card } from './ui';
import { FOOTER_INVARIANTS } from '../constants';

export default function ActionLog({ state, dispatch }) {
  return (
    <Card
      title="ЖУРНАЛ ДІЙ"
      right={
        state.actionLog.length > 0 && (
          <button className="btn-ghost" type="button" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => dispatch({ type: 'CLEAR_LOG' })}>
            ОЧИСТИТИ
          </button>
        )
      }
    >
      <div style={{ padding: 20 }}>
        {state.actionLog.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Журнал порожній.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {state.actionLog.map((entry, i) => (
              <div key={i} style={{ fontSize: 12, borderTop: '1px solid var(--rule)', paddingTop: 6 }}>
                <span style={{ color: 'var(--text-dimmer)' }}>{entry.ts}</span>{' '}
                <span style={{ color: 'var(--text-soft)' }}>{entry.msg}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 0.5, lineHeight: 1.6 }}>
          {FOOTER_INVARIANTS}
        </div>
      </div>
    </Card>
  );
}
