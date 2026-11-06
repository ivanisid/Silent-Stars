import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Menu, Msg, PageHeader, PageShell, Panel, useConfirm } from '../components/kit.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useIsMobile } from '../useMobile';
import { api } from '../api';
import { KINDS, backlinks, docText, entryDoc, filterEntries, formatDate, kindLabel, visibilityLabel } from '../chronicle/markup.js';
import DocView from '../chronicle/DocView.jsx';
import { useImageUrls } from '../chronicle/images.js';

// Хроніка ГМів (/chronicle): записи (тип задають теги), звіти ігор і події світу.
// Доступ запису: лише автор / усі ГМи / усі. Приватний змінює лише автор, спільний — будь-який ГМ;
// доступ змінює й запис видаляє лише автор. Специфікація — docs/chronicle-spec.md.
//
// Угорі — пошук, тип, формат перегляду й теги. Формати: СПИСОК (список + запис поруч),
// КАРТКИ (сітка з портретами), СТРІЧКА (записи повністю, новіші першими).
// Редактор — окремий екран (?edit=<id|new>), завантажується окремо (chronicle/ChronicleEditor.jsx).

const ChronicleEditor = lazy(() => import('../chronicle/ChronicleEditor.jsx'));

const VIEWS = [
  { key: 'list', label: 'СПИСОК' },
  { key: 'cards', label: 'КАРТКИ' },
  { key: 'feed', label: 'СТРІЧКА' },
];
const VIEW_KEY = 'ferumvox.chronicle.view';

function readView() {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.key === v) ? v : 'list';
  } catch {
    return 'list';
  }
}

const entryDate = (e) => (e.kind === 'report' ? e.game?.game_at : e.kind === 'event' ? e.eventDate : e.updatedAt);

