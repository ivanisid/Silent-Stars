import { Fragment, useCallback, useEffect, useState } from 'react';
import { Msg, PageHeader, PageShell, Panel, useConfirm } from '../components/kit.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';

// Сторінка правил кампанії: розділ = одна панель, праворуч — зміст із підсвіткою розділу,
// який зараз на екрані. Розділи й блоки живуть у rule_sections (міграція 20261016b_rules.sql).
// Розмітка одна на всі теми — вигляд дають PageShell / Panel і класи ss-prose, ss-rules.
//
// ГМ вмикає «РЕДАГУВАННЯ»: порядок розділів, видалення, додавання й редактор розділу
// блоками. Редагується один розділ за раз; «СКАСУВАТИ» відкидає незбережене.

const BLOCK_TYPES = [
  { type: 'paragraph', label: 'АБЗАЦ', add: '+ АБЗАЦ' },
  { type: 'table', label: 'ТАБЛИЦЯ', add: '+ ТАБЛИЦЯ' },
  { type: 'cards', label: 'КАРТКИ', add: '+ КАРТКИ' },
  { type: 'quote', label: 'ЦИТАТА', add: '+ ЦИТАТА' },
];
const typeLabel = (type) => BLOCK_TYPES.find((b) => b.type === type)?.label || type;

