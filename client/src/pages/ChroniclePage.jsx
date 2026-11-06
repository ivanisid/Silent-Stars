import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Menu, Msg, PageHeader, PageShell, Panel, useConfirm } from '../components/kit.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useIsMobile } from '../useMobile';
import { api } from '../api';
import {
  KINDS, VISIBILITY, backlinks, filterEntries, formatDate, insertMention, kindLabel, mentionQuery, mentionSuggestions, paragraphs, tokenize, visibilityLabel,
} from '../chronicle/markup.js';

// Хроніка ГМів (/chronicle): записи (тип задають теги), звіти ігор і події світу.
// Доступ запису: лише автор / усі ГМи / усі. Змінює й видаляє лише автор.
// Специфікація — docs/chronicle-spec.md, логіка розмітки й фільтра — chronicle/markup.js.

function Inline({ tokens, byId, onOpen }) {
  return tokens.map((x, i) => {
    if (x.t === 'bold') return <strong key={i}><Inline tokens={x.v} byId={byId} onOpen={onOpen} /></strong>;
    if (x.t === 'link') return <a key={i} href={x.href} target="_blank" rel="noopener noreferrer">{x.v}</a>;
    if (x.t === 'mention') {
      const target = byId.get(x.id);
      return target ? (
        <button key={i} type="button" className="ss-mention" onClick={() => onOpen(target.id)}>{target.title}</button>
      ) : (
        <span key={i} className="ss-mention off">{x.v}</span>
      );
    }
    return x.v;
  });
}

function EntryText({ text, byId, onOpen }) {
  const ps = paragraphs(text);
  if (ps.length === 0) return null;
  return (
    <div className="ss-prose">
      {ps.map((p, i) => (
        <p key={i}><Inline tokens={tokenize(p)} byId={byId} onOpen={onOpen} /></p>
      ))}
    </div>
  );
}

function EntryView({ entry, mine, tagsById, nicks, byId, entries, roster, onOpen, onEdit, onDelete, busy }) {
  const refs = backlinks(entries, entry.id);
  const mobile = useIsMobile();
  const actions = mine ? (
    <>
      <button type="button" className="btn-ghost sm" disabled={busy} onClick={onEdit}>ЗМІНИТИ</button>
      <button type="button" className="btn-danger sm" disabled={busy} onClick={onDelete}>ВИДАЛИТИ</button>
    </>
  ) : null;
  return (
    <Panel title={entry.title} right={mobile ? null : actions}>
      {mobile && actions && <div className="ss-chron-acts">{actions}</div>}
      <div className="ss-chron-meta">
        <span className="ss-tag accent">{kindLabel(entry.kind)}</span>
        <span className="ss-tag gm">{visibilityLabel(entry.visibility)}</span>
        {entry.tagIds.map((t) => tagsById.get(t)).filter(Boolean).map((t) => (
          <span key={t.id} className="ss-tag">{t.name}</span>
        ))}
      </div>
      <dl className="ss-chron-facts">
        {entry.kind === 'report' && (
          <>
            <dt>ГРА</dt>
            <dd>{entry.game ? `${formatDate(entry.game.game_at)} · ${entry.game.title || '—'}` : '—'}</dd>
            <dt>СКЛАД</dt>
            <dd>{roster == null ? '…' : roster.length ? roster.map((r) => r.callsign).join(', ') : '—'}</dd>
          </>
        )}
        {entry.kind === 'event' && (
          <>
            <dt>ДАТА</dt>
            <dd>{formatDate(entry.eventDate) || '—'}</dd>
          </>
        )}
        <dt>АВТОР</dt>
        <dd>{nicks[entry.authorId] || '—'} · {formatDate(entry.updatedAt)}</dd>
      </dl>
      <EntryText text={entry.body} byId={byId} onOpen={onOpen} />
      {refs.length > 0 && (
        <div className="ss-chron-refs">
          <div className="lbl">ЗГАДКИ</div>
          {refs.map((r) => (
            <button key={r.id} type="button" className="ss-mention" onClick={() => onOpen(r.id)}>{r.title}</button>
          ))}
        </div>
      )}
    </Panel>
  );
}

