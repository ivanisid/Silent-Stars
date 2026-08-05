import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { mapCompconPilot, mergeMechsByName } from '../pilot/compconImport';
import { pushLog, computeLL, llTier } from '../pilot/logic';

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

  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef(null);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCallsign, setEditCallsign] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

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

  function startEdit(p, e) {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
    setEditCallsign(p.callsign);
    setEditError('');
  }

  function cancelEdit(e) {
    e.stopPropagation();
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id, e) {
    e.stopPropagation();
    if (!editName.trim()) return setEditError("Введіть ім'я");
    if (!editCallsign.trim()) return setEditError('Введіть позивний');

    setEditBusy(true);
    setEditError('');
    try {
      await api.updatePilot(id, { name: editName.trim(), callsign: editCallsign.trim() });
      setEditingId(null);
      await reload();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportBusy(true);
    setImportError('');
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const mapped = mapCompconPilot(json);

      // Same character, different COMP/CON save per mech build (campaign has multiple mech
      // slots) — matched by callsign (kept constant per character in Foundry), since the
      // "name" field is what tends to vary between per-mech COMP/CON saves. Merge the mech(s)
      // into the existing pilot instead of creating a duplicate.
      const existing = pilots.find((p) => p.callsign.trim().toLowerCase() === mapped.callsign.trim().toLowerCase());

      if (existing) {
        const full = await api.getPilot(existing.id);
        const mechNames = mapped.state.mechs.map((m) => m.name).join(', ') || '—';
        const newState = {
          ...full.state,
          mechs: mergeMechsByName(full.state.mechs, mapped.state.mechs),
          actionLog: pushLog(full.state.actionLog, `Мех(и) підтягнуто з COMP/CON («${mapped.callsign}»): ${mechNames}`),
        };
        await api.updatePilot(existing.id, { state: newState });
      } else {
        const created = await api.createPilot({ name: mapped.name, callsign: mapped.callsign, background: mapped.background });
        await api.updatePilot(created.id, { state: mapped.state });
      }
      await reload();
    } catch (err) {
      setImportError(err instanceof SyntaxError ? 'Файл не є коректним JSON.' : err.message);
    } finally {
      setImportBusy(false);
    }
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
          <img src="/logo-ferum-vox.webp" alt="" width={28} height={28} style={{ display: 'block' }} />
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn-ghost" type="button" disabled={importBusy} onClick={() => fileInputRef.current?.click()}>
            {importBusy ? 'ІМПОРТУЄТЬСЯ…' : 'ІМПОРТУВАТИ З COMP/CON'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
            JSON-файл «Export Pilot» з COMP/CON
          </span>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: 'none' }} />
        </div>
        {importError && <div className="error-box" style={{ marginBottom: 16 }}>{importError}</div>}

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
          {pilots.map((p) => {
            const isEditing = editingId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => !isEditing && navigate(`/pilots/${p.id}`)}
                type="button"
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  cursor: isEditing ? 'default' : 'pointer',
                  padding: '16px 20px',
                  background: '#0e1622',
                  color: 'var(--text)',
                  border: '1px solid var(--panel-border)',
                  fontFamily: "'Share Tech Mono',monospace",
                  position: 'relative',
                }}
              >
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 90 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Ім'я"
                        style={{ flex: 1, minWidth: 140, padding: '7px 9px', fontSize: 14 }}
                      />
                      <input
                        type="text"
                        value={editCallsign}
                        onChange={(e) => setEditCallsign(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Позивний"
                        style={{ flex: 1, minWidth: 140, padding: '7px 9px', fontSize: 14 }}
                      />
                    </div>
                    {editError && <div className="error-box">{editError}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" type="button" disabled={editBusy} onClick={(e) => saveEdit(p.id, e)}>
                        ЗБЕРЕГТИ
                      </button>
                      <button className="btn-ghost" type="button" onClick={cancelEdit}>
                        СКАСУВАТИ
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingRight: 90 }}>
                      <span className="title-font" style={{ fontSize: 20, letterSpacing: 1 }}>{p.callsign}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{p.name}</span>
                      {p.status === 'archive' && (
                        <span style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: 1 }}>АРХІВ</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                        ТІР {llTier(computeLL(p.games))} · ЛЛ {computeLL(p.games)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dimmer)', marginTop: 6, lineHeight: 1.5, textAlign: 'left' }}>
                      {p.background}
                    </div>
                  </>
                )}
                {!isEditing && (
                  <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 6 }}>
                    <span
                      onClick={(e) => startEdit(p, e)}
                      role="button"
                      tabIndex={-1}
                      style={{
                        fontSize: 11,
                        color: 'var(--text-dimmer)',
                        letterSpacing: 1,
                        padding: '4px 8px',
                        border: '1px solid var(--input-border)',
                      }}
                    >
                      РЕДАГУВАТИ
                    </span>
                    <span
                      onClick={(e) => remove(p.id, e)}
                      role="button"
                      tabIndex={-1}
                      style={{
                        fontSize: 11,
                        color: 'var(--text-dimmer)',
                        letterSpacing: 1,
                        padding: '4px 8px',
                        border: '1px solid var(--input-border)',
                      }}
                    >
                      ВИДАЛИТИ
                    </span>
                  </div>
                )}
              </button>
            );
          })}
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
