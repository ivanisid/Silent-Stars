import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, ReactRenderer, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { Msg, PageHeader, Panel } from '../components/kit.jsx';
import { useIsMobile } from '../useMobile';
import { api } from '../api';
import {
  KINDS, VISIBILITY, docImagePaths, docText, entryDoc, fillImageSrc, formatDate, kindLabel, mentionSuggestions, stripImageSrc,
} from './markup.js';
import { imageUrls, useImageUrls } from './images.js';

// Редактор запису хроніки — окремий екран (/chronicle?edit=<id|new>), завантажується окремо.
// Ліворуч назва й текст (візуальний редактор TipTap), праворуч параметри запису.
// Документ зберігається як JSON (chronicle_entries.doc), простий текст — у body для пошуку.

const ImageWithPath = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-path'),
        renderHTML: (attrs) => (attrs.path ? { 'data-path': attrs.path } : {}),
      },
    };
  },
});

const MentionList = forwardRef(function MentionList({ items, command }, ref) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') {
        setIdx((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setIdx((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const it = items[Math.min(idx, items.length - 1)];
        command({ id: it.id, label: it.title });
        return true;
      }
      return false;
    },
  }));
  if (!items.length) return null;
  return (
    <div className="ss-chron-sugg" role="listbox">
      {items.map((x, i) => (
        <button
          key={x.id}
          type="button"
          role="option"
          aria-selected={i === idx}
          className={i === idx ? 'on' : ''}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command({ id: x.id, label: x.title })}
        >
          <span className="t">{x.title}</span>
          <span className="k">{kindLabel(x.kind)}</span>
        </button>
      ))}
    </div>
  );
});

// Підказка згадок: список під курсором, позиція — fixed за прямокутником «@запит».
function mentionSuggestion(getEntries, selfId) {
  return {
    char: '@',
    allowSpaces: true,
    items: ({ query }) => mentionSuggestions(getEntries(), query, selfId, 8),
    command: ({ editor, range, props }) => {
      // Пробіл після згадки, курсор — за ним (інакше перша набрана літера замінює пробіл).
      const after = editor.view.state.selection.$to.nodeAfter;
      const to = after?.text?.startsWith(' ') ? range.to + 1 : range.to;
      editor
        .chain()
        .focus()
        .insertContentAt({ from: range.from, to }, [{ type: 'mention', attrs: { id: props.id, label: props.label } }, { type: 'text', text: ' ' }])
        .setTextSelection(range.from + 2)
        .run();
    },
    render: () => {
      let comp = null;
      let box = null;
      const place = (rect) => {
        if (!box || !rect) return;
        const r = rect();
        if (!r) return;
        const width = Math.min(360, window.innerWidth - 16);
        box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
        box.style.top = `${r.bottom + 6}px`;
        box.style.width = `${width}px`;
      };
      return {
        onStart: (props) => {
          comp = new ReactRenderer(MentionList, { props, editor: props.editor });
          box = document.createElement('div');
          box.className = 'ss-ced-pop';
          box.appendChild(comp.element);
          document.body.appendChild(box);
          place(props.clientRect);
        },
        onUpdate: (props) => {
          comp?.updateProps(props);
          place(props.clientRect);
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            box?.remove();
            box = null;
            return true;
          }
          return comp?.ref?.onKeyDown(props) || false;
        },
        onExit: () => {
          box?.remove();
          box = null;
          comp?.destroy();
          comp = null;
        },
      };
    },
  };
}

const Ico = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
    <path d={d} />
  </svg>
);

const B = ({ on, label, onClick, children }) => (
  <button type="button" className={`tb${on ? ' on' : ''}`} aria-label={label} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
    {children}
  </button>
);