// Розмітка в тексті — лише **виділення** і [текст](https://…). Розбирається в React-вузли,
// HTML з бази ніколи не вставляється як є.
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text, keyBase = '') {
  const out = [];
  let last = 0;
  let i = 0;
  for (const m of String(text ?? '').matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}${i++}`;
    if (m[1] != null) out.push(<strong key={key}>{inline(m[1], `${key}.`)}</strong>);
    else out.push(<a key={key} href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < String(text ?? '').length) out.push(text.slice(last));
  return out;
}

export function RuleBlocks({ blocks }) {
  return (
    <div className="ss-prose">
      {(blocks || []).map((b, i) => {
        if (b.type === 'paragraph') return <p key={i}>{inline(b.text)}</p>;
        if (b.type === 'quote') return <blockquote key={i}>{inline(b.text)}</blockquote>;
        if (b.type === 'table') {
          return (
            <table key={i}>
              <tbody>
                {(b.rows || []).map((r, j) => (
                  <tr key={j}>
                    <td>{inline(r.name)}</td>
                    <td className="v">{inline(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (b.type === 'cards') {
          return (
            <div key={i} className="rcards">
              {(b.items || []).map((c, j) => (
                <div key={j} className="rcard">
                  <div className="ct">{inline(c.title)}</div>
                  <div className="cx">{inline(c.text)}</div>
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// Активний розділ змісту — перший за порядком, що перетинає верхню частину екрана. Унизу
// сторінки короткі останні розділи до цієї смуги не доходять — тоді активний останній
// розділ, верх якого видно.
function useActiveSection(ids) {
  const [active, setActive] = useState(null);
  const key = ids.join(',');
  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) return undefined;
    const visible = new Set();
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const lastShown = () =>
      [...list].reverse().find((id) => {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        return top != null && top < window.innerHeight;
      });
    const pick = () => {
      const id = atBottom() ? lastShown() : list.find((x) => visible.has(x));
      if (id) setActive(id);
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
        pick();
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    list.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    const onScroll = () => atBottom() && pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [key]);
  return active;
}

let localKey = 0;
const withKey = (o) => ({ ...o, _k: ++localKey });
const stripKey = ({ _k, ...rest }) => rest;

function toDraft(section) {
  return {
    id: section?.id ?? null,
    title: section?.title ?? '',
    blocks: (section?.blocks || []).map((b) =>
      withKey({
        ...b,
        ...(b.type === 'table' ? { rows: (b.rows || []).map(withKey) } : null),
        ...(b.type === 'cards' ? { items: (b.items || []).map(withKey) } : null),
      }),
    ),
  };
}

function fromDraft(draft) {
  return draft.blocks.map((b) => {
    const clean = stripKey(b);
    if (b.type === 'table') clean.rows = b.rows.map(stripKey);
    if (b.type === 'cards') clean.items = b.items.map(stripKey);
    return clean;
  });
}

const emptyBlock = (type) =>
  withKey(
    type === 'table'
      ? { type, rows: [withKey({ name: '', value: '' })] }
      : type === 'cards'
        ? { type, items: [withKey({ title: '', text: '' })] }
        : { type, text: '' },
  );

const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function SectionEditor({ section, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(section));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setBlock = (k, fn) => setDraft((d) => ({ ...d, blocks: d.blocks.map((b) => (b._k === k ? fn(b) : b)) }));
  const moveBlock = (i, dir) => setDraft((d) => ({ ...d, blocks: move(d.blocks, i, dir) }));
  const removeBlock = (k) => setDraft((d) => ({ ...d, blocks: d.blocks.filter((b) => b._k !== k) }));
  const addBlock = (type) => setDraft((d) => ({ ...d, blocks: [...d.blocks, emptyBlock(type)] }));

  async function save(e) {
    e.preventDefault();
    if (!draft.title.trim()) return setError('Вкажіть назву розділу.');
    setBusy(true);
    setError('');
    try {
      await onSave(draft.id, draft.title.trim(), fromDraft(draft));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Panel id={section?.id} title={draft.title || '\u00a0'} tone="gm">
      <form className="ss-rule-ed" onSubmit={save}>
        <label className="fld">
          <span className="lbl">НАЗВА РОЗДІЛУ</span>
          <input className="ss-input" type="text" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} autoFocus />
        </label>

        {draft.blocks.map((b, i) => (
          <div key={b._k} className="blk">
            <div className="bh">
              <span className="ty">{typeLabel(b.type)}</span>
              <button type="button" className="btn-ghost sm" aria-label="Вгору" disabled={i === 0} onClick={() => moveBlock(i, -1)}>↑</button>
              <button type="button" className="btn-ghost sm" aria-label="Вниз" disabled={i === draft.blocks.length - 1} onClick={() => moveBlock(i, 1)}>↓</button>
              <button type="button" className="btn-danger sm" aria-label="Видалити блок" onClick={() => removeBlock(b._k)}>✕</button>
            </div>
            <div className="bb">
              {(b.type === 'paragraph' || b.type === 'quote') && (
                <textarea
                  className="ss-input"
                  rows={b.type === 'quote' ? 3 : 4}
                  aria-label={typeLabel(b.type)}
                  value={b.text || ''}
                  onChange={(e) => setBlock(b._k, (x) => ({ ...x, text: e.target.value }))}
                />
              )}

              {b.type === 'table' && (
                <>
                  <div className="tr hd">
                    <span>НАЗВА</span>
                    <span>ЦІНА</span>
                    <span />
                  </div>
                  {b.rows.map((r) => {
                    const setRow = (patch) => setBlock(b._k, (x) => ({ ...x, rows: x.rows.map((y) => (y._k === r._k ? { ...y, ...patch } : y)) }));
                    return (
                      <div key={r._k} className="tr">
                        <input className="ss-input" type="text" aria-label="НАЗВА" value={r.name || ''} onChange={(e) => setRow({ name: e.target.value })} />
                        <input className="ss-input" type="text" aria-label="ЦІНА" value={r.value || ''} onChange={(e) => setRow({ value: e.target.value })} />
                        <button type="button" className="btn-danger sm" aria-label="Видалити рядок" onClick={() => setBlock(b._k, (x) => ({ ...x, rows: x.rows.filter((y) => y._k !== r._k) }))}>✕</button>
                      </div>
                    );
                  })}
                  <div>
                    <button type="button" className="btn-gm sm" onClick={() => setBlock(b._k, (x) => ({ ...x, rows: [...x.rows, withKey({ name: '', value: '' })] }))}>+ РЯДОК</button>
                  </div>
                </>
              )}

              {b.type === 'cards' && (
                <>
                  <div className="cards-ed">
                    {b.items.map((c, j) => {
                      const setCard = (patch) => setBlock(b._k, (x) => ({ ...x, items: x.items.map((y) => (y._k === c._k ? { ...y, ...patch } : y)) }));
                      return (
                        <div key={c._k} className="card-ed">
                          <div className="ch">
                            <button type="button" className="btn-ghost sm" aria-label="Ліворуч" disabled={j === 0} onClick={() => setBlock(b._k, (x) => ({ ...x, items: move(x.items, j, -1) }))}>←</button>
                            <button type="button" className="btn-ghost sm" aria-label="Праворуч" disabled={j === b.items.length - 1} onClick={() => setBlock(b._k, (x) => ({ ...x, items: move(x.items, j, 1) }))}>→</button>
                            <button type="button" className="btn-danger sm" aria-label="Видалити картку" onClick={() => setBlock(b._k, (x) => ({ ...x, items: x.items.filter((y) => y._k !== c._k) }))}>✕</button>
                          </div>
                          <input className="ss-input" type="text" aria-label="Заголовок картки" value={c.title || ''} onChange={(e) => setCard({ title: e.target.value })} />
                          <textarea className="ss-input" rows={5} aria-label="Текст картки" value={c.text || ''} onChange={(e) => setCard({ text: e.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <button type="button" className="btn-gm sm" onClick={() => setBlock(b._k, (x) => ({ ...x, items: [...x.items, withKey({ title: '', text: '' })] }))}>+ КАРТКА</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        <div className="adds">
          {BLOCK_TYPES.map((t) => (
            <button key={t.type} type="button" className="btn-gm sm" onClick={() => addBlock(t.type)}>{t.add}</button>
          ))}
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

export default function RulesPage() {
  const { isGm } = useAuth();
  const [sections, setSections] = useState([]);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  // editing: { id } — зміна наявного розділу; { at } — новий розділ на позиції at.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ask, confirmEl] = useConfirm();

  const load = useCallback(async () => {
    try {
      setSections(await api.listRuleSections());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = useActiveSection(sections.map((s) => s.id));
  const canEdit = isGm && editMode;
  const locked = busy || editing != null;

  const toggleEdit = () => {
    setEditMode((v) => !v);
    setEditing(null);
  };

  const scrollTo = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    }
    await load();
    setBusy(false);
  }

  const moveSection = (i, dir) => {
    const next = move(sections, i, dir);
    setSections(next);
    run(() => api.reorderRuleSections(next.map((s) => s.id)));
  };

  async function removeSection(s) {
    const ok = await ask({ title: 'ВИДАЛИТИ', question: s.title, tone: 'danger', yesLabel: 'ВИДАЛИТИ' });
    if (ok !== true) return;
    run(() => api.deleteRuleSection(s.id));
  }

  async function saveSection(id, title, blocks) {
    const savedId = await api.saveRuleSection(id, title, blocks);
    if (!id && editing?.at != null && editing.at < sections.length) {
      const ids = sections.map((s) => s.id);
      ids.splice(editing.at, 0, savedId);
      await api.reorderRuleSections(ids);
    }
    setEditing(null);
    await load();
  }

  const addButton = (at) => (
    <div className="ss-rules-add">
      <button type="button" className="btn-gm" disabled={locked} onClick={() => setEditing({ at })}>+ ДОДАТИ РОЗДІЛ</button>
    </div>
  );

  const newEditor = (at) =>
    editing?.at === at ? (
      <SectionEditor key={`new-${at}`} section={null} onCancel={() => setEditing(null)} onSave={saveSection} />
    ) : null;

  return (
    <PageShell>
      <PageHeader
        section="SILENT STARS"
        title="ПРАВИЛА"
        right={isGm ? (
          <button type="button" className="btn-gm" aria-pressed={editMode} onClick={toggleEdit}>РЕДАГУВАННЯ</button>
        ) : null}
      />
      {error && <Msg kind="err">{error}</Msg>}
      <div className="ss-rules">
        <div className="ss-rules-main">
          {sections.map((s, i) => (
            <Fragment key={s.id}>
              {newEditor(i)}
              {editing?.id === s.id ? (
                <SectionEditor section={s} onCancel={() => setEditing(null)} onSave={saveSection} />
              ) : (
                <Panel
                  id={s.id}
                  title={s.title}
                  right={canEdit ? (
                    <>
                      <button type="button" className="btn-ghost sm" aria-label="Вгору" disabled={locked || i === 0} onClick={() => moveSection(i, -1)}>↑</button>
                      <button type="button" className="btn-ghost sm" aria-label="Вниз" disabled={locked || i === sections.length - 1} onClick={() => moveSection(i, 1)}>↓</button>
                      <button type="button" className="btn-ghost sm" disabled={locked} onClick={() => setEditing({ id: s.id })}>ЗМІНИТИ</button>
                      <button type="button" className="btn-danger sm" disabled={locked} onClick={() => removeSection(s)}>ВИДАЛИТИ</button>
                    </>
                  ) : null}
                >
                  <RuleBlocks blocks={s.blocks} />
                </Panel>
              )}
              {canEdit && i < sections.length - 1 && addButton(i + 1)}
            </Fragment>
          ))}
          {newEditor(sections.length)}
          {canEdit && sections.length > 0 && addButton(sections.length)}
        </div>
        <nav className="ss-toc" aria-label="Зміст">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : ''} aria-current={active === s.id ? 'location' : undefined} onClick={(e) => scrollTo(e, s.id)}>
              {s.title}
            </a>
          ))}
          {canEdit && (
            <button type="button" className="btn-gm add" disabled={locked} onClick={() => setEditing({ at: sections.length })}>+ ДОДАТИ РОЗДІЛ</button>
          )}
        </nav>
      </div>
      {confirmEl}
    </PageShell>
  );
}
