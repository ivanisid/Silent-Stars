import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function PilotSelectPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [pilots, setPilots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [background, setBackground] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const list = await api.listPilots();
      setPilots(list);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Введіть ім'я");
    if (!callsign.trim()) return setError('Введіть позивний');

    setBusy(true);
    setError('');
    try {
      await api.createPilot({ name: name.trim(), callsign: callsign.trim(), background: background.trim() });
      setName('');
      setCallsign('');
      setBackground('');
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id, e) {
    e.stopPropagation();
    if (!window.confirm('Видалити цього пілота назавжди?')) return;
    await api.deletePilot(id);
    reload();
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, #0d1a2c 0%, #070d16 70%)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 720, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ width: 12, height: 12, background: 'var(--accent)' }} />
          <div className="title-font" style={{ fontSize: 26, letterSpacing: 3 }}>
            ВИБІР ПІЛОТА
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{user?.nick}</span>
            <button className="btn-ghost" onClick={logout} type="button">
              ВИЙТИ
            </button>
          </div>
        </div>

        {loadError && <div className="error-box" style={{ marginBottom: 16 }}>{loadError}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          {loading && (
            <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Завантаження…</div>
          )}
          {!loading && pilots.length === 0 && (
            <div
              style={{
                border: '1px dashed var(--input-border)',
                padding: 22,
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--text-dimmer)',
              }}
            >
              Пілотів ще немає — створіть першого нижче.
            </div>
          )}
          {pilots.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/pilots/${p.id}`)}
              type="button"
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '16px 20px',
                background: '#0e1622',
                color: 'var(--text)',
                border: '1px solid var(--panel-border)',
                fontFamily: "'Share Tech Mono',monospace",
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingRight: 90 }}>
                <span className="title-font" style={{ fontSize: 20, letterSpacing: 1 }}>{p.callsign}</span>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{p.name}</span>
                {p.status === 'archive' && (
                  <span style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: 1 }}>АРХІВ</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dimmer)', marginTop: 6, lineHeight: 1.5, textAlign: 'left' }}>
                {p.background}
              </div>
              <span
                onClick={(e) => remove(p.id, e)}
                role="button"
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 16,
                  fontSize: 11,
                  color: 'var(--text-dimmer)',
                  letterSpacing: 1,
                  padding: '4px 8px',
                  border: '1px solid var(--input-border)',
                }}
              >
                ВИДАЛИТИ
              </span>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="title">НОВИЙ ПІЛОТ</div>
          </div>
          <form onSubmit={create} style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="field-label">ІМ'Я</div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ім'я персонажа"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="field-label">ПОЗИВНИЙ</div>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="Callsign"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                />
              </div>
            </div>
            <div>
              <div className="field-label">БЕКГРАУНД</div>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Коротка історія пілота…"
                rows={4}
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, resize: 'vertical', color: '#8a97a8' }}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>
              СТВОРИТИ ПІЛОТА
            </button>
          </form>
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: '#3d5573', letterSpacing: 1, textAlign: 'center' }}>
          UNION ADMINISTRATIVE // PILOT ROSTER
        </div>
      </div>
    </div>
  );
}
