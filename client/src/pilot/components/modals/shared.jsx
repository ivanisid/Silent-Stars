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

export function AllocRows({ mech, alloc, limitLeft, onShift }) {
  if (!mech) return null;
  return (
    <div>
      <div className="field-label">РОЗПОДІЛІТЬ ЗАРЯДИ · ЗАЛИШИЛОСЬ: {limitLeft}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mech.limited.map((li, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', flex: 1 }}>
              {li.name} ({li.current}/{li.max})
            </div>
            <button type="button" onClick={() => onShift(idx, -1)} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '4px 10px', fontSize: 12 }}>−</button>
            <div style={{ minWidth: 20, textAlign: 'center', fontSize: 13 }}>{alloc[idx] || 0}</div>
            <button type="button" onClick={() => onShift(idx, 1)} style={{ background: 'var(--btn-bg)', color: 'var(--text)', border: '1px solid var(--btn-border)', padding: '4px 10px', fontSize: 12 }}>+</button>
          </div>
        ))}
      </div>
    </div>
  );
}
