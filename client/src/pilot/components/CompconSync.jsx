import { useState } from 'react';
import { api } from '../../api';
import { mechSlots } from '../constants';
import { prepareImport } from '../compconFile';
import { ccStatus, isShareCode, mechDiff, normalizeShareCode, wrapCloudPilot } from '../compconLink';

// Синхронізація пілота з COMP/CON за share code (docs/compcon-link-spec.md §3.2–3.3): поле
// коду, кнопка, статус і вікно змін. Прийняття йде тим самим шляхом, що й файл COMP/CON
// (useCompconImport): слоти ангару, стан мехів з апки, файли для Foundry. Бонд і LL з
// COMP/CON не беруться.
export default function CompconSync({ state, dispatch, importCompcon, onMessage }) {
  const link = state.compcon || {};
  const [code, setCode] = useState(link.code || '');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);

  const cc = ccStatus(link);
  const levelOff = link.level != null && Number(link.level) !== Number(state.ll);

  async function sync() {
    const c = normalizeShareCode(code);
    if (!isShareCode(c)) {
      onMessage({ ok: false, text: 'Share code — 12 латинських літер і цифр.' });
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    try {
      const r = await api.fetchCompconByCode(c);
      if (c === link.code && r.updated === link.version) {
        dispatch({ type: 'SET_COMPCON_LINK', patch: { checkedAt: now, error: '' } });
        onMessage({ ok: true, text: 'COMP/CON: нової версії немає.' });
        return;
      }
      const json = wrapCloudPilot(r.data);
      const prep = prepareImport(json, state, mechSlots(state.hangar?.owned));
      const slots = prep.assignment
        .map((j, i) => (j == null ? null : { slot: i, mech: prep.imported[j], groups: mechDiff(prep.existing[i] || null, prep.imported[j]) }))
        .filter(Boolean);
      setReview({ code: c, r, json, slots, level: r.data?.level });
    } catch (err) {
      dispatch({ type: 'SET_COMPCON_LINK', patch: { code: c, checkedAt: now, error: err.message } });
      onMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    const { code: c, r, json, level } = review;
    setReview(null);
    try {
      const res = await importCompcon(json, { withBond: false, fileName: `COMP/CON · ${r.name || c}` });
      if (!res) return;
      const now = new Date().toISOString();
      dispatch({
        type: 'SET_COMPCON_LINK',
        patch: { code: c, version: r.updated, acceptedAt: now, level: level ?? null, checkedAt: now, error: '' },
        msg: `COMP/CON: прийнято версію «${r.name || c}»`,
      });
      onMessage(res);
    } catch (err) {
      onMessage({ ok: false, text: err.message });
    }
  }

  const reviewLevelOff = review && review.level != null && Number(review.level) !== Number(state.ll);

  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="field-label" style={{ margin: 0 }}>SHARE CODE</span>
        <input
          className="ss-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
          spellCheck={false}
          autoCapitalize="characters"
          style={{ width: 150, letterSpacing: 2 }}
        />
      </label>
      <button className="btn" type="button" disabled={busy || !code.trim()} onClick={sync} style={{ fontSize: 11, padding: '6px 12px' }}>
        {busy ? '…' : 'СИНХРОНІЗУВАТИ З COMP/CON'}
      </button>
      <span className={`ss-tag ${cc.active ? 'ok' : 'bad'}`} title={link.error || undefined}>
        COMP/CON · {cc.text}{cc.at ? ` // ${cc.at}` : ''}
      </span>
      {levelOff && <span className="ss-tag warn">РІВЕНЬ НЕ ЗБІГАЄТЬСЯ</span>}

      {review && (
        <div className="modal-backdrop" onClick={() => setReview(null)}>
          <div className="modal-box" style={{ width: 520 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">COMP/CON · {review.r.name || review.code}</div>
            <div className="modal-body" style={{ gap: 14 }}>
              {reviewLevelOff && (
                <div className="warn-box"><span className="pre">:: </span>Рівень персонажу в файлі не відповідає рівню вашого персонажу.</div>
              )}
              {review.slots.map((s) => (
                <div key={s.slot} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="field-label" style={{ margin: 0, color: 'var(--text-bright)' }}>СЛОТ {s.slot + 1} · {s.mech.name.toUpperCase()}</div>
                  {s.groups.map((g) => (
                    <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div className="field-label" style={{ margin: 0 }}>{g.title}</div>
                      {g.lines.map((l, i) => (
                        <div key={i} style={{ fontSize: 13, color: l.sign === '+' ? 'var(--success)' : 'var(--danger)' }}>{l.sign} {l.text}</div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setReview(null)}>СКАСУВАТИ</button>
                <button type="button" className="btn" onClick={accept} autoFocus>ПРИЙНЯТИ</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
