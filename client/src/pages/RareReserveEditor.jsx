import { useState } from 'react';
import { api } from '../api';
import { Msg, useConfirm } from '../components/kit.jsx';
import { RARE_RANKS, TAG_KINDS, loadRareCatalog } from '../pilot/rareReserves';

// ГМ-редактори каталогу рідкісних резервів: картка резерву і список тегів.
// Після кожного збереження каталог перечитується з бази — його бачать і редюсер,
// і всі відкриті списки.

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>{label}</span>
      {children}
    </label>
  );
}

const EMPTY = { key: null, rank: 1, name: '', action: '', traits: '', desc: '', flavor: '', tagIds: [] };

// reserve — null для нового резерву.
export function RareReserveEditor({ reserve, tags, onClose }) {
  const [f, setF] = useState(() => (reserve ? { ...EMPTY, ...reserve, tagIds: [...reserve.tagIds] } : EMPTY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const toggleTag = (id) =>
    setF((cur) => ({ ...cur, tagIds: cur.tagIds.includes(id) ? cur.tagIds.filter((x) => x !== id) : [...cur.tagIds, id] }));

  async function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Вкажіть назву резерву.');
    setBusy(true);
    setError('');
    try {
      await api.gmSaveRareReserve(f);
      await loadRareCatalog(true);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-box gm" style={{ width: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-header">{reserve ? 'РЕДАГУВАТИ РЕЗЕРВ' : 'НОВИЙ РІДКІСНИЙ РЕЗЕРВ'}</div>
        <div className="modal-body" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="НАЗВА" style={{ flex: 1, minWidth: 220 }}>
              <input className="ss-input" type="text" value={f.name} onChange={set('name')} autoFocus />
            </Field>
            <Field label="РАНГ">
              <div style={{ display: 'flex', gap: 6 }}>
                {RARE_RANKS.map((rk) => (
                  <button key={rk} type="button" className={`ss-chip${f.rank === rk ? ' on' : ''}`} onClick={() => setF((cur) => ({ ...cur, rank: rk }))}>
                    РАНГ {rk}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="ДІЯ" style={{ flex: 1, minWidth: 180 }}>
              <input className="ss-input" type="text" value={f.action} onChange={set('action')} placeholder="Quick Action" />
            </Field>
            <Field label="ВЛАСТИВОСТІ" style={{ flex: 1, minWidth: 180 }}>
              <input className="ss-input" type="text" value={f.traits} onChange={set('traits')} placeholder="1/round, Limited 2" />
            </Field>
          </div>
          <Field label="ЕФЕКТ">
            <textarea className="ss-input" rows={4} value={f.desc} onChange={set('desc')} style={{ fontSize: 12 }} />
          </Field>
          <Field label="ОПИС (FLAVOR)">
            <textarea className="ss-input" rows={2} value={f.flavor} onChange={set('flavor')} style={{ fontSize: 12 }} />
          </Field>
          <Field label="ТЕГИ">
            {tags.length === 0 ? (
              <div className="ss-note">Тегів ще немає — створіть їх кнопкою «ТЕГИ» над списком.</div>
            ) : (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {tags.map((t) => (
                  <button key={t.id} type="button" className={`ss-chip sm${f.tagIds.includes(t.id) ? ' on' : ''}`} onClick={() => toggleTag(t.id)}>
                    {t.kind === 'faction' ? '◆ ' : ''}{t.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
          {error && <Msg kind="err">{error}</Msg>}
          <div className="modal-actions">
            <button className="btn-ghost" type="button" onClick={onClose} disabled={busy}>СКАСУВАТИ</button>
            <button className="btn-gm" type="submit" disabled={busy}>{busy ? 'ЗБЕРЕЖЕННЯ…' : 'ЗБЕРЕГТИ'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function TagManager({ tags, reserves, onClose }) {
  const [ask, dialog] = useConfirm();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('faction');
  const [editing, setEditing] = useState(null); // { id, name, kind }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await loadRareCatalog(true);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await run(() => api.gmSaveReserveTag({ name, kind }))) setName('');
  }

  async function saveEdit() {
    if (await run(() => api.gmSaveReserveTag(editing))) setEditing(null);
  }

  async function remove(t) {
    const used = reserves.filter((r) => r.tagIds.includes(t.id)).length;
    const ok = await ask({
      title: 'ВИДАЛИТИ ТЕГ?',
      tone: 'danger',
      lines: [`«${t.name}»`, used ? `тег зніметься з ${used} резерв(ів); самі резерви лишаться` : 'тег ще ні на чому не висить'],
      yesLabel: 'ВИДАЛИТИ',
    });
    if (ok) run(() => api.gmDeleteReserveTag(t.id));
  }

  const kindLabel = (k) => TAG_KINDS.find((x) => x.key === k)?.label || k;
  const KindPicker = ({ value, onPick }) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {TAG_KINDS.map((k) => (
        <button key={k.key} type="button" className={`ss-chip sm${value === k.key ? ' on' : ''}`} onClick={() => onPick(k.key)}>
          {k.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {dialog}
      <div className="modal-box gm" style={{ width: 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ТЕГИ РЕЗЕРВІВ</div>
        <div className="modal-body" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="ss-note">
            Теги лише для фільтрування: перед грою гравці відбирають резерви фракцій, з якими
            домовились. Додаток нічого не забороняє.
          </div>
          <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="ss-input sm" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва нового тегу" style={{ flex: 1, minWidth: 180 }} />
            <KindPicker value={kind} onPick={setKind} />
            <button className="btn-gm sm" type="submit" disabled={busy || !name.trim()}>+ ДОДАТИ</button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tags.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>&gt; Тегів ще немає.</div>}
            {tags.map((t) => {
              const used = reserves.filter((r) => r.tagIds.includes(t.id)).length;
              const isEditing = editing?.id === t.id;
              return (
                <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 10px', border: '1px solid var(--input-border)', background: 'var(--panel)' }}>
                  {isEditing ? (
                    <>
                      <input className="ss-input sm" type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ flex: 1, minWidth: 160 }} autoFocus />
                      <KindPicker value={editing.kind} onPick={(k) => setEditing({ ...editing, kind: k })} />
                      <button className="btn-gm sm" type="button" disabled={busy || !editing.name.trim()} onClick={saveEdit}>ЗБЕРЕГТИ</button>
                      <button className="btn-ghost sm" type="button" disabled={busy} onClick={() => setEditing(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <span className={`ss-tag${t.kind === 'faction' ? ' gm' : ''}`}>{t.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1, flex: 1 }}>
                        {kindLabel(t.kind)} · РЕЗЕРВІВ {used}
                      </span>
                      <button className="btn-ghost sm" type="button" disabled={busy} onClick={() => setEditing({ id: t.id, name: t.name, kind: t.kind })}>ЗМІНИТИ</button>
                      <button className="btn-danger sm" type="button" disabled={busy} onClick={() => remove(t)}>ВИДАЛИТИ</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {error && <Msg kind="err">{error}</Msg>}
          <button className="btn-ghost" type="button" onClick={onClose} style={{ alignSelf: 'flex-end' }}>ЗАКРИТИ</button>
        </div>
      </div>
    </div>
  );
}
