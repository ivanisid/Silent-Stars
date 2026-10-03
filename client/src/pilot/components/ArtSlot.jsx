import { useRef, useState } from 'react';

// Місце під арт — портрет пілота чи зображення меха, як у COMP/CON: картинка і під нею
// кнопка «Встановити…». Новий файл замінює попередній. Під кнопкою — де арт лежить у
// Foundry (шлях для токена) або що синхронізація ще йде.

export default function ArtSlot({ art, label, emptyText, canEdit, onUpload, onRemove, width = 220, height = 260 }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function pick(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onUpload(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Прибрати це зображення? Файл зникне і з Foundry.')) return;
    setBusy(true);
    setError('');
    try {
      await onRemove(art.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ width, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
      <div
        onClick={() => canEdit && !busy && inputRef.current?.click()}
        title={canEdit ? label : undefined}
        style={{
          width: '100%',
          height,
          background: 'var(--panel-sunken)',
          border: '1px solid var(--input-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: canEdit ? (busy ? 'wait' : 'pointer') : 'default',
        }}
      >
        {art?.previewUrl ? (
          <img src={art.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-dimmer)', textAlign: 'center', padding: 10 }}>
            {busy ? 'Завантаження…' : emptyText}
          </span>
        )}
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            style={{ flex: 1, fontSize: 10, letterSpacing: 2, padding: '6px 8px' }}
          >
            {busy ? '…' : `✎ ${label}`}
          </button>
          {art && onRemove && (
            <button className="btn-ghost" type="button" disabled={busy} onClick={remove} title="Прибрати зображення" style={{ fontSize: 10, padding: '6px 8px' }}>
              ✕
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      )}

      {art && (
        art.foundry_path ? (
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(art.foundry_path);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title="Шлях у Foundry — вставте в зображення токена чи актора"
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 10, color: 'var(--success)', wordBreak: 'break-all' }}
          >
            {copied ? '✓ ШЛЯХ СКОПІЙОВАНО' : `✓ FOUNDRY: ${art.foundry_path}`}
          </button>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--warn)' }}>⏳ у Foundry з'явиться за хвилину</div>
        )
      )}

      {error && <div className="error-box" style={{ fontSize: 11 }}>{error}</div>}
    </div>
  );
}