// Текст із підказками згадок: «@» + перші літери назви → список записів.
function MentionArea({ value, onChange, entries, selfId }) {
  const ref = useRef(null);
  const [mq, setMq] = useState(null);
  const [idx, setIdx] = useState(0);
  const list = mq ? mentionSuggestions(entries, mq.query, selfId) : [];
  const open = list.length > 0;

  const track = (el) => {
    const next = el.selectionStart === el.selectionEnd ? mentionQuery(el.value, el.selectionStart) : null;
    setMq(next);
    setIdx(0);
  };

  const pick = (entry) => {
    const el = ref.current;
    const r = insertMention(value, mq, entry, el.selectionStart);
    onChange(r.text);
    setMq(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.caret, r.caret);
    });
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => (i + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => (i - 1 + list.length) % list.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(list[Math.min(idx, list.length - 1)]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMq(null);
    }
  };

  return (
    <div className="ss-chron-area">
      <textarea
        ref={ref}
        className="ss-input"
        rows={12}
        aria-label="ТЕКСТ"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          track(e.target);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => !['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key) && track(e.target)}
        onClick={(e) => track(e.target)}
        onBlur={() => setTimeout(() => setMq(null), 150)}
      />
      {open && (
        <div className="ss-chron-sugg" role="listbox">
          {list.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="option"
              aria-selected={i === idx}
              className={i === idx ? 'on' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(x)}
            >
              <span className="t">{x.title}</span>
              <span className="k">{kindLabel(x.kind)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryEditor({ entry, entries, tags, games, userId, onCancel, onSave, onAddTag }) {
  const [draft, setDraft] = useState(() => ({
    kind: entry?.kind || 'record',
    title: entry?.title || '',
    body: entry?.body || '',
    visibility: entry?.visibility || 'private',
    slotId: entry?.slotId || '',
    eventDate: entry?.eventDate || '',
    tagIds: entry?.tagIds || [],
  }));
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleTag = (id) => set({ tagIds: draft.tagIds.includes(id) ? draft.tagIds.filter((t) => t !== id) : [...draft.tagIds, id] });

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    setError('');
    try {
      const tag = await onAddTag(name, userId);
      setNewTag('');
      setDraft((d) => (d.tagIds.includes(tag.id) ? d : { ...d, tagIds: [...d.tagIds, tag.id] }));
    } catch (err) {
      setError(err.message);
    }
  }

  function pickGame(slotId) {
    const g = games.find((x) => x.id === slotId);
    set({ slotId, ...(g && !draft.title.trim() ? { title: g.title || '' } : null) });
  }

  async function save(e) {
    e.preventDefault();
    if (!draft.title.trim()) return setError('Вкажіть назву.');
    setBusy(true);
    setError('');
    try {
      await onSave({ ...draft, id: entry?.id || null, title: draft.title.trim() });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Panel title={draft.title || ' '} tone="gm">
      <form className="ss-rule-ed ss-chron-ed" onSubmit={save}>
        <div className="row">
          <div className="fld">
            <span className="lbl">ТИП</span>
            <div className="ss-seg">
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={draft.kind === k.key ? 'on' : ''} aria-pressed={draft.kind === k.key} onClick={() => set({ kind: k.key })}>{k.label}</button>
              ))}
            </div>
          </div>
          <div className="fld">
            <span className="lbl">ДОСТУП</span>
            <div className="ss-seg">
              {VISIBILITY.map((v) => (
                <button key={v.key} type="button" className={draft.visibility === v.key ? 'on' : ''} aria-pressed={draft.visibility === v.key} onClick={() => set({ visibility: v.key })}>{v.label}</button>
              ))}
            </div>
          </div>
        </div>

        {draft.kind === 'report' && (
          <label className="fld">
            <span className="lbl">ГРА</span>
            <select className="ss-select" value={draft.slotId} onChange={(e) => pickGame(e.target.value)}>
              <option value="">—</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>{`${formatDate(g.game_at)} · ${g.title || '—'}`}</option>
              ))}
            </select>
          </label>
        )}

        {draft.kind === 'event' && (
          <label className="fld">
            <span className="lbl">ДАТА</span>
            <input className="ss-input" type="date" value={draft.eventDate} onChange={(e) => set({ eventDate: e.target.value })} />
          </label>
        )}

        <label className="fld">
          <span className="lbl">НАЗВА</span>
          <input className="ss-input" type="text" maxLength={120} value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!entry} />
        </label>

        <div className="fld">
          <span className="lbl">ТЕГИ</span>
          <div className="ss-chron-tags">
            {tags.map((t) => (
              <button key={t.id} type="button" className={`ss-chip sm${draft.tagIds.includes(t.id) ? ' on' : ''}`} aria-pressed={draft.tagIds.includes(t.id)} onClick={() => toggleTag(t.id)}>{t.name}</button>
            ))}
            <span className="add">
              <input
                className="ss-input sm"
                type="text"
                maxLength={32}
                aria-label="НОВИЙ ТЕГ"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <button type="button" className="btn-gm sm" disabled={!newTag.trim()} onClick={addTag}>+ ТЕГ</button>
            </span>
          </div>
        </div>

        <div className="fld">
          <span className="lbl">ТЕКСТ</span>
          <MentionArea value={draft.body} onChange={(body) => set({ body })} entries={entries} selfId={entry?.id} />
        </div>

        {error && <Msg kind="err">{error}</Msg>}

        <div className="foot">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>СКАСУВАТИ</button>
          <button type="submit" className="btn-gm" disabled={busy}>{busy ? 'ЗБЕРЕЖЕННЯ…' : 'ЗБЕРЕГТИ'}</button>
        </div>
      </form>
    </Panel>
  );
}

