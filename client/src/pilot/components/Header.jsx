import { useRef, useState } from 'react';
import { derivePilotView } from '../derive';
import { importCompconFile } from '../compconFile';
import { parseAdventureLeagueCsv, summarizeAdventureLeagueLog } from '../csvImport';
import { Menu, Panel } from '../../components/kit.jsx';
import ArtSlot from './ArtSlot.jsx';
import PilotGames from './PilotGames.jsx';

function mechsLine(mechs) {
  return mechs
    .map((m) => (m.frame && m.frame.toUpperCase() !== m.name.toUpperCase() ? `${m.frame.toUpperCase()} // ${m.name.toUpperCase()}` : m.name.toUpperCase()))
    .join(', ');
}

// Статус останнього імпорту для кожного пілота — на всю сесію вкладки, а не лише поки
// відкритий профіль: повернувшись до пілота, гравець бачить, що й коли завантажив.
const lastImport = new Map();

// Профіль пілота: ім'я, позивний і мехи, бекграунд, ТІР/статус, меню «⋯» (імпорт і
// правки), рядок ЛЛ з покупкою рівня, ігри пілота і портрет праворуч. Під панеллю —
// кнопки імпорту зі статусом останнього завантаження.
export default function Header({ pilot, state, dispatch, onSaveMeta, games, portrait, canEditArt, onUploadPortrait, onRemoveArt }) {
  const view = derivePilotView(state);
  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState(pilot.name);
  const [callsign, setCallsign] = useState(pilot.callsign);
  const [background, setBackground] = useState(pilot.background);
  const [importMsg, setImportMsgState] = useState(() => lastImport.get(pilot.id) || null);
  const setImportMsg = (msg) => {
    const stamped = { ...msg, at: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) };
    lastImport.set(pilot.id, stamped);
    setImportMsgState(stamped);
  };
  const csvRef = useRef(null);
  const jsonRef = useRef(null);
  // 'full' — файл основного профілю (мехи й бонд), 'mech' — інший профіль того ж пілота:
  // з нього лише мех, дані пілота не змінюються.
  const jsonMode = useRef('full');

  function saveMeta() {
    onSaveMeta({ name: name.trim() || pilot.name, callsign: callsign.trim() || pilot.callsign, background });
    setEditingMeta(false);
  }

  function startEdit() {
    setName(pilot.name);
    setCallsign(pilot.callsign);
    setBackground(pilot.background);
    setEditingMeta(true);
  }

  async function handleCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const summary = summarizeAdventureLeagueLog(parseAdventureLeagueCsv(await file.text()));
      dispatch({ type: 'IMPORT_ADVENTURE_LOG', payload: summary });
      setImportMsg({ ok: true, text: `Adventure League log: ${summary.entryCount} записів, мана → ${summary.manaTotal}` });
    } catch (err) {
      setImportMsg({ ok: false, text: err.message });
    }
  }

  // Файл COMP/CON дає мехів, а файл основного профілю — ще й бонд (назва, ідеали, XP).
  async function handleJson(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setImportMsg(await importCompconFile(file, { state, pilotId: pilot.id, dispatch, withBond: jsonMode.current === 'full' }));
    } catch (err) {
      setImportMsg({ ok: false, text: err.message });
    }
  }

  function pickJson(mode) {
    jsonMode.current = mode;
    jsonRef.current?.click();
  }

  const statusActive = state.status === 'active';
  const balance = state.mana.balance;

  return (
    <>
    <Panel title="ПРОФІЛЬ ПІЛОТА" sub="FERUM VOX PILOT">
      <div className="m-stack m-pad" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 28, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!editingMeta ? (
                <>
                  <div className="title-font" style={{ fontSize: 40, letterSpacing: 1, lineHeight: 1, color: 'var(--text-bright)', overflowWrap: 'anywhere' }}>
                    {pilot.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: 2 }}>
                    &gt; {pilot.callsign}
                    {state.mechs.length > 0 && <> · ▮ {mechsLine(state.mechs)}</>}
                  </div>
                  {pilot.background && (
                    <div style={{ fontSize: 12, color: 'var(--text-dimmer)', lineHeight: 1.6, maxWidth: 560, textWrap: 'pretty' }}>{pilot.background}</div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
                  <input className="ss-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" />
                  <input className="ss-input" value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="Позивний" />
                  <textarea className="ss-input" value={background} onChange={(e) => setBackground(e.target.value)} rows={2} placeholder="Бекграунд" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" type="button" onClick={saveMeta}>ЗБЕРЕГТИ</button>
                    <button className="btn-ghost" type="button" onClick={() => setEditingMeta(false)}>СКАСУВАТИ</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="ss-tag">ТІР {view.tier}</span>
              <button
                type="button"
                className={`ss-tag ${statusActive ? 'ok' : 'bad'}`}
                title="Перемкнути статус"
                onClick={() => dispatch({ type: 'TOGGLE_STATUS' })}
              >
                {statusActive ? 'АКТИВНИЙ' : 'АРХІВ'}
              </button>
              <div style={{ marginLeft: 6 }}>
                <Menu
                  width={280}
                  items={[
                    { header: 'ІМПОРТ' },
                    { label: 'Завантажити дані з Adventure League log', onClick: () => csvRef.current?.click() },
                    { label: 'Оновити з COMP/CON JSON (мехи і бонд)', onClick: () => pickJson('full') },
                    { label: 'Додати меха з іншого профілю COMP/CON', onClick: () => pickJson('mech') },
                    importMsg && {
                      node: (
                        <div className="mmsg" style={{ color: importMsg.ok ? 'var(--success)' : 'var(--danger)' }}>
                          {importMsg.ok ? '>>' : '!!'} {importMsg.text}
                        </div>
                      ),
                    },
                    { header: 'ПРОФІЛЬ' },
                    { label: "Редагувати ім'я, позивний, бекграунд", onClick: startEdit },
                    { label: state.llEdit.open ? 'Закрити виправлення ЛЛ' : 'Виправити ЛЛ вручну', onClick: () => dispatch({ type: 'TOGGLE_LL_EDIT' }) },
                  ]}
                />
              </div>
              <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCsv} style={{ display: 'none' }} />
              <input ref={jsonRef} type="file" accept=".json,application/json" onChange={handleJson} style={{ display: 'none' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              ІГОР ЗІГРАНО <span style={{ color: 'var(--text-bright)' }}>{state.games}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              ЛЛ <span style={{ color: 'var(--text-bright)' }}>{view.ll}</span>
            </div>
            <div className="ss-meter" style={{ flex: 1, minWidth: 80, height: 10, background: 'var(--input-bg)', border: '1px solid var(--accent-dim)' }}>
              <div style={{ width: `${view.pct}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
            {view.levelCost == null ? (
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>МАКСИМАЛЬНИЙ ЛЛ</div>
            ) : (
              <>
                <div className="num" style={{ fontSize: 11, color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>
                  {balance} / {view.levelCost} М
                </div>
                {/* Рівень не піднімається сам — це явна покупка. Поки мани бракує, кнопка
                    показує залишок, а не неактивну ціну. */}
                {view.canLevelUp ? (
                  <button className="btn" type="button" style={{ minWidth: 200, flexShrink: 0 }} title={`Відкрити вікно підвищення License Level за ${view.levelCost} М`} onClick={() => dispatch({ type: 'OPEN_LEVEL_UP' })}>
                    ПІДВИЩИТИ ЛЛ — {view.levelCost} М
                  </button>
                ) : (
                  <button className="btn-remain" type="button" disabled title={`Підвищення до ЛЛ ${view.ll + 1} коштує ${view.levelCost} М`} style={{ minWidth: 200, flexShrink: 0 }}>
                    ЩЕ {view.levelCost - balance} М ДО ЛЛ {view.ll + 1}
                  </button>
                )}
              </>
            )}
          </div>

          {state.llEdit.open && (
            <div className="ss-box" style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <div className="field-label">ЛЛ (2–12)</div>
                <input
                  className="ss-input"
                  type="number"
                  value={state.llEdit.ll}
                  onChange={(e) => dispatch({ type: 'SET_LL_EDIT_LL', value: e.target.value })}
                  style={{ width: 80 }}
                />
              </div>
              <button className="btn" type="button" onClick={() => dispatch({ type: 'SAVE_LL_EDIT' })}>ЗБЕРЕГТИ</button>
              <button className="btn-ghost" type="button" onClick={() => dispatch({ type: 'TOGGLE_LL_EDIT' })}>СКАСУВАТИ</button>
              <div className="ss-note" style={{ flex: 1, minWidth: 200 }}>
                Ручне виправлення — ману не списує. Для звичайного підвищення є кнопка покупки.
              </div>
            </div>
          )}

          <PilotGames games={games} />
        </div>
        <ArtSlot
          className="m-portrait ss-portrait"
          art={portrait}
          label="ПОРТРЕТ"
          compact
          canEdit={canEditArt}
          onUpload={onUploadPortrait}
          onRemove={onRemoveArt}
          width={120}
          height={144}
          fit="cover"
        />
      </div>
    </Panel>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: -8 }}>
      <button className="btn-ghost" type="button" title="Оновити мехи й бонд із файлу COMP/CON; стан мехів (HP, заряди) зберігається" onClick={() => pickJson('full')} style={{ fontSize: 11, padding: '6px 12px' }}>
        ОНОВИТИ З COMP/CON JSON
      </button>
      <button className="btn-ghost" type="button" title="Завантажити дані з файлу Adventure League log" onClick={() => csvRef.current?.click()} style={{ fontSize: 11, padding: '6px 12px' }}>
        ADVENTURE LEAGUE LOG (CSV)
      </button>
      <div style={{ flex: '1 1 220px', minWidth: 0, fontSize: 11, lineHeight: 1.5, overflowWrap: 'anywhere', color: importMsg ? (importMsg.ok ? 'var(--success)' : 'var(--danger)') : 'var(--text-dimmer)' }}>
        {importMsg
          ? `${importMsg.ok ? '>>' : '!!'} ${importMsg.at} · ${importMsg.text}`
          : '> Цієї сесії файлів ще не завантажували.'}
      </div>
    </div>
    </>
  );
}
