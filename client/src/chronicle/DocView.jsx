import { docImagePaths, safeHref } from './markup.js';
import { useImageUrls } from './images.js';

// Показ документа редактора (JSON TipTap) React-вузлами — без HTML з бази.
// Згадка — кнопка переходу на запис (з його поточною назвою), недоступна — просто текст.

function Marks({ marks = [], children }) {
  return marks.reduceRight((acc, m, i) => {
    if (m.type === 'bold') return <strong key={i}>{acc}</strong>;
    if (m.type === 'italic') return <em key={i}>{acc}</em>;
    if (m.type === 'underline') return <u key={i}>{acc}</u>;
    if (m.type === 'strike') return <s key={i}>{acc}</s>;
    if (m.type === 'code') return <code key={i}>{acc}</code>;
    if (m.type === 'link') {
      const href = safeHref(m.attrs?.href);
      return href ? <a key={i} href={href} target="_blank" rel="noopener noreferrer">{acc}</a> : acc;
    }
    return acc;
  }, children);
}

function Node({ n, ctx }) {
  const kids = (n.content || []).map((c, i) => <Node key={i} n={c} ctx={ctx} />);
  switch (n.type) {
    case 'doc':
      return <>{kids}</>;
    case 'paragraph':
      return <p>{kids}</p>;
    case 'heading': {
      const level = Math.min(Math.max(Number(n.attrs?.level) || 2, 2), 4);
      const H = `h${level}`;
      return <H>{kids}</H>;
    }
    case 'bulletList':
      return <ul>{kids}</ul>;
    case 'orderedList':
      return <ol start={n.attrs?.start || undefined}>{kids}</ol>;
    case 'listItem':
      return <li>{kids}</li>;
    case 'blockquote':
      return <blockquote>{kids}</blockquote>;
    case 'codeBlock':
      return <pre><code>{kids}</code></pre>;
    case 'horizontalRule':
      return <hr />;
    case 'hardBreak':
      return <br />;
    case 'text':
      return <Marks marks={n.marks}>{n.text}</Marks>;
    case 'mention': {
      const id = String(n.attrs?.id || '').toLowerCase();
      const target = ctx.byId.get(id);
      return target ? (
        <button type="button" className="ss-mention" onClick={() => ctx.onOpen(target.id)}>{target.title}</button>
      ) : (
        <span className="ss-mention off">{n.attrs?.label || ''}</span>
      );
    }
    case 'image': {
      const src = n.attrs?.path ? ctx.urls[n.attrs.path] : safeHref(n.attrs?.src);
      return src ? <img className="ss-doc-img" src={src} alt={n.attrs?.alt || ''} loading="lazy" /> : null;
    }
    default:
      return kids.length ? <>{kids}</> : null;
  }
}

export default function DocView({ doc, byId, onOpen }) {
  const urls = useImageUrls(docImagePaths(doc));
  if (!doc?.content?.length) return null;
  return (
    <div className="ss-prose ss-doc">
      <Node n={doc} ctx={{ byId, onOpen, urls }} />
    </div>
  );
}
