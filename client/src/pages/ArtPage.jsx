import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import NavDrawer from '../components/NavDrawer.jsx';

// Арти й токени для Foundry. Гравець вантажить зображення сюди, а синхронізатор на
// сервері Foundry кладе їх у Data/pilots/<нік>/ — звідти їх беруть для токенів і портретів.
// Статус «у Foundry» приходить сам через Realtime, без перезавантаження.

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function ArtCard({ art, onDelete, busy }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ border: '1px solid var(--input-border)', background: 'var(--panel-inset)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ aspectRatio: '1 / 1', background: 'var(--panel-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {art.previewUrl
          ? <img src={art.previewUrl} alt={art.file_name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>немає прев'ю</span>}
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
        <div style={{ color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={art.file_name}>
          {art.file_name}
        </div>
        <div style={{ color: 'var(--text-dimmer)' }}>{formatSize(art.size_bytes)}</div>
        {art.foundry_path ? (
          <>
            <div style={{ color: 'var(--success)', letterSpacing: 1 }}>✓ У FOUNDRY</div>
            <code style={{ fontSize: 10, color: 'var(--accent)', wordBreak: 'break-all', userSelect: 'all' }}>{art.foundry_path}</code>
          </>
        ) : (
          <div style={{ color: 'var(--warn)', letterSpacing: 1 }}>⏳ ОЧІКУЄ СИНХРОНІЗАЦІЇ</div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          {art.foundry_path && (
            <button
              className="btn-ghost"
              type="button"
              style={{ fontSize: 10, padding: '4px 8px' }}
              onClick={async () => {
                await navigator.clipboard.writeText(art.foundry_path);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'СКОПІЙОВАНО' : 'КОПІЮВАТИ ШЛЯХ'}
            </button>
          )}
          <button
            className="btn-ghost"
            type="button"
            disabled={busy}
            style={{ fontSize: 10, padding: '4px 8px', marginLeft: 'auto' }}
            onClick={() => {
              if (!window.confirm(`Видалити «${art.file_name}»? Файл зникне і з Foundry.`)) return;
              onDelete(art.id);
            }}
          >
            ВИДАЛИТИ
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ArtPage() {
  const { user } = useAuth();
  const [arts, setArts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  async function reload() {
    try {
      setArts(await api.listArt());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    let timer;
    const unsubscribe = api.subscribeArt(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function upload(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusy(true);
    setError('');
    const failed = [];
    for (let i = 0; i < list.length; i++) {
      setProgress(`Завантаження ${i + 1} з ${list.length}…`);
      try {
        await api.uploadArt(user.id, list[i]);
      } catch (err) {
        failed.push(err.message);
      }
    }
    setProgress('');
    setBusy(false);
    if (failed.length) setError(failed.join('\n'));
    await reload();
  }

  async function remove(id) {
    setBusy(true);
    setError('');
    try {
      await api.deleteArt(id);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, var(--page-grad) 0%, var(--bg) 70%)',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="title-font" style={{ fontSize: 30, color: 'var(--text-bright)' }}>АРТИ ДЛЯ FOUNDRY</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Завантажте портрети й токени — вони самі з'являться у Foundry в папці
          {' '}<code style={{ color: 'var(--accent)' }}>pilots/&lt;ваш нік&gt;/</code>. Скопіюйте шлях і вставте його
          в токен чи портрет актора. PNG, JPG, WEBP або GIF, до 10 МБ.
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) upload(e.dataTransfer.files); }}
          onClick={() => !busy && inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--input-border)'}`,
            background: dragOver ? 'var(--panel-inset)' : 'transparent',
            padding: '28px 16px',
            textAlign: 'center',
            cursor: busy ? 'wait' : 'pointer',
            fontSize: 13,
            color: 'var(--text-dim)',
          }}
        >
          {progress || 'Перетягніть зображення сюди або натисніть, щоб вибрати файли'}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { upload(e.target.files); e.target.value = ''; }}
          />
        </div>

        {error && <div className="error-box" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
        {loading && <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Завантаження…</div>}
        {!loading && arts.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dimmer)', textAlign: 'center' }}>Артів ще немає.</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {arts.map((a) => <ArtCard key={a.id} art={a} busy={busy} onDelete={remove} />)}
        </div>
      </div>
      <NavDrawer />
    </div>
  );
}
