export function MechSelect({ mechs, mechId, onPick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {mechs.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onPick(m.id)}
          style={{
            textAlign: 'left',
            padding: '9px 12px',
            fontSize: 13,
            background: mechId === m.id ? 'var(--header)' : 'var(--input-bg)',
            color: 'var(--text)',
            border: `1px solid ${mechId === m.id ? 'var(--accent)' : 'var(--input-border)'}`,
          }}
        >
          {m.name}
        </button>
      ))}
      {mechs.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Немає жодного меха.</div>}
    </div>
  );
}
