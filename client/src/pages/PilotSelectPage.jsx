import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { mapCompconPilot, mergeMechsByName } from '../pilot/compconImport';
import { pushLog, llTier } from '../pilot/logic';
import { Menu, Msg, PageHeader, PageShell, Panel, useConfirm } from '../components/kit.jsx';

export default function PilotSelectPage() {
  const { user } = useAuth();
  const [ask, dialog] = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [view, setView] = useState('active');
  const [q, setQ] = useState('');

  const [pilots, setPilots] = useState([]);
  // Портрети окремо від списку: якщо їх не вдалося підтягнути, список однаково працює.
  const [portraits, setPortraits] = useState({});
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
      const list = await api.listPilots(user.id);
      setPilots(list);
      setLoadError('');
      api.listPortraits(list.map((p) => p.id)).then(setPortraits).catch(() => {});
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      setFormOpen(false);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Статус живе в state пілота, як і в профілі (TOGGLE_STATUS) — пишемо туди ж із записом у журнал.
  async function setArchived(p, archived) {
    const full = await api.getPilot(p.id);
    const next = archived ? 'archive' : 'active';
    if ((full.state?.status || 'active') === next) return;
    await api.updatePilot(p.id, {
      state: { ...full.state, status: next, actionLog: pushLog(full.state?.actionLog || [], `Статус: ${full.state?.status || 'active'} → ${next}`) },
    });
    await reload();
  }

  // Видалення — з альтернативою «в архів»: здебільшого пілот просто не грає.
  async function remove(p) {
    const res = await ask({
      title: 'ВИДАЛИТИ ПІЛОТА?',
      tone: 'danger',
      lines: [`«${p.callsign}»`, 'історія операцій і мехи зникнуть', 'відновлення: неможливе'],
      note: p.status === 'archive' ? null : 'Якщо пілот просто не грає — краще перенести в архів.',
      altLabel: p.status === 'archive' ? null : 'В АРХІВ',
      yesLabel: 'ВИДАЛИТИ',
    });
    try {
      if (res === true) {
        await api.deletePilot(p.id);
        await reload();
      } else if (res === 'alt') {
        await setArchived(p, true);
      }
    } catch (err) {
      setLoadError(err.message);
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditCallsign(p.callsign);
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id) {
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

  const activeCount = pilots.filter((p) => p.status !== 'archive').length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pilots
      .filter((p) => view === 'all' || p.status !== 'archive')
      .filter(
        (p) =>
          !needle ||
          p.callsign.toLowerCase().includes(needle) ||
          p.name.toLowerCase().includes(needle) ||
          p.mechs.some((m) => m.name.toLowerCase().includes(needle)),
      )
      // Архівні — унизу.
      .sort((a, b) => (a.status === 'archive') - (b.status === 'archive'));
  }, [pilots, view, q]);

  return (
    <PageShell>
      {dialog}
      <PageHeader
        section="FERUM VOX"
        title="ВИБІР ПІЛОТА"
        tag={<span style={{ fontSize: 11, color: 'var(--text-info)', letterSpacing: 1 }}>{pilots.length}</span>}
      />

      {loadError && <Msg kind="err">{loadError}</Msg>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" type="button" onClick={() => setFormOpen((v) => !v)}>+ НОВИЙ ПІЛОТ</button>
        <button className="btn-ghost" type="button" disabled={importBusy} onClick={() => fileInputRef.current?.click()}>
          {importBusy ? 'ІМПОРТУЄТЬСЯ…' : 'ІМПОРТ З COMP/CON'}
        </button>
        <div className="ss-note">JSON «Export Pilot». Пілот з тим самим позивним оновиться.</div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: 'none' }} />
      </div>
      {importError && <Msg kind="err">{importError}</Msg>}

      {formOpen && (
        <Panel title="НОВИЙ ПІЛОТ">
          <form onSubmit={create} className="ss-body" style={{ padding: '16px 14px' }}>
            <div className="ss-field">
              <div className="lbl">ІМ'Я</div>
              <input className="ss-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я персонажа" autoFocus />
            </div>
            <div className="ss-field">
              <div className="lbl">ПОЗИВНИЙ</div>
              <input className="ss-input" type="text" value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="Callsign" />
            </div>
            <div className="ss-field top">
              <div className="lbl">БЕКГРАУНД</div>
              <textarea className="ss-input" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="Коротка історія пілота…" rows={3} style={{ fontSize: 12 }} />
            </div>
            {error && <Msg kind="err">{error}</Msg>}
            <div className="ss-field">
              <div />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" type="submit" disabled={busy}>СТВОРИТИ</button>
                <button className="btn-ghost" type="button" onClick={() => setFormOpen(false)}>СКАСУВАТИ</button>
              </div>
            </div>
          </form>
        </Panel>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="ss-seg">
          <button type="button" className={view === 'active' ? 'on' : ''} style={{ height: 24, fontSize: 10 }} onClick={() => setView('active')}>АКТИВНІ · {activeCount}</button>
          <button type="button" className={view === 'all' ? 'on' : ''} style={{ height: 24, fontSize: 10 }} onClick={() => setView('all')}>УСІ · {pilots.length}</button>
        </div>
        <input className="ss-input sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ пошук за позивним або мехом" style={{ marginLeft: 'auto', width: 260, maxWidth: '100%' }} />
      </div>

      <div className="ss-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        {loading && <div className="ss-note" style={{ padding: 14 }}>&gt; Завантаження…</div>}
        {!loading && shown.length === 0 && (
          <div className="ss-slot" style={{ margin: 10, padding: 18, justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dimmer)' }}>
            <span style={{ flex: 1 }}>&gt; {pilots.length === 0 ? 'Пілотів ще немає.' : 'Нічого не знайдено.'}</span>
            {pilots.length === 0 && <button className="btn" type="button" onClick={() => setFormOpen(true)}>+ НОВИЙ ПІЛОТ</button>}
          </div>
        )}
        {shown.map((p, i) => {
          const archived = p.status === 'archive';
          if (editingId === p.id) {
            return (
              <div key={p.id} style={{ padding: '10px 12px', borderTop: i ? '1px solid var(--panel-border)' : 'none', borderLeft: '3px solid var(--accent)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="ss-input" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Ім'я" style={{ flex: 1, minWidth: 140 }} />
                  <input className="ss-input" type="text" value={editCallsign} onChange={(e) => setEditCallsign(e.target.value)} placeholder="Позивний" style={{ flex: 1, minWidth: 140 }} />
                </div>
                {editError && <Msg kind="err">{editError}</Msg>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" type="button" disabled={editBusy} onClick={() => saveEdit(p.id)}>ЗБЕРЕГТИ</button>
                  <button className="btn-ghost" type="button" onClick={cancelEdit}>СКАСУВАТИ</button>
                </div>
              </div>
            );
          }
          return (
            <div
              key={p.id}
              className="ss-roster-row"
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: '72px minmax(0,1fr) auto 30px',
                gap: 14,
                alignItems: 'center',
                padding: '10px 12px',
                borderTop: i ? '1px solid var(--panel-border)' : 'none',
                opacity: archived ? 0.6 : 1,
              }}
            >
              {/* Увесь рядок — посилання на профіль; меню «⋯» — окрема кнопка поверх. */}
              <Link to={`/pilots/${p.id}`} aria-label={`Профіль ${p.callsign}`} style={{ position: 'absolute', inset: 0 }} />
              <div className={portraits[p.id] ? '' : 'ss-hatch'} style={{ width: 72, height: 72, border: '1px solid var(--input-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.4 }}>
                {portraits[p.id] ? (
                  <img src={portraits[p.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
                ) : (
                  <span>NO IMAGE<br />DATA</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="title-font" style={{ fontSize: 20, letterSpacing: 1, color: 'var(--text-bright)' }}>{p.callsign}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.name}</span>
                  {archived && <span className="ss-tag bad">АРХІВ</span>}
                </div>
                {p.mechs.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-dimmer)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    ▮ {p.mechs.map((m) => m.name.toUpperCase()).join(' // ')}
                  </div>
                )}
                {p.background && p.background !== 'Бекграунд не вказано.' && (
                  <div style={{ fontSize: 11, color: 'var(--text-grey)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.background}</div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-info)', letterSpacing: 1, whiteSpace: 'nowrap' }}>T{llTier(p.ll)} · LL{p.ll}</div>
              <div>
                <Menu
                  items={[
                    { label: 'РЕДАГУВАТИ', onClick: () => startEdit(p) },
                    { label: archived ? 'З АРХІВУ' : 'В АРХІВ', onClick: () => setArchived(p, !archived).catch((err) => setLoadError(err.message)) },
                    { label: 'ВИДАЛИТИ…', danger: true, onClick: () => remove(p) },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, textAlign: 'center' }}>FERUM VOX // PILOT ROSTER</div>
    </PageShell>
  );
}