export default function ChroniclePage() {
  const { user, role, isGm } = useAuth();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ entries: [], tags: [], nicks: {} });
  const [loaded, setLoaded] = useState(false);
  const [games, setGames] = useState(null);
  const [rosters, setRosters] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // editing: null — перегляд; { entry: null } — новий запис; { entry } — зміна наявного.
  const [editing, setEditing] = useState(null);
  const [kind, setKind] = useState('all');
  const [tagFilter, setTagFilter] = useState([]);
  const [q, setQ] = useState('');
  const [ask, confirmEl] = useConfirm();

  const load = useCallback(async () => {
    try {
      setData(await api.listChronicle());
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (isGm) load();
  }, [isGm, load]);

  useEffect(() => {
    if (editing && games == null) {
      api.listChronicleGames().then(setGames).catch((err) => setError(err.message));
    }
  }, [editing, games]);

  const { entries, tags, nicks } = data;
  const byId = useMemo(() => new Map(entries.map((e) => [e.id.toLowerCase(), e])), [entries]);
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const shown = useMemo(() => filterEntries(entries, { kind, tagIds: tagFilter, q }), [entries, kind, tagFilter, q]);

  const paramId = params.get('e');
  const selectedId = paramId || (!mobile && !editing ? shown[0]?.id : null);
  const selected = selectedId ? byId.get(selectedId.toLowerCase()) : null;

  const rosterSlot = selected?.kind === 'report' ? selected.slotId : null;
  useEffect(() => {
    if (!rosterSlot || rosters[rosterSlot]) return;
    api
      .chronicleGameRoster(rosterSlot)
      .then((r) => setRosters((m) => ({ ...m, [rosterSlot]: r })))
      .catch((err) => setError(err.message));
  }, [rosterSlot, rosters]);

  if (role == null) return null;
  if (!isGm) return <Navigate to="/pilots" replace />;

  const open = (id) => {
    setEditing(null);
    setParams(id ? { e: id } : {});
    if (mobile) window.scrollTo(0, 0);
  };

  const toggleTagFilter = (id) => setTagFilter((f) => (f.includes(id) ? f.filter((t) => t !== id) : [...f, id]));

  async function save(draft) {
    const id = await api.saveChronicleEntry(draft);
    setEditing(null);
    await load();
    setParams({ e: id });
  }

  async function addTag(name, userId) {
    const tag = await api.addChronicleTag(name, userId);
    setData((d) => ({ ...d, tags: [...d.tags, tag].sort((a, b) => a.name.localeCompare(b.name, 'uk')) }));
    return tag;
  }

  async function removeEntry(entry) {
    const ok = await ask({ title: 'ВИДАЛИТИ', question: entry.title, tone: 'danger', yesLabel: 'ВИДАЛИТИ' });
    if (ok !== true) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteChronicleEntry(entry.id);
      setParams({});
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function removeTag(tag) {
    const ok = await ask({ title: 'ВИДАЛИТИ ТЕГ', question: tag.name, tone: 'danger', yesLabel: 'ВИДАЛИТИ' });
    if (ok !== true) return;
    setError('');
    try {
      await api.deleteChronicleTag(tag.id);
      setTagFilter((f) => f.filter((t) => t !== tag.id));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const myTags = tags.filter((t) => t.created_by === user?.id);
  const showMain = !mobile || editing || paramId;
  const showList = !mobile || (!editing && !paramId);

  const list = (
    <Panel
      className="ss-chron-side"
      title="ЗАПИСИ"
      sub={String(shown.length)}
      right={myTags.length > 0 ? (
        <Menu small title="Теги" items={[{ header: 'ВИДАЛИТИ ТЕГ' }, ...myTags.map((t) => ({ label: t.name, danger: true, onClick: () => removeTag(t) }))]} />
      ) : null}
    >
      <div className="ss-chron-filters">
        <div className="ss-seg sm">
          <button type="button" className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>ВСЕ</button>
          {KINDS.map((k) => (
            <button key={k.key} type="button" className={kind === k.key ? 'on' : ''} onClick={() => setKind(k.key)}>{k.label}</button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="ss-chron-tags">
            {tags.map((t) => (
              <button key={t.id} type="button" className={`ss-chip sm${tagFilter.includes(t.id) ? ' on' : ''}`} aria-pressed={tagFilter.includes(t.id)} onClick={() => toggleTagFilter(t.id)}>{t.name}</button>
            ))}
          </div>
        )}
        <input className="ss-input sm" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ пошук" />
      </div>
      <div className="ss-chron-list">
        {shown.map((e) => {
          const date = e.kind === 'report' ? e.game?.game_at : e.kind === 'event' ? e.eventDate : e.updatedAt;
          return (
            <button key={e.id} type="button" className={`row${selected?.id === e.id && !editing ? ' on' : ''}`} onClick={() => open(e.id)}>
              <span className="t">{e.title}</span>
              <span className="m">
                <span className="k">{kindLabel(e.kind)}</span>
                {formatDate(date) && <span>{formatDate(date)}</span>}
                {e.tagIds.map((t) => tagsById.get(t)?.name).filter(Boolean).map((name) => (
                  <span key={name} className="tg">{name}</span>
                ))}
              </span>
            </button>
          );
        })}
        {loaded && shown.length === 0 && (
          <div className="empty"><span className="pre">&gt; </span>Нічого не знайдено.</div>
        )}
      </div>
    </Panel>
  );

  let main = null;
  if (editing) {
    main = (
      <EntryEditor
        key={editing.entry?.id || 'new'}
        entry={editing.entry}
        entries={entries}
        tags={tags}
        games={games || []}
        userId={user?.id}
        onCancel={() => setEditing(null)}
        onSave={save}
        onAddTag={addTag}
      />
    );
  } else if (selected) {
    main = (
      <EntryView
        entry={selected}
        mine={selected.authorId === user?.id}
        tagsById={tagsById}
        nicks={nicks}
        byId={byId}
        entries={entries}
        roster={selected.slotId ? rosters[selected.slotId] : []}
        busy={busy}
        onOpen={open}
        onEdit={() => setEditing({ entry: selected })}
        onDelete={() => removeEntry(selected)}
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        section="SILENT STARS"
        sectionTo={mobile && (editing || paramId) ? () => open(null) : undefined}
        title="ХРОНІКА"
        right={!editing ? (
          <button type="button" className="btn-gm" onClick={() => setEditing({ entry: null })}>+ НОВИЙ</button>
        ) : null}
      />
      {error && <Msg kind="err">{error}</Msg>}
      <div className="ss-chron">
        {showList && list}
        {showMain && <div className="ss-chron-main">{main}</div>}
      </div>
      {confirmEl}
    </PageShell>
  );
}
