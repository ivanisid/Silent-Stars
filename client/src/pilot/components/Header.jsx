import { useState } from 'react';
import { derivePilotView } from '../derive';

export default function Header({ pilot, state, dispatch, onSaveMeta, saveStatus }) {
  const view = derivePilotView(state);
  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState(pilot.name);
  const [callsign, setCallsign] = useState(pilot.callsign);
  const [background, setBackground] = useState(pilot.background);

  function saveMeta() {
    onSaveMeta({ name: name.trim() || pilot.name, callsign: callsign.trim() || pilot.callsign, background });
    setEditingMeta(false);
  }

  const statusActive = state.status === 'active';

  return (
    <div
      style={{
        background: 'var(--header-strong)',
        clipPath: 'polygon(0 0,100% 0,100% 100%,28px 100%,0 calc(100% - 28px))',
        padding: '28px 40px 34px 40px',
        borderBottom: '2px solid var(--header-border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          {!editingMeta ? (
            <>
              <div className="title-font" style={{ fontSize: 44, letterSpacing: 1, lineHeight: 1, color: 'var(--text-bright)' }}>
                {pilot.name}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', letterSpacing: 2, marginTop: 6 }}>
                &gt; ПРОФІЛЬ ПІЛОТА · {pilot.callsign}{' '}
                <span
                  onClick={() => setEditingMeta(true)}
                  style={{ cursor: 'pointer', textDecoration: 'underline', marginLeft: 8, fontSize: 11 }}
                >
                  редагувати
                </span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" style={{ padding: '8px 10px', fontSize: 16 }} />
              <input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="Позивний" style={{ padding: '8px 10px', fontSize: 13 }} />
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                rows={2}
                placeholder="Бекграунд"
                style={{ padding: '8px 10px', fontSize: 12, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" type="button" onClick={saveMeta}>ЗБЕРЕГТИ</button>
                <button className="btn-ghost" type="button" onClick={() => setEditingMeta(false)}>СКАСУВАТИ</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: 1,
              padding: '6px 12px',
              border: '1px solid var(--btn-border)',
              color: 'var(--text-dim)',
            }}
          >
            ТІР {view.tier}
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_STATUS' })}
            style={{
              background: statusActive ? 'var(--ok-bg)' : 'var(--bad-bg)',
              color: statusActive ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${statusActive ? 'var(--ok-border)' : 'var(--bad-border)'}`,
              padding: '6px 12px',
              fontSize: 12,
              letterSpacing: 1,
            }}
          >
            {statusActive ? 'АКТИВНИЙ' : 'АРХІВ'}
          </button>
          <div style={{ fontSize: 11, color: saveStatus === 'saving' ? 'var(--warn)' : 'var(--text-dimmer)' }}>
            {saveStatus === 'saving' ? 'Збереження…' : 'Збережено'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-info)', whiteSpace: 'nowrap' }}>
          ІГОР ЗІГРАНО: <span style={{ color: 'var(--text-bright)' }}>{state.games}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-info)', whiteSpace: 'nowrap' }}>
          ЛЛ: <span style={{ color: 'var(--text-bright)' }}>{view.ll}</span>
        </div>
        <div style={{ flex: 1, minWidth: 100, height: 8, background: 'var(--input-bg)', border: '1px solid var(--input-border)', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${view.pct}%`, background: 'var(--accent)' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{view.llNextLabel}</div>
        <button className="btn" type="button" onClick={() => dispatch({ type: 'INC_GAME' })} style={{ whiteSpace: 'nowrap' }}>
          + ЗАПИСАТИ ГРУ
        </button>
        <button className="btn-ghost" type="button" onClick={() => dispatch({ type: 'TOGGLE_LL_EDIT' })} style={{ whiteSpace: 'nowrap' }}>
          {state.llEdit.open ? 'ЗАКРИТИ' : 'ВИПРАВИТИ ЛЛ'}
        </button>
      </div>

      {state.llEdit.open && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 16, background: 'var(--panel-inset)', border: '1px solid var(--input-border)', padding: '14px 16px' }}>
          <div>
            <div className="field-label">ЛЛ (2–12)</div>
            <input
              type="number"
              value={state.llEdit.ll}
              onChange={(e) => dispatch({ type: 'SET_LL_EDIT_LL', value: e.target.value })}
              style={{ width: 80, padding: '7px 10px', fontSize: 13 }}
            />
          </div>
          <button className="btn" type="button" onClick={() => dispatch({ type: 'SAVE_LL_EDIT' })}>
            ЗБЕРЕГТИ
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.5 }}>
            Кількість зіграних ігор виставиться автоматично на поріг обраного рівня.
          </div>
        </div>
      )}
    </div>
  );
}