function Toolbar({ editor, onImage, uploading }) {
  const [link, setLink] = useState(null);
  const st = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      h2: ed.isActive('heading', { level: 2 }),
      h3: ed.isActive('heading', { level: 3 }),
      ul: ed.isActive('bulletList'),
      ol: ed.isActive('orderedList'),
      quote: ed.isActive('blockquote'),
      link: ed.isActive('link'),
      href: ed.getAttributes('link').href || '',
    }),
  });
  const fileRef = useRef(null);
  const c = () => editor.chain().focus();

  const applyLink = (e) => {
    e.preventDefault();
    const href = link.trim();
    if (!href) c().extendMarkRange('link').unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: /^https?:\/\//i.test(href) ? href : `https://${href}` }).run();
    setLink(null);
  };

  return (
    <div className="ss-ced-tools">
      <div className="row">
        <B on={st.bold} label="Жирний" onClick={() => c().toggleBold().run()}><b>B</b></B>
        <B on={st.italic} label="Курсив" onClick={() => c().toggleItalic().run()}><i>I</i></B>
        <B on={st.underline} label="Підкреслений" onClick={() => c().toggleUnderline().run()}><u>U</u></B>
        <B on={st.strike} label="Закреслений" onClick={() => c().toggleStrike().run()}><s>S</s></B>
        <span className="sep" />
        <B on={st.h2} label="Заголовок" onClick={() => c().toggleHeading({ level: 2 }).run()}>H2</B>
        <B on={st.h3} label="Підзаголовок" onClick={() => c().toggleHeading({ level: 3 }).run()}>H3</B>
        <span className="sep" />
        <B on={st.ul} label="Список" onClick={() => c().toggleBulletList().run()}><Ico d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" /></B>
        <B on={st.ol} label="Нумерований список" onClick={() => c().toggleOrderedList().run()}><Ico d="M10 6h10M10 12h10M10 18h10M4 4v4M3 8h2M3 12h2l-2 3h2M3 17h2v4H3" /></B>
        <B on={st.quote} label="Цитата" onClick={() => c().toggleBlockquote().run()}><Ico d="M5 7h5v5H7l-2 4M14 7h5v5h-3l-2 4" /></B>
        <B on={false} label="Розділювач" onClick={() => c().setHorizontalRule().run()}><Ico d="M3 12h18" /></B>
        <span className="sep" />
        <B on={st.link} label="Посилання" onClick={() => setLink(link == null ? st.href : null)}><Ico d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></B>
        <B on={false} label="Згадка" onClick={() => c().insertContent('@').run()}>@</B>
        <B on={false} label="Картинка" onClick={() => fileRef.current?.click()}><Ico d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01" /></B>
        {uploading && <span className="up">ЗАВАНТАЖЕННЯ…</span>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          multiple
          onChange={(e) => {
            onImage([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      {link != null && (
        <form className="row link" onSubmit={applyLink}>
          <input className="ss-input sm" type="text" aria-label="Адреса посилання" value={link} onChange={(e) => setLink(e.target.value)} autoFocus />
          <button type="submit" className="btn-gm sm">OK</button>
          {st.link && (
            <button type="button" className="btn-ghost sm" onClick={() => { c().extendMarkRange('link').unsetLink().run(); setLink(null); }}>ПРИБРАТИ</button>
          )}
        </form>
      )}
    </div>
  );
}

function Portrait({ path, onPick, onClear, busy }) {
  const urls = useImageUrls(path ? [path] : []);
  const ref = useRef(null);
  return (
    <div className="ss-ced-portrait">
      {path && urls[path] ? <img src={urls[path]} alt="" /> : <div className="ph" />}
      <div className="acts">
        <button type="button" className="btn-gm sm" disabled={busy} onClick={() => ref.current?.click()}>{path ? 'ЗАМІНИТИ' : 'ЗАВАНТАЖИТИ'}</button>
        {path && <button type="button" className="btn-ghost sm" disabled={busy} onClick={onClear}>ПРИБРАТИ</button>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          if (e.target.files[0]) onPick(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Editor({ entry, initialDoc, entries, tags, games, userId, onCancel, onSave, onAddTag }) {
  const mobile = useIsMobile();
  const isAuthor = !entry || entry.authorId === userId;
  const [meta, setMeta] = useState(() => ({
    kind: entry?.kind || 'record',
    title: entry?.title || '',
    visibility: entry?.visibility || 'private',
    slotId: entry?.slotId || '',
    eventDate: entry?.eventDate || '',
    tagIds: entry?.tagIds || [],
    portrait: entry?.portrait || null,
  }));
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const set = (patch) => setMeta((m) => ({ ...m, ...patch }));
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  async function upload(files) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return [];
    setUploading((n) => n + 1);
    setError('');
    try {
      const out = [];
      for (const f of imgs) {
        const path = await api.uploadChronicleImage(f, userId);
        const urls = await imageUrls([path]);
        out.push({ path, src: urls[path] });
      }
      return out;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setUploading((n) => n - 1);
    }
  }

  const insertImages = async (files, pos) => {
    const got = await upload(files);
    if (!got.length || !editorRef.current) return;
    const chain = editorRef.current.chain().focus();
    if (pos != null) chain.setTextSelection(pos);
    got.forEach((g) => chain.setImage({ src: g.src, path: g.path }));
    chain.run();
  };

  const editorRef = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https'] },
        codeBlock: false,
        code: false,
      }),
      ImageWithPath.configure({ inline: false, allowBase64: false }),
      Mention.configure({
        HTMLAttributes: { class: 'ss-mention' },
        renderText: ({ node }) => node.attrs.label ?? '',
        renderHTML: ({ options, node }) => ['span', { ...options.HTMLAttributes, 'data-id': node.attrs.id }, node.attrs.label ?? ''],
        suggestion: mentionSuggestion(() => entriesRef.current, entry?.id),
      }),
    ],
    content: initialDoc,
    editorProps: {
      attributes: { class: 'ss-prose ss-doc ss-ced-doc', 'aria-label': 'ТЕКСТ' },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        insertImages(files);
        return true;
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false;
        const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImages(files, at?.pos);
        return true;
      },
    },
  });
  editorRef.current = editor;

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    setError('');
    try {
      const tag = await onAddTag(name, userId);
      setNewTag('');
      setMeta((m) => (m.tagIds.includes(tag.id) ? m : { ...m, tagIds: [...m.tagIds, tag.id] }));
    } catch (err) {
      setError(err.message);
    }
  }

  function pickGame(slotId) {
    const g = games.find((x) => x.id === slotId);
    set({ slotId, ...(g && !meta.title.trim() ? { title: g.title || '' } : null) });
  }

  async function pickPortrait(file) {
    const [got] = await upload([file]);
    if (got) set({ portrait: got.path });
  }

  async function save() {
    if (!meta.title.trim()) return setError('Вкажіть назву.');
    if (uploading) return setError('Зачекайте, картинка ще завантажується.');
    const doc = stripImageSrc(editor.getJSON());
    setBusy(true);
    setError('');
    try {
      await onSave({ ...meta, id: entry?.id || null, title: meta.title.trim(), doc, body: docText(doc) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // Ctrl/Cmd+S — зберегти.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <PageHeader
        section="ХРОНІКА"
        sectionTo={onCancel}
        title={entry ? 'ЗМІНИ' : 'НОВИЙ ЗАПИС'}
        right={(
          <>
            {!mobile && <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>СКАСУВАТИ</button>}
            <button type="button" className="btn-gm" disabled={busy || !editor} onClick={save}>{busy ? 'ЗБЕРЕЖЕННЯ…' : 'ЗБЕРЕГТИ'}</button>
          </>
        )}
      />
      {error && <Msg kind="err">{error}</Msg>}
      <div className="ss-ced">
        <Panel className="ss-ced-main" tone="gm">
          <input
            className="ss-ced-title"
            type="text"
            maxLength={120}
            aria-label="НАЗВА"
            placeholder="НАЗВА"
            value={meta.title}
            onChange={(e) => set({ title: e.target.value })}
            autoFocus={!entry}
          />
          {editor && <Toolbar editor={editor} onImage={(files) => insertImages(files)} uploading={uploading > 0} />}
          <EditorContent editor={editor} className="ss-ced-area" />
        </Panel>

        <aside className="ss-ced-side">
          <Panel title="ЗАПИС" tone="gm">
            <div className="ss-rule-ed ss-chron-ed">
              <div className="fld">
                <span className="lbl">ТИП</span>
                <div className="ss-seg">
                  {KINDS.map((k) => (
                    <button key={k.key} type="button" className={meta.kind === k.key ? 'on' : ''} aria-pressed={meta.kind === k.key} onClick={() => set({ kind: k.key })}>{k.label}</button>
                  ))}
                </div>
              </div>
              <div className="fld">
                <span className="lbl">ДОСТУП</span>
                <div className="ss-seg">
                  {VISIBILITY.map((v) => (
                    <button key={v.key} type="button" className={meta.visibility === v.key ? 'on' : ''} aria-pressed={meta.visibility === v.key} disabled={!isAuthor} onClick={() => set({ visibility: v.key })}>{v.label}</button>
                  ))}
                </div>
              </div>
              {meta.kind === 'report' && (
                <label className="fld">
                  <span className="lbl">ГРА</span>
                  <select className="ss-select" value={meta.slotId} onChange={(e) => pickGame(e.target.value)}>
                    <option value="">—</option>
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>{`${formatDate(g.game_at)} · ${g.title || '—'}`}</option>
                    ))}
                  </select>
                </label>
              )}
              {meta.kind === 'event' && (
                <label className="fld">
                  <span className="lbl">ДАТА</span>
                  <input className="ss-input" type="date" value={meta.eventDate} onChange={(e) => set({ eventDate: e.target.value })} />
                </label>
              )}
              <div className="fld">
                <span className="lbl">ПОРТРЕТ</span>
                <Portrait path={meta.portrait} busy={uploading > 0} onPick={pickPortrait} onClear={() => set({ portrait: null })} />
              </div>
              <div className="fld">
                <span className="lbl">ТЕГИ</span>
                <div className="ss-chron-tags">
                  {tags.map((t) => (
                    <button key={t.id} type="button" className={`ss-chip sm${meta.tagIds.includes(t.id) ? ' on' : ''}`} aria-pressed={meta.tagIds.includes(t.id)} onClick={() => set({ tagIds: meta.tagIds.includes(t.id) ? meta.tagIds.filter((x) => x !== t.id) : [...meta.tagIds, t.id] })}>{t.name}</button>
                  ))}
                </div>
                <div className="ss-chron-tags add">
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
                </div>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

// Обгортка: перед створенням редактора отримуємо адреси картинок зі сховища.
export default function ChronicleEditor(props) {
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    let off = false;
    const d = entryDoc(props.entry);
    imageUrls(docImagePaths(d))
      .catch(() => ({}))
      .then((urls) => !off && setDoc(fillImageSrc(d, urls)));
    return () => {
      off = true;
    };
    // Документ береться один раз при відкритті редактора.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!doc) return null;
  return <Editor {...props} initialDoc={doc} />;
}
