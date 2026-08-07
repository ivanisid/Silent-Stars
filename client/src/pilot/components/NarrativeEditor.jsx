import { Card } from './ui';

export default function NarrativeEditor({ state, dispatch }) {
  return (
    <Card title="НАРАТИВ">
      <div style={{ padding: 20 }}>
        <textarea
          value={state.narrative}
          onChange={(e) => dispatch({ type: 'SET_NARRATIVE', value: e.target.value })}
          rows={5}
          placeholder="Історія пілота…"
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-soft)', resize: 'vertical' }}
        />
      </div>
    </Card>
  );
}
