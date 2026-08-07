export function Card({ title, right, children }) {
  return (
    <div className="card">
      {title && (
        <div className="card-header">
          <div className="dot" />
          <div className="title">{title}</div>
          {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function SegRow({ filled, count, size = 20, onToggle, gap = 8 }) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: 'wrap' }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          onClick={() => onToggle(i)}
          style={{
            width: size,
            height: size,
            border: '2px solid var(--header-border)',
            background: i < filled ? 'var(--accent)' : 'var(--input-bg)',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

export function StepButton({ children, onClick, disabled, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'var(--btn-bg)',
        color: 'var(--text)',
        border: '1px solid var(--btn-border)',
        padding: '4px 10px',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function TextInput(props) {
  return <input type="text" {...props} style={{ padding: '8px 10px', fontSize: 13, ...props.style }} />;
}
