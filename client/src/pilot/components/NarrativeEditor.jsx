import { useMemo, useState } from 'react';
import { Menu, Panel, useConfirm } from '../../components/kit.jsx';
import { gameShortLabel } from './PilotGames.jsx';

// Записник: окремі нотатки з тегом і прив'язкою до гри замість одного textarea.
// Закріплені — нагорі, далі новіші першими.

const TAGS = [
  { key: 'session', label: 'СЕСІЯ' },
  { key: 'npc', label: 'NPC' },
  { key: 'loot', label: 'ЛУТ' },
  { key: 'goals', label: 'ЦІЛІ' },
];
const tagLabel = (k) => TAGS.find((t) => t.key === k)?.label || '';

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function plural(n) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'ЗАПИС';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'ЗАПИСИ';
  return 'ЗАПИСІВ';
}

export default function NarrativeEditor({ state, dispatch, games, saving }) {
  const notes = state.notes || [];
  const [text, setText] = useState('');
  const [tag, setTag] = useState('session');
  const [gameId, setGameId] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [ask, dialog] = useConfirm();

  const gameOptions = useMemo(() => (games || []).filter((g) => g.game_slots.status !== 'cancelled'), [games]);

  function add() {
    if (!text.trim()) return;
    const g = gameOptions.find((x) => String(x.game_slots.id) === gameId);
    dispatch({ type: 'ADD_NOTE', text, tag, gameId: gameId || null, gameLabel: g ? gameShortLabel(g) : '' });
    setText('');
  }

  async function remove(n) {
    const ok = await ask({
      title: 'ВИДАЛИТИ НОТАТКУ?',
      tone: 'danger',
      lines: [`«${n.text.length > 60 ? `${n.text.slice(0, 60)}…` : n.text}»`, 'відкотити можна в журналі операцій'],
      yesLabel: 'ВИДАЛИТИ',
    });
    if (ok) dispatch({ type: 'REMOVE_NOTE', id: n.id });
  }

  const counts = TAGS.reduce((acc, t) => ({ ...acc, [t.key]: notes.filter((n) => n.tag === t.key).length }), {});
  const needle = q.trim().toLowerCase();
  const shown = notes
    .filter((n) => filter === 'all' || n.tag === filter)
    .filter((n) => !needle || n.text.toLowerCase().includes(needle) || (n.gameLabel || '').toLowerCase().includes(needle))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.date).localeCompare(String(a.date)));

  return (
    <Panel title="ЗАПИСНИК" sub={`${notes.length} ${plural(notes.length)} · ${saving ? 'ЗБЕРЕЖЕННЯ…' : 'ЗБЕРЕЖЕНО'}`}>
      {dialog}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-sunken)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent)', fontSize: 13 }}>&gt;</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
              e.preventDefault();
              add();
            }
          }}
          placeholder="нова нотатка… Enter — зберегти"
          style={{ flex: 1, minWidth: 200, height: 30, padding: 0, fontSize: 13, background: 'transparent', border: 'none' }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {TAGS.map((t) => (
            <button key={t.key} type="button" className={`ss-chip${tag === t.key ? ' on' : ''}`} onClick={() => setTag(tag === t.key ? null : t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <select className="ss-select sm" value={gameId} onChange={(e) => setGameId(e.target.value)} style={{ maxWidth: 220 }} title="Прив'язка до гри">
          <option value="">БЕЗ ГРИ</option>
          {gameOptions.map((g) => {
            const id = String(g.game_slots.id);
            return (
              <option key={g.id} value={id}>{gameShortLabel(g)}</option>
            );
          })}
        </select>
        <button className="btn" type="button" disabled={!text.trim()} onClick={add}>ДОДАТИ</button>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--panel-border)', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={`ss-chip sm${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>УСІ</button>
        {TAGS.map((t) => (
          <button key={t.key} type="button" className={`ss-chip sm${filter === t.key ? ' on' : ''}`} onClick={() => setFilter(t.key)}>
            {t.label}{counts[t.key] ? ` ${counts[t.key]}` : ''}
          </button>
        ))}
        <input className="ss-input sm m-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ пошук" style={{ marginLeft: 'auto', width: 200 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
        {shown.length === 0 && (
          <div className="ss-note" style={{ padding: '12px 14px' }}>&gt; {notes.length ? 'Нічого не знайдено.' : 'Записів ще немає.'}</div>
        )}
        {shown.map((n, i) => (
          <div
            key={n.id}
            className="m-note"
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 90px minmax(60px,140px) 60px minmax(0,1fr) 26px',
              gap: 12,
              padding: '9px 14px',
              borderTop: i ? '1px solid var(--rule)' : 'none',
              alignItems: 'baseline',
              background: n.pinned ? 'color-mix(in srgb, var(--panel-inset) 40%, transparent)' : 'transparent',
            }}
          >
            <span style={{ color: 'var(--accent)' }} title={n.pinned ? 'Закріплено' : undefined}>{n.pinned ? '▲' : ''}</span>
            <span style={{ color: 'var(--text-dimmer)' }}>{formatDate(n.date)}</span>
            <span style={{ color: 'var(--text-info)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.gameLabel}>{n.gameLabel || '—'}</span>
            <span style={{ color: 'var(--text-info)' }}>{tagLabel(n.tag)}</span>
            {editId === n.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea className="ss-input" rows={3} value={editText} autoFocus onChange={(e) => setEditText(e.target.value)} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" type="button" disabled={!editText.trim()} onClick={() => { dispatch({ type: 'UPDATE_NOTE', id: n.id, patch: { text: editText } }); setEditId(null); }}>ЗБЕРЕГТИ</button>
                  <button className="btn-ghost sm" type="button" onClick={() => setEditId(null)}>СКАСУВАТИ</button>
                </div>
              </div>
            ) : (
              <span style={{ color: 'var(--text-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.text}</span>
            )}
            <Menu
              small
              items={[
                { label: n.pinned ? 'ВІДКРІПИТИ' : 'ЗАКРІПИТИ', onClick: () => dispatch({ type: 'TOGGLE_NOTE_PIN', id: n.id }) },
                { label: 'РЕДАГУВАТИ', onClick: () => { setEditId(n.id); setEditText(n.text); } },
                ...TAGS.filter((t) => t.key !== n.tag).map((t) => ({ label: `ТЕГ → ${t.label}`, onClick: () => dispatch({ type: 'UPDATE_NOTE', id: n.id, patch: { tag: t.key } }) })),
                { label: 'ВИДАЛИТИ…', danger: true, onClick: () => remove(n) },
              ]}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}