function excerpt(text, n = 160) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function EntryView({ entry, canEdit, canDelete, tagsById, nicks, byId, entries, roster, portraitUrl, onOpen, onEdit, onDelete, busy, compact }) {
  const refs = backlinks(entries, entry.id);
  const mobile = useIsMobile();
  const actions = canEdit || canDelete ? (
    <>
      {canEdit && <button type="button" className="btn-ghost sm" disabled={busy} onClick={onEdit}>ЗМІНИТИ</button>}
      {canDelete && <button type="button" className="btn-danger sm" disabled={busy} onClick={onDelete}>ВИДАЛИТИ</button>}
    </>
  ) : null;
  return (
    <Panel id={compact ? `e-${entry.id}` : undefined} title={entry.title} right={mobile ? null : actions}>
      {mobile && actions && <div className="ss-chron-acts">{actions}</div>}
      <div className={`ss-chron-head${portraitUrl ? ' has-img' : ''}`}>
        {portraitUrl && <img className="portrait" src={portraitUrl} alt="" />}
        <div className="info">
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
            {entry.updatedBy && entry.updatedBy !== entry.authorId ? (
              <>
                <dd>{nicks[entry.authorId] || '—'} · {formatDate(entry.createdAt)}</dd>
                <dt>ЗМІНИВ</dt>
                <dd>{nicks[entry.updatedBy] || '—'} · {formatDate(entry.updatedAt)}</dd>
              </>
            ) : (
              <dd>{nicks[entry.authorId] || '—'} · {formatDate(entry.updatedAt)}</dd>
            )}
          </dl>
        </div>
      </div>
      <DocView doc={entryDoc(entry)} byId={byId} onOpen={onOpen} />
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

function RowMeta({ e, tagsById }) {
  const date = formatDate(entryDate(e));
  return (
    <span className="m">
      <span className="k">{kindLabel(e.kind)}</span>
      {date && <span>{date}</span>}
      {e.tagIds.map((t) => tagsById.get(t)?.name).filter(Boolean).map((name) => (
        <span key={name} className="tg">{name}</span>
      ))}
    </span>
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
  const [kind, setKind] = useState('all');
  const [tagFilter, setTagFilter] = useState([]);
  const [q, setQ] = useState('');
  const [view, setViewState] = useState(readView);
  const [ask, confirmEl] = useConfirm();

  const setView = (v) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // перегляд просто не запам'ятається
    }
  };

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

  const editParam = params.get('edit');
  useEffect(() => {
    if (editParam && games == null) {
      api.listChronicleGames().then(setGames).catch((err) => setError(err.message));
    }
  }, [editParam, games]);

  const { entries, tags, nicks } = data;
  const byId = useMemo(() => new Map(entries.map((e) => [e.id.toLowerCase(), e])), [entries]);
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const shown = useMemo(() => filterEntries(entries, { kind, tagIds: tagFilter, q }), [entries, kind, tagFilter, q]);
  const portraits = useImageUrls(entries.map((e) => e.portrait));

  const paramId = params.get('e');
  const selectedId = paramId || (view === 'list' && !mobile ? shown[0]?.id : null);
  const selected = selectedId ? byId.get(selectedId.toLowerCase()) : null;

  // Склад гри для звітів, які зараз на екрані.
  const rosterSlots = useMemo(() => {
    const list = view === 'feed' && !paramId ? shown : selected ? [selected] : [];
    return [...new Set(list.filter((e) => e.kind === 'report' && e.slotId).map((e) => e.slotId))];
  }, [view, paramId, shown, selected]);
  useEffect(() => {
    const need = rosterSlots.filter((s) => !rosters[s]);
    need.forEach((slot) =>
      api
        .chronicleGameRoster(slot)
        .then((r) => setRosters((m) => ({ ...m, [slot]: r })))
        .catch((err) => setError(err.message)),
    );
  }, [rosterSlots, rosters]);

  if (role == null) return null;
  if (!isGm) return <Navigate to="/pilots" replace />;

  const open = (id) => {
    setParams(id ? { e: id } : {});
    if (mobile || view !== 'list') window.scrollTo(0, 0);
  };
  const edit = (id) => setParams({ edit: id || 'new' });
  const toggleTagFilter = (id) => setTagFilter((f) => (f.includes(id) ? f.filter((t) => t !== id) : [...f, id]));
  const canEdit = (e) => e.authorId === user?.id || e.visibility !== 'private';

  async function save(draft) {
    const id = await api.saveChronicleEntry(draft);
    await load();
    setParams({ e: id });
    window.scrollTo(0, 0);
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

  // ----- Редактор: окремий екран -----
  if (editParam) {
    const entry = editParam === 'new' ? null : byId.get(editParam.toLowerCase());
    if (editParam !== 'new' && !loaded) return <PageShell />;
    return (
      <PageShell className="ss-ced-page">
        {editParam !== 'new' && !entry ? (
          <Msg kind="err">Запис не знайдено.</Msg>
        ) : (
          <Suspense fallback={null}>
            <ChronicleEditor
              key={editParam}
              entry={entry}
              entries={entries}
              tags={tags}
              games={games || []}
              userId={user?.id}
              onCancel={() => setParams(entry ? { e: entry.id } : {})}
              onSave={save}
              onAddTag={addTag}
            />
          </Suspense>
        )}
        {confirmEl}
      </PageShell>
    );
  }

  const viewProps = (e) => ({
    entry: e,
    canEdit: canEdit(e),
    canDelete: e.authorId === user?.id,
    tagsById,
    nicks,
    byId,
    entries,
    roster: e.slotId ? rosters[e.slotId] : [],
    portraitUrl: e.portrait ? portraits[e.portrait] : null,
    busy,
    onOpen: open,
    onEdit: () => edit(e.id),
    onDelete: () => removeEntry(e),
  });

  const myTags = tags.filter((t) => t.created_by === user?.id);
  // Окремий запис на всю ширину: телефон, а також КАРТКИ й СТРІЧКА після кліку.
  const single = paramId && selected && (mobile || view !== 'list');

  const bar = (
    <Panel className="ss-chron-bar">
      <div className="r1">
        <input className="ss-input" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ пошук" aria-label="Пошук" />
        <div className="ss-seg">
          <button type="button" className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>ВСЕ</button>
          {KINDS.map((k) => (
            <button key={k.key} type="button" className={kind === k.key ? 'on' : ''} onClick={() => setKind(k.key)}>{k.label}</button>
          ))}
        </div>
        <div className="ss-seg">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" className={view === v.key ? 'on' : ''} aria-pressed={view === v.key} onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="r2">
          <div className="ss-chron-tags">
            {tags.map((t) => (
              <button key={t.id} type="button" className={`ss-chip sm${tagFilter.includes(t.id) ? ' on' : ''}`} aria-pressed={tagFilter.includes(t.id)} onClick={() => toggleTagFilter(t.id)}>{t.name}</button>
            ))}
          </div>
          {myTags.length > 0 && (
            <Menu small title="Теги" items={[{ header: 'ВИДАЛИТИ ТЕГ' }, ...myTags.map((t) => ({ label: t.name, danger: true, onClick: () => removeTag(t) }))]} />
          )}
        </div>
      )}
    </Panel>
  );

  const empty = loaded && shown.length === 0 ? (
    <div className="ss-chron-empty"><span className="pre">&gt; </span>Нічого не знайдено.</div>
  ) : null;

  let content;
  if (single) {
    content = <div className="ss-chron-main">{selected && <EntryView {...viewProps(selected)} />}</div>;
  } else if (view === 'cards') {
    content = (
      <>
        <div className="ss-chron-cards">
          {shown.map((e) => {
            const img = e.portrait ? portraits[e.portrait] : null;
            return (
              <button key={e.id} type="button" className="card" onClick={() => open(e.id)}>
                <span className={`pic${img ? '' : ' none'}`}>{img ? <img src={img} alt="" loading="lazy" /> : <span>{kindLabel(e.kind)}</span>}</span>
                <span className="t">{e.title}</span>
                <RowMeta e={e} tagsById={tagsById} />
                {e.body && <span className="x">{excerpt(e.doc ? e.body : docText(entryDoc(e)))}</span>}
              </button>
            );
          })}
        </div>
        {empty}
      </>
    );
  } else if (view === 'feed') {
    content = (
      <div className="ss-chron-main feed">
        {shown.map((e) => <EntryView key={e.id} compact {...viewProps(e)} />)}
        {empty}
      </div>
    );
  } else {
    content = (
      <div className="ss-chron">
        <Panel className="ss-chron-side" title="ЗАПИСИ" sub={String(shown.length)}>
          <div className="ss-chron-list">
            {shown.map((e) => {
              const img = e.portrait ? portraits[e.portrait] : null;
              return (
                <button key={e.id} type="button" className={`row${selected?.id === e.id ? ' on' : ''}`} onClick={() => open(e.id)}>
                  {img && <img className="thumb" src={img} alt="" loading="lazy" />}
                  <span className="txt">
                    <span className="t">{e.title}</span>
                    <RowMeta e={e} tagsById={tagsById} />
                  </span>
                </button>
              );
            })}
            {empty}
          </div>
        </Panel>
        {!mobile && <div className="ss-chron-main">{selected && <EntryView {...viewProps(selected)} />}</div>}
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader
        section="SILENT STARS"
        sectionTo={single ? () => open(null) : undefined}
        title="ХРОНІКА"
        right={<button type="button" className="btn-gm" onClick={() => edit(null)}>+ НОВИЙ</button>}
      />
      {error && <Msg kind="err">{error}</Msg>}
      {!single && bar}
      {content}
      {confirmEl}
    </PageShell>
  );
}
