import { useCallback, useRef, useState } from 'react';
import { commitImport, prepareImport, readCompconJson } from '../compconFile';
import { applyAssignment, sameMech } from '../slotImport';

// Імпорт COMP/CON у слоти ангару для відкритого профілю пілота.
//
//   const [importCompcon, dialog] = useCompconImport({ state, dispatch, pilotId, slots, onSaved });
//   const res = await importCompcon(fileOrJson, { withBond, target, fileName });
//
// Очевидний розклад (кожен мех з файлу має свій слот і нікого не замінює) застосовується
// одразу; інакше відкривається вікно «який мех у який слот». res — { ok, text } або null,
// якщо гравець скасував. Помилки кидаються з поясненням.
export function useCompconImport({ state, dispatch, pilotId, slots, onSaved }) {
  const [req, setReq] = useState(null);
  // Свіжий стан для відкладеного (після вікна) застосування.
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback(
    async (source, { withBond = false, target = null, fileName } = {}) => {
      const json = source instanceof Blob ? await readCompconJson(source) : source;
      const name = fileName || source?.name || 'COMP/CON';
      const prep = prepareImport(json, stateRef.current, slots, target);
      const commit = async (assignment) => {
        const res = await commitImport({ json, prep, assignment, pilotId, dispatch, withBond, fileName: name });
        onSaved?.();
        return res;
      };
      if (prep.obvious) return commit(prep.assignment);
      const assignment = await new Promise((resolve) => setReq({ prep, target, fileName: name, resolve }));
      setReq(null);
      return assignment ? commit(assignment) : null;
    },
    [slots, pilotId, dispatch, onSaved],
  );

  const dialog = req ? (
    <SlotDialog
      prep={req.prep}
      target={req.target}
      fileName={req.fileName}
      hangarSlots={slots}
      onCancel={() => req.resolve(null)}
      onConfirm={(a) => req.resolve(a)}
    />
  ) : null;
  return [run, dialog];
}

const label = (m) => (m.frame && m.frame.toUpperCase() !== m.name.toUpperCase() ? `${m.frame.toUpperCase()} // ${m.name}` : m.name);

function SlotDialog({ prep, target, fileName, hangarSlots, onCancel, onConfirm }) {
  const [a, setA] = useState(prep.assignment);
  const { existing, imported } = prep;
  const check = applyAssignment(existing, imported, a, prep.shared);
  const placed = new Set(a.filter((j) => j != null));
  const skipped = imported.filter((_, j) => !placed.has(j));
  const replaces = check.changes?.filter((c) => c.kind === 'replace') || [];
  const nothing = !check.error && !check.changes?.length;
  // Показуємо лише слот кнопки, з якої завантажено файл, — решту не чіпаємо.
  const rows = target != null ? [target] : a.map((_, i) => i);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" style={{ width: 480 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">МЕХИ З COMP/CON → СЛОТИ АНГАРУ</div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6 }}>
            «{fileName}»: у файлі {imported.length} {imported.length === 1 ? 'мех' : 'мехів'}, слотів в ангарі {hangarSlots}
            {hangarSlots < 2 ? ' (другий дає «Місце стоянки»)' : ''}. Оберіть, який мех куди.
          </div>
          {rows.map((i) => {
            const cur = existing[i];
            const j = a[i];
            const kind = j == null ? null : !cur ? 'новий' : sameMech(cur, imported[j]) ? 'оновлення, стан лишається' : 'заміна';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="field-label">
                  СЛОТ {i + 1}{i >= hangarSlots ? ' (понад слоти ангару)' : ''} · зараз: {cur ? label(cur) : 'порожній'}
                </div>
                <select
                  className="ss-select"
                  value={j == null ? '' : String(j)}
                  onChange={(e) => setA((prev) => prev.map((x, k) => (k === i ? (e.target.value === '' ? null : Number(e.target.value)) : x)))}
                  style={{ height: 30, fontSize: 12 }}
                >
                  <option value="">{cur ? '— не змінювати —' : '— лишити порожнім —'}</option>
                  {imported.map((m, k) => (
                    <option key={k} value={k}>{label(m)}</option>
                  ))}
                </select>
                {kind && <div style={{ fontSize: 11, color: kind === 'заміна' ? 'var(--warn)' : 'var(--text-dimmer)' }}>{kind}</div>}
              </div>
            );
          })}
          <div className="modal-lines">
            {replaces.map((c) => (
              <div key={c.slot} style={{ color: 'var(--warn)' }}>
                :: «{c.old.name}» буде замінено на «{c.mech.name}» — стан, пошкодження й арт старого меха не переносяться.
              </div>
            ))}
            {skipped.length > 0 && (
              <div style={{ color: 'var(--text-dimmer)' }}>Не імпортуються: {skipped.map((m) => m.name).join(', ')}.</div>
            )}
            {check.error && <div style={{ color: 'var(--danger)' }}>!! {check.error}</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>СКАСУВАТИ</button>
            <button type="button" className="btn" disabled={!!check.error || nothing} onClick={() => onConfirm(a)} autoFocus>
              {replaces.length ? 'ЗАМІНИТИ' : 'ІМПОРТУВАТИ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
