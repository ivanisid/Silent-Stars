import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Msg, Panel, useConfirm } from '../components/kit.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useIsMobile } from '../useMobile';
import { api } from '../api';
import { backlinks, entryDoc, filterDocs, formatDate, visibilityLabel } from '../gmdocs/markup.js';
import DocView from '../gmdocs/DocView.jsx';

// Вкладка ДОКУМЕНТИ в ГМ-панелі: документи ГМів — назва й текст (візуальний редактор).
// Доступ: «Для всіх ГМів» або «Лише для мене». Спільний документ змінює будь-який ГМ, приватний —
// лише автор; доступ змінює і документ видаляє лише автор. Специфікація — docs/gm-documents-spec.md.
// Адреса: ?doc=<id> — відкритий документ, ?edit=<id|new> — редактор (завантажується окремо).

const DocEditor = lazy(() => import('../gmdocs/DocEditor.jsx'));

function DocPanel({ doc, canEdit, canDelete, nicks, byId, docs, busy, mobile, onOpen, onBack, onEdit, onDelete }) {
  const refs = backlinks(docs, doc.id);
  const actions = canEdit || canDelete ? (
    <>
      {canEdit && <button type="button" className="btn-ghost sm" disabled={busy} onClick={onEdit}>ЗМІНИТИ</button>}
      {canDelete && <button type="button" className="btn-danger sm" disabled={busy} onClick={onDelete}>ВИДАЛИТИ</button>}
    </>
  ) : null;
  return (
    <Panel title={doc.title} right={mobile ? null : actions}>
      {mobile && (
        <div className="ss-gdocs-acts">
          <button type="button" className="btn-ghost sm" onClick={onBack}>‹ ДОКУМЕНТИ</button>
          {actions}
        </div>
      )}
      <div className="ss-gdocs-meta">
        <span className="ss-tag gm">{visibilityLabel(doc.visibility)}</span>
        <dl>
          <dt>АВТОР</dt>
          {doc.updatedBy && doc.updatedBy !== doc.authorId ? (
            <>
              <dd>{nicks[doc.authorId] || '—'} · {formatDate(doc.createdAt)}</dd>
              <dt>ЗМІНИВ</dt>
              <dd>{nicks[doc.updatedBy] || '—'} · {formatDate(doc.updatedAt)}</dd>
            </>
          ) : (
            <dd>{nicks[doc.authorId] || '—'} · {formatDate(doc.updatedAt)}</dd>
          )}
        </dl>
      </div>
      <DocView doc={entryDoc(doc)} byId={byId} onOpen={onOpen} />
      {refs.length > 0 && (
        <div className="ss-gdocs-refs">
          <div className="lbl">ЗГАДКИ</div>
          {refs.map((r) => (
            <button key={r.id} type="button" className="ss-mention" onClick={() => onOpen(r.id)}>{r.title}</button>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function GmDocsSection() {
  const { user } = useAuth();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ docs: [], nicks: {} });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [ask, confirmEl] = useConfirm();

  const load = useCallback(async () => {
    try {
      setData(await api.listGmDocs());
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { docs, nicks } = data;
  const byId = useMemo(() => new Map(docs.map((d) => [d.id.toLowerCase(), d])), [docs]);
  const shown = useMemo(() => filterDocs(docs, q), [docs, q]);

  const editParam = params.get('edit');
  const docParam = params.get('doc');
  const selectedId = docParam || (!mobile ? shown[0]?.id : null);
  const selected = selectedId ? byId.get(selectedId.toLowerCase()) : null;

  const open = (id) => setParams(id ? { doc: id } : {});
  const canEdit = (d) => d.authorId === user?.id || d.visibility !== 'private';

  async function save(draft) {
    const id = await api.saveGmDoc(draft);
    await load();
    setParams({ doc: id });
  }

  async function remove(doc) {
    const ok = await ask({ title: 'ВИДАЛИТИ', question: doc.title, tone: 'danger', yesLabel: 'ВИДАЛИТИ' });
    if (ok !== true) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteGmDoc(doc.id);
      setParams({});
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (editParam) {
    const doc = editParam === 'new' ? null : byId.get(editParam.toLowerCase());
    if (editParam !== 'new' && !loaded) return null;
    if (editParam !== 'new' && !doc) return <Msg kind="err">Документ не знайдено.</Msg>;
    return (
      <Suspense fallback={null}>
        <DocEditor
          key={editParam}
          entry={doc}
          entries={docs}
          userId={user?.id}
          onCancel={() => setParams(doc ? { doc: doc.id } : {})}
          onSave={save}
        />
      </Suspense>
    );
  }

  const showList = !mobile || !docParam;
  const showDoc = selected && (!mobile || docParam);

  return (
    <>
      {error && <Msg kind="err">{error}</Msg>}
      {showList && (
        <div className="ss-gdocs-bar">
          <input className="ss-input sm" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ пошук" aria-label="Пошук" />
          <button type="button" className="btn-gm sm" onClick={() => setParams({ edit: 'new' })}>+ НОВИЙ ДОКУМЕНТ</button>
        </div>
      )}
      <div className="ss-gdocs">
        {showList && (
          <Panel className="ss-gdocs-side" tone="gm" title="ДОКУМЕНТИ" sub={String(shown.length)}>
            <div className="ss-gdocs-list">
              {shown.map((d) => (
                <button key={d.id} type="button" className={`row${selected?.id === d.id ? ' on' : ''}`} onClick={() => open(d.id)}>
                  <span className="t">{d.title}</span>
                  <span className="m">
                    <span className="v">{visibilityLabel(d.visibility)}</span>
                    <span>{nicks[d.authorId] || '—'}</span>
                    <span>{formatDate(d.updatedAt)}</span>
                  </span>
                </button>
              ))}
              {loaded && shown.length === 0 && (
                <div className="empty"><span className="pre">&gt; </span>{docs.length ? 'Нічого не знайдено.' : 'Документів немає.'}</div>
              )}
            </div>
          </Panel>
        )}
        {showDoc && (
          <div className="ss-gdocs-main">
            <DocPanel
              doc={selected}
              canEdit={canEdit(selected)}
              canDelete={selected.authorId === user?.id}
              nicks={nicks}
              byId={byId}
              docs={docs}
              busy={busy}
              mobile={mobile}
              onOpen={open}
              onBack={() => open(null)}
              onEdit={() => setParams({ edit: selected.id })}
              onDelete={() => remove(selected)}
            />
          </div>
        )}
      </div>
      {confirmEl}
    </>
  );
}
