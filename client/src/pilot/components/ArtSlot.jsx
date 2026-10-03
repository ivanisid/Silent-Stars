import { useRef, useState } from 'react';

// Місце під арт — портрет пілота чи зображення меха, як у COMP/CON. Клік по картинці (або
// по порожній рамці) відкриває вибір файлу; при наведенні власник бачить «змінити».
// Новий файл замінює попередній. Під картинкою — один рядок: шлях у Foundry (клік —
// скопіювати) або що синхронізація ще йде.
//
// fit: 'cover' — заповнити рамку (портрет), 'contain' — показати цілком (мех на прозорому фоні).

// У вузькій рамці видно кінець шляху — саме він розрізняє файли; повний шлях — у підказці
// і в буфері після кліку.
function shortPath(p) {
  const parts = p.split('/');
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p;
}

export default function ArtSlot({ art, label, emptyText, canEdit, onUpload, onRemove, width = 220, height = 260, fit = 'contain' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState(false);

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

  async function remove(e) {
    e.stopPropagation();
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

  async function copyPath() {
    await navigator.clipboard.writeText(art.foundry_path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const showOverlay = canEdit && (hover || busy);

  return (
    <div style={{ width, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
      <div
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        aria-label={canEdit ? label : undefined}
        onClick={() => canEdit && !busy && inputRef.current?.click()}
        onKeyDown={(e) => { if (canEdit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative',
          width: '100%',
          height,
          background: 'var(--panel-sunken)',
          border: `1px solid ${hover && canEdit ? 'var(--accent)' : 'var(--input-border)'}`,
          overflow: 'hidden',
          cursor: canEdit ? (busy ? 'wait' : 'pointer') : 'default',
          transition: 'border-color 0.15s',
        }}
      >
        {art?.previewUrl ? (
          <img
            src={art.previewUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: fit, objectPosition: fit === 'cover' ? 'center top' : 'center', display: 'block' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, textAlign: 'center' }}>
            {canEdit && <div style={{ fontSize: 28, lineHeight: 1, color: 'var(--text-dimmer)' }}>+</div>}
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.4 }}>{emptyText}</div>
          </div>
        )}

        {/* Затемнення з підписом поверх картинки — лише для власника, при наведенні. */}
        {showOverlay && art?.previewUrl && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, letterSpacing: 2, color: '#fff' }}>{busy ? 'ЗАВАНТАЖЕННЯ…' : `✎ ${label}`}</span>
          </div>
        )}

        {canEdit && art && onRemove && hover && !busy && (
          <button
            type="button"
            onClick={remove}
            title="Прибрати зображення"
            style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, padding: 0, fontSize: 12, lineHeight: '22px', background: 'rgba(0,0,0,0.65)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer' }}
          >
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

      {art && (art.foundry_path ? (
        <button
          type="button"
          onClick={copyPath}
          title={`${art.foundry_path}\nНатисніть, щоб скопіювати шлях для токена чи актора у Foundry`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 10,
            color: copied ? 'var(--success)' : 'var(--text-dim)',
            textAlign: 'left',
          }}
        >
          <span style={{ color: 'var(--success)', flexShrink: 0 }}>{copied ? '✓' : '⧉'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {copied ? 'шлях скопійовано' : shortPath(art.foundry_path)}
          </span>
        </button>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--warn)' }}>⏳ синхронізація з Foundry…</div>
      ))}

      {error && <div className="error-box" style={{ fontSize: 11 }}>{error}</div>}
    </div>
  );
}
