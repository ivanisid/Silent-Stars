import { useEffect, useRef, useState } from 'react';
import { OC_STEPS, PR_SERVICES, SHOP_DATA, mechSlots } from '../constants';
import { shopPrice } from '../logic';
import { showUpgrade } from '../../components/overlayBus';
import {
  KIT_PR,
  KITS_FULL_PR,
  MECH_REACTOR,
  MECH_STRUCTURE,
  isBalor,
  isLimited,
  itemRefillPr,
  reactorLeft,
  fullRepairSummary,
  repairPlan,
  repairQuoteLines,
  spentText,
  structureLeft,
} from '../repair';
import { Menu, Msg, Panel, Track, useConfirm } from '../../components/kit.jsx';
import ArtSlot from './ArtSlot.jsx';
import { isMechNameTaken } from '../compconImport';

// Зв'язок з Foundry вважається робочим, якщо модуль звітував про нього за останні 14 днів:
// між іграми синхронізація мовчить (ГМ не тримає світ відкритим), але бій іде лише там.
const LINK_FRESH_MS = 14 * 24 * 3600e3;

function freshLink(link) {
  if (!link?.seenAt) return null;
  const t = new Date(link.seenAt).getTime();
  return Number.isFinite(t) && Date.now() - t < LINK_FRESH_MS ? link : null;
}

function ago(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 2) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} год тому`;
  return `${Math.round(h / 24)} дн тому`;
}

export default function MechsPanel({
  state, dispatch, pilotId, mechArt = {}, canEditArt, onUploadMechArt, onRemoveArt,
  compconFiles, importCompcon, foundryLinks = {}, isGm = false,
}) {
  const d = state.mechDraft;
  const [ask, dialog] = useConfirm();
  const nameTaken = isMechNameTaken(state.mechs, d.name);
  // Слотів у ангарі: 1, з «Розширеним ангаром» — 2. Не блокуємо: мехів понад слоти могли
  // додати раніше (або для іншого профілю COMP/CON) — лише попереджаємо.
  const slots = mechSlots(state.hangar.owned);
  const over = state.mechs.length > slots;

  return (
    <Panel title="МЕХ АНГАР" sub={`${state.mechs.length} / ${slots}`}>
      {dialog}
      <div className="ss-body" style={{ gap: 14 }}>
        {over && (
          <div className="warn-box" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>
              :: Мехів {state.mechs.length}, а слотів в ангарі {slots}.{' '}
              {slots < 2 ? 'Другий слот дає покращення «Розширений ангар».' : 'Більше слотів жодне покращення не дає.'}
            </span>
            {slots < 2 && (
              <button type="button" className="btn-ghost sm" onClick={() => showUpgrade('parking')}>
                ОСОБИСТІ ПОКРАЩЕННЯ →
              </button>
            )}
          </div>
        )}
        {state.mechs.map((m, slot) => (
          <MechCard
            key={m.id}
            mech={m}
            state={state}
            dispatch={dispatch}
            ask={ask}
            art={mechArt[m.id]}
            canEditArt={canEditArt}
            onUploadArt={(file) => onUploadMechArt(m.id, file)}
            onRemoveArt={onRemoveArt}
            hasFile={compconFiles ? !!compconFiles[String(m.id)] : null}
            link={freshLink(foundryLinks[String(m.id)])}
            isGm={isGm}
            slot={slot}
            importCompcon={importCompcon}
          />
        ))}
        {/* Вільні слоти ангару: файл COMP/CON, завантажений сюди, лягає саме в цей слот. */}
        {Array.from({ length: Math.max(0, slots - state.mechs.length) }, (_, k) => (
          <EmptySlot key={`empty-${k}`} slot={state.mechs.length + k} importCompcon={importCompcon} />
        ))}

        <div className="m-form" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 80px 80px auto', gap: 8 }}>
          <input className="ss-input" style={{ height: 30, fontSize: 12 }} type="text" value={d.name} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'name', value: e.target.value })} placeholder="Назва меха" />
          <input className="ss-input" style={{ height: 30, fontSize: 12 }} type="text" value={d.frame || ''} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'frame', value: e.target.value })} placeholder="Фрейм (Tortuga)" />
          <input className="ss-input" style={{ height: 30, fontSize: 12 }} type="number" value={d.hpMax} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'hpMax', value: e.target.value })} placeholder="HP" />
          <input className="ss-input" style={{ height: 30, fontSize: 12 }} type="number" value={d.repairMax} onChange={(e) => dispatch({ type: 'SET_MECH_DRAFT_FIELD', field: 'repairMax', value: e.target.value })} placeholder="Рем." />
          <button className="btn" type="button" disabled={!d.name.trim() || nameTaken} title="Додати меха з указаними назвою, фреймом, HP та ремкомплектами" onClick={() => dispatch({ type: 'ADD_MECH' })}>+ МЕХ</button>
        </div>
        {nameTaken && <div className="error-box">Мех з назвою «{d.name.trim()}» уже є. Назви мехів мають бути різні.</div>}

      </div>
    </Panel>
  );
}

// Кнопка «з COMP/CON» для конкретного слота: мех з файлу лягає саме сюди (той самий мех —
// оновлення зі збереженням стану, інший — заміна після підтвердження у вікні).
function SlotImportButton({ slot, importCompcon, onResult, label = 'ОНОВИТИ З COMP/CON', className = 'btn-ghost' }) {
  const fileRef = useRef(null);
  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await importCompcon(file, { target: slot });
      if (res) onResult(res);
    } catch (err) {
      onResult({ ok: false, text: err.message });
    }
  }
  return (
    <>
      <button
        className={className}
        type="button"
        title={`Завантажити файл COMP/CON у слот ${slot + 1}: той самий мех оновиться (стан HP і зарядів лишається), інший — замінить цього після підтвердження. Дані пілота не змінюються`}
        onClick={() => fileRef.current?.click()}
      >
        {label}
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} style={{ display: 'none' }} />
    </>
  );
}

function EmptySlot({ slot, importCompcon }) {
  const [msg, setMsg] = useState(null);
  return (
    <div className="ss-slot" style={{ minHeight: 54, justifyContent: 'flex-start', gap: 12, padding: '8px 16px', fontSize: 12, color: 'var(--text-dimmer)', flexWrap: 'wrap' }}>
      <span><span className="pre">&gt; </span>СЛОТ {slot + 1} · ПОРОЖНІЙ</span>
      <SlotImportButton slot={slot} importCompcon={importCompcon} onResult={setMsg} label="ЗАВАНТАЖИТИ МЕХА З COMP/CON" />
      {msg && <span style={{ color: msg.ok ? 'var(--success)' : 'var(--danger)', overflowWrap: 'anywhere' }}>{msg.ok ? '>>' : '!!'} {msg.text}</span>}
    </div>
  );
}

// Згортна секція картки меха.
function Fold({ title, count, open, onToggle, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        className="ss-sect"
        aria-expanded={open}
        title={open ? 'Згорнути секцію' : 'Розгорнути секцію'}
        onClick={onToggle}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ color: 'var(--accent)', fontSize: 10, width: 10 }}>{open ? '▾' : '▸'}</span>
        <span className="ss-label">{title}</span>
        {count != null && <span className="ss-count" style={{ fontSize: 16 }}>{count}</span>}
      </button>
      {open && children}
    </div>
  );
}

const EMPTY_BUILD = (
  <div className="ss-slot" style={{ minHeight: 40, justifyContent: 'flex-start', padding: '0 12px', fontSize: 11, color: 'var(--text-dimmer)' }}>
    <span className="pre">&gt; </span>Немає в даних меха. Завантажте файл COMP/CON цього меха кнопкою «Оновити з COMP/CON» на картці.
  </div>
);

function BuildRow({ name, tag, desc }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 10px', borderBottom: '1px solid var(--input-border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>{name}</span>
        {tag && <span className="ss-tag accent">{tag}</span>}
      </div>
      {desc && <span style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.5, textWrap: 'pretty', overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{desc}</span>}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div className="ss-label" style={{ lineHeight: '16px' }}>{children}</div>;
}

function MechCard({ mech: m, state, dispatch, ask, art, canEditArt, onUploadArt, onRemoveArt, hasFile, link, isGm, slot, importCompcon }) {
  const [msg, setMsg] = useState('');
  const [addType, setAddType] = useState('weapon');
  const [addName, setAddName] = useState('');
  const [addLim, setAddLim] = useState('');
  const editing = state.mechEditId === m.id;
  const pr = state.pr;
  const st = structureLeft(m);
  const rx = reactorLeft(m);
  const oc = Math.min(m.overcharge || 0, 3);
  const items = m.items || [];
  const build = m.build;
  const [open, setOpen] = useState({ items: false, skills: false, talents: false, core: false });
  const fold = (key) => ({ open: open[key], onToggle: () => setOpen((o) => ({ ...o, [key]: !o[key] })) });
  // Мех зв'язаний з актором Foundry: шкода, заряди й Overcharge приходять звідти, тож ручне
  // списання тут заблоковане — лишаються ремонт і покупки. ГМ може розблокувати для правки.
  const [unlocked, setUnlocked] = useState(false);
  const locked = !!link && !(isGm && unlocked);
  const lockTitle = 'Стан приходить із Foundry — змінюйте його в бою там. Тут — ремонт і покупки';
  const ocSteps = m.ocSteps?.length === 4 ? m.ocSteps : OC_STEPS;

  // Скасування помилкового кліку: структура, реактор, ремкомплект і «знищено» без нього
  // повертаються лише за ремкомплекти / PR. Кнопка живе 30 с і зникає після будь-якої
  // іншої дії з цим мехом (тоді значення вже могло змінитися з іншої причини).
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  function lose(action, u) {
    dispatch(action);
    clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = setTimeout(() => setUndo(null), 30000);
  }
  function act(action) {
    if (undo) setUndo(null);
    dispatch(action);
  }
  // Значення ще те, що поставив клік, — інакше скасування вже не про нього.
  const undoValid = undo && (undo.field === 'destroyed'
    ? !!items[undo.idx]?.destroyed && items[undo.idx]?.name === undo.name
    : (m[undo.field] || 0) === undo.after);

  // Ремонт: вікно з розкладом «ремкомплекти / докупівля за PR», «ТАК» неактивна, коли PR бракує.
  async function repair(what, idx) {
    const plan = repairPlan(m, what, idx);
    if (!plan) {
      if (what === 'hp') setMsg('>> HP вже максимальне.');
      return;
    }
    if (plan.free) {
      dispatch({ type: 'MECH_REPAIR', id: m.id, what, idx });
      setMsg(`>> ${plan.done}`);
      return;
    }
    const q = repairQuoteLines(m, pr, plan);
    const ok = await ask({ title: plan.title, question: 'Витратити ремонтний комплект?', lines: q.lines, canYes: q.ok });
    if (!ok) return;
    dispatch({ type: 'MECH_REPAIR', id: m.id, what, idx });
    setMsg(`>> ${plan.done} ${spentText(q.use, q.prCost)}`);
  }

  async function spendPr({ title, question, price, lines, action, done }) {
    const okPr = pr >= price;
    const ok = await ask({
      title,
      question,
      lines: [
        ...lines.map((t) => (typeof t === 'string' ? { t, ink: 'var(--text)' } : t)),
        { t: `PR: ${pr} → ${pr - price}`, ink: 'var(--text)' },
        !okPr && { t: '!! Недостатньо PR.', ink: 'var(--danger)' },
      ],
      canYes: okPr,
    });
    if (!ok) return;
    dispatch(action);
    setMsg(`>> ${done} Списано ${price} PR.`);
  }

  async function removeItem(idx) {
    const it = items[idx];
    const ok = await ask({
      title: 'ВИДАЛЕННЯ',
      question: `Видалити «${it.name}» з меха?`,
      lines: [{ t: 'PR не повертаються. Відкотити можна в журналі операцій.', ink: 'var(--text-dimmer)' }],
      tone: 'danger',
      yesLabel: 'ВИДАЛИТИ',
    });
    if (!ok) return;
    dispatch({ type: 'REMOVE_ITEM', id: m.id, idx });
    setMsg(`>> ${it.name} видалено.`);
  }

  async function removeMech() {
    const ok = await ask({
      title: 'ВИДАЛИТИ МЕХА?',
      tone: 'danger',
      lines: [`«${m.name}»`, `зброя та системи: ${items.length}`, 'відкотити можна в журналі операцій'],
      yesLabel: 'ВИДАЛИТИ',
    });
    if (ok) dispatch({ type: 'REMOVE_MECH', id: m.id });
  }

  // Повний ремонт / передрук — та сама послуга, що в магазині: 100 PR або 500 М.
  // Вікно показує, що саме зламано, і скільки коштував би ремонт частинами.
  async function fullRepair() {
    const { damage, kits } = fullRepairSummary(m);
    if (!damage.length) {
      setMsg('>> Мех цілий — ремонтувати нічого.');
      return;
    }
    const prCost = PR_SERVICES.find((x) => x.key === 'fullrepair').cost;
    const manaCost = shopPrice(SHOP_DATA.find((x) => x.key === 'fullrepair'));
    const mana = state.mana.balance;
    const res = await ask({
      title: 'ПОВНИЙ РЕМОНТ / ПЕРЕДРУК',
      question: `Відновити «${m.name}» повністю за ${prCost} PR або ${manaCost} М?`,
      lines: [
        ...damage.map((t) => ({ t: `> ${t}`, ink: 'var(--text)' })),
        { t: 'Після ремонту все до максимуму: HP, структура, реактор, ремкомплекти, заряди; Overcharge скинуто, Core Power заряджено.', ink: 'var(--text-dimmer)' },
        { t: `PR: ${pr}${pr >= prCost ? ` → ${pr - prCost}` : ' — бракує'} · Мана: ${mana}${mana >= manaCost ? ` → ${mana - manaCost}` : ' — бракує'}`, ink: 'var(--text)' },
      ],
      note: kits
        ? `Частинами може бути дешевше: кнопки «МАКС» і «РЕМОНТ» на картці — разом ${kits} рем. (у меха ${m.repairCurrent}, решта по ${KIT_PR} PR); заряди — окремо.`
        : undefined,
      yesLabel: `${prCost} PR`,
      canYes: pr >= prCost,
      altLabel: `${manaCost} М`,
      canAlt: mana >= manaCost,
    });
    if (res === true) {
      dispatch({ type: 'PR_FULL_REPAIR', id: m.id });
      setMsg(`>> Повний ремонт. Списано ${prCost} PR.`);
    } else if (res === 'alt') {
      dispatch({ type: 'SHOP_BUY', key: 'fullrepair', mechId: m.id });
      setMsg(`>> Повний ремонт. Списано ${manaCost} М.`);
    }
  }

  // ГМ: виправити стан без витрат (помилка синхронізації, рішення за столом).
  async function resetState() {
    const ok = await ask({
      title: 'СКИНУТИ СТАН МЕХА',
      tone: 'gm',
      question: `Відновити «${m.name}» без витрат?`,
      lines: ['HP, ремкомплекти, структура, реактор, заряди — до максимуму', 'PR, мана й ремкомплекти не списуються (ручна правка ГМа)'],
      yesLabel: 'СКИНУТИ',
    });
    if (ok) dispatch({ type: 'FULL_REPAIR_MECH', id: m.id });
  }

  function addItem() {
    if (!addName.trim()) return;
    dispatch({ type: 'ADD_ITEM', id: m.id, itemType: addType, name: addName, max: addLim });
    setAddName('');
    setAddLim('');
  }

  const repFull = m.repairCurrent >= m.repairMax;
  const frameLabel = [m.frameSource, m.frame].filter(Boolean).join(' ').toUpperCase();

  // Групи «ЗБРОЯ» / «СИСТЕМИ» — у порядку списку, заголовок там, де група змінюється.
  let prevGroup = null;

  return (
    <div
      className="m-stack m-pad ss-mech"
      style={{ border: '1px solid var(--input-border)', borderLeft: '3px solid var(--accent)', background: 'var(--panel-sunken)', padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 20 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="ss-tag" title="Слот ангару">СЛОТ {slot + 1}</span>
          <div className="title-font" style={{ fontSize: 20, letterSpacing: 1, color: 'var(--text-bright)' }}>{m.name.toUpperCase()}</div>
          {frameLabel && <span className="ss-tag accent">{frameLabel}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <SlotImportButton slot={slot} importCompcon={importCompcon} onResult={(r) => setMsg(`${r.ok ? '>>' : '!!'} ${r.text}`)} />
            <button className="btn-ghost" type="button" title="Повний ремонт / передрук за 100 PR або 500 М: усе до максимуму. Перед оплатою вікно покаже, що зламано" onClick={fullRepair}>ПОВНИЙ РЕМОНТ</button>
            <Menu
              items={[
                { label: editing ? 'ЗАКРИТИ РЕДАГУВАННЯ' : 'РЕДАГУВАТИ', onClick: () => dispatch({ type: 'TOGGLE_MECH_EDIT', id: m.id }) },
                isGm && link && { label: unlocked ? 'ЗАБЛОКУВАТИ РУЧНІ ЗМІНИ' : 'РОЗБЛОКУВАТИ РУЧНІ ЗМІНИ (ГМ)', onClick: () => setUnlocked((u) => !u) },
                isGm && { label: 'СКИНУТИ СТАН БЕЗ ВИТРАТ (ГМ)…', onClick: resetState },
                { label: 'ВИДАЛИТИ…', danger: true, onClick: removeMech },
              ].filter(Boolean)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {link ? (
            <span className="ss-tag ok" title={`Актор «${link.actor || '—'}» · остання синхронізація ${ago(link.seenAt)}`}>
              ⇄ FOUNDRY · {ago(link.seenAt).toUpperCase()}
            </span>
          ) : (
            <span className="ss-tag" title="Модуль Foundry не повідомляв про зв'язок з цим мехом останні 14 днів — стан ведеться в апці вручну">
              FOUNDRY · НЕ ЗВ'ЯЗАНО
            </span>
          )}
          {hasFile != null && (
            <span
              className={`ss-tag ${hasFile ? 'ok' : 'bad'}`}
              title={hasFile ? 'Файл COMP/CON цього меха збережено в апці' : 'Немає файлу COMP/CON — ГМ не зможе створити з нього актора. Завантажте «Оновити з COMP/CON JSON»'}
            >
              {hasFile ? '● ФАЙЛ ОНЛАЙН' : '○ ФАЙЛ НЕ ЗАВАНТАЖЕНО'}
            </span>
          )}
        </div>
        {locked && (
          <div className="ss-note" style={{ fontSize: 11 }}>
            <span className="pre">&gt; </span>Шкода, заряди, Overcharge і Core Power приходять із Foundry. Тут — ремонт за ремкомплекти, PR і ману.
          </div>
        )}
        {isGm && link && unlocked && <Msg kind="warn">Ручні зміни розблоковано (ГМ) — наступна синхронізація може їх перезаписати.</Msg>}

        {msg && <Msg kind={msg.startsWith('!!') ? 'err' : 'ok'}>{msg}</Msg>}
        {undoValid && (
          <div className="warn-box" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 160 }}>:: {undo.label}. Випадково?</span>
            <button
              type="button"
              className="btn-ghost sm"
              title="Повернути значення до кліку без витрат — лише одразу після дії"
              onClick={() => {
                dispatch({ type: 'UNDO_MECH_FIELD', id: m.id, field: undo.field, value: undo.value, idx: undo.idx, label: undo.label });
                clearTimeout(undoTimer.current);
                setUndo(null);
              }}
            >
              ↶ СКАСУВАТИ
            </button>
          </div>
        )}

        {editing && <MechEdit mech={m} state={state} dispatch={dispatch} />}

        <div className="m-one" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '14px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <FieldLabel>HP</FieldLabel>
            <div className="ss-stepper">
              <button type="button" disabled={locked} title={locked ? lockTitle : 'Отримати пошкодження'} onClick={() => act({ type: 'DEC_MECH_HP', id: m.id })}>−</button>
              <div className="v" title={m.hpBonus ? `Макс. HP з бонусами: ${m.hpBonus}` : undefined}>{m.hpCurrent} / {m.hpMax}</div>
              <button type="button" disabled={locked} title={locked ? lockTitle : '+1 HP'} onClick={() => act({ type: 'INC_MECH_HP', id: m.id })}>+</button>
            </div>
            <div className="ss-track-actions">
              <button className="btn-ghost sm" type="button" title={isBalor(m) ? 'BALOR — без ремкомплекту' : '1 ремкомплект'} onClick={() => repair('hp')}>
                ВІДНОВИТИ МАКС
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <FieldLabel>РЕМКОМПЛЕКТИ</FieldLabel>
            <div className="ss-stepper">
              <button type="button" disabled={locked} title={locked ? lockTitle : 'Витратити ремкомплект'} onClick={() => lose({ type: 'DEC_MECH_REPAIR', id: m.id }, { field: 'repairCurrent', value: m.repairCurrent, after: Math.max(0, m.repairCurrent - 1), label: 'ремкомплект −1' })}>−</button>
              <div className="v">{m.repairCurrent} / {m.repairMax}</div>
              <button
                type="button"
                title={`Купити 1 ремкомплект за ${KIT_PR} PR`}
                disabled={repFull}
                onClick={() =>
                  spendPr({
                    title: 'КУПІВЛЯ РЕМКОМПЛЕКТУ',
                    question: `Купити 1 ремкомплект за ${KIT_PR} PR?`,
                    price: KIT_PR,
                    lines: [`Ремкомплекти: ${m.repairCurrent} → ${m.repairCurrent + 1}`],
                    action: { type: 'BUY_KITS', id: m.id, mode: 'one' },
                    done: 'Куплено 1 ремкомплект.',
                  })
                }
              >
                +
              </button>
            </div>
            <div className="ss-track-actions">
              <button
                className="btn-ghost sm"
                type="button"
                disabled={repFull}
                title={`Поповнити ремкомплекти до максимуму за ${KITS_FULL_PR} PR`}
                onClick={() =>
                  spendPr({
                    title: 'КУПІВЛЯ РЕМКОМПЛЕКТІВ',
                    question: `Поповнити до максимуму за ${KITS_FULL_PR} PR?`,
                    price: KITS_FULL_PR,
                    lines: [`Ремкомплекти: ${m.repairCurrent} → ${m.repairMax}`],
                    action: { type: 'BUY_KITS', id: m.id, mode: 'full' },
                    done: 'Ремкомплекти поповнено до максимуму.',
                  })
                }
              >
                {repFull ? 'ПОВНІ' : `МАКС · ${KITS_FULL_PR} PR`}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <FieldLabel>СТРУКТУРА</FieldLabel>
            <Track size="lg" value={st} max={MECH_STRUCTURE} label="Структура" />
            <div className="ss-track-actions">
              <button type="button" className="ss-sq" title={locked ? lockTitle : 'Отримати пошкодження'} disabled={locked || st <= 0} onClick={() => lose({ type: 'DAMAGE_MECH', id: m.id, what: 'structure' }, { field: 'structureFilled', value: m.structureFilled || 0, after: (m.structureFilled || 0) + 1, label: 'структура −1' })}>−</button>
              <button type="button" className="ss-sq" title="Відновити 1" disabled={st >= MECH_STRUCTURE} onClick={() => repair('structure')}>+</button>
              <button className="btn-ghost sm" type="button" disabled={st >= MECH_STRUCTURE} title="Відновити структуру до максимуму за ремкомплекти; яких бракує, докуповуються по 10 PR" onClick={() => repair('structureMax')}>МАКС</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <FieldLabel>РЕАКТОР</FieldLabel>
            <Track size="lg" value={rx} max={MECH_REACTOR} label="Реактор" />
            <div className="ss-track-actions">
              <button type="button" className="ss-sq" title={locked ? lockTitle : 'Отримати пошкодження'} disabled={locked || rx <= 0} onClick={() => lose({ type: 'DAMAGE_MECH', id: m.id, what: 'reactor' }, { field: 'reactorFilled', value: m.reactorFilled || 0, after: (m.reactorFilled || 0) + 1, label: 'реактор −1' })}>−</button>
              <button type="button" className="ss-sq" title="Відновити 1" disabled={rx >= MECH_REACTOR} onClick={() => repair('reactor')}>+</button>
              <button className="btn-ghost sm" type="button" disabled={rx >= MECH_REACTOR} title="Відновити реактор до максимуму за ремкомплекти; яких бракує, докуповуються по 10 PR" onClick={() => repair('reactorMax')}>МАКС</button>
            </div>
          </div>

          <div className="ss-tile" style={{ padding: 0 }}>
            <button type="button" className="ss-sq" style={{ height: '100%', width: 28, border: 'none', borderRight: '1px solid var(--input-border)' }} disabled={locked || oc <= 0} title={locked ? lockTitle : 'Overcharge на крок назад'} onClick={() => act({ type: 'SHIFT_MECH_OVERCHARGE', id: m.id, dir: -1 })}>−</button>
            <span style={{ color: 'var(--text-dim)', fontSize: 18, lineHeight: 1 }}>✸</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="big">{ocSteps[oc]}</span>
                <span className="cap" title={m.ocSource ? `${m.ocSource}: ${ocSteps.join(' → ')}` : undefined}>OVERCHARGE{m.ocSource ? ' ◆' : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 2, width: 48, height: 2 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ flex: 1, background: i <= oc ? 'var(--accent)' : 'var(--panel-inset)' }} />
                ))}
              </div>
            </div>
            <button type="button" className="ss-sq" style={{ height: '100%', width: 28, border: 'none', borderLeft: '1px solid var(--input-border)' }} disabled={locked || oc >= 3} title={locked ? lockTitle : `Overcharge на крок уперед: ${ocSteps.join(' → ')}${m.ocSource ? ` (${m.ocSource})` : ''}`} onClick={() => act({ type: 'SHIFT_MECH_OVERCHARGE', id: m.id, dir: 1 })}>+</button>
          </div>
          <button type="button" className="ss-tile" disabled={locked} onClick={() => act({ type: 'TOGGLE_MECH_CORE', id: m.id })} title={locked ? lockTitle : 'Перемкнути Core power'}>
            <span style={{ color: m.corePower ? 'var(--success)' : 'var(--text-faint)', fontSize: 16, lineHeight: 1 }}>◈</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="big" style={{ fontSize: 16, color: m.corePower ? 'var(--success)' : 'var(--text-faint)' }}>{m.corePower ? 'ЗАРЯДЖЕНО' : 'ВИТРАЧЕНО'}</span>
              <span className="cap">CORE POWER</span>
            </div>
          </button>
        </div>

        <Fold title="ЗБРОЯ ТА СИСТЕМИ" count={items.length} {...fold('items')}>
          <div className="ss-list">
            {items.map((it, i) => {
              const group = it.type === 'weapon' ? 'ЗБРОЯ' : 'СИСТЕМИ';
              const head = group !== prevGroup ? group : null;
              const first = prevGroup === null;
              prevGroup = group;
              const lim = isLimited(it);
              const price = lim ? itemRefillPr(it) : 0;
              const sub = [it.mount, lim ? 'LIMITED' : null, it.retained ? 'ЛИШИЛАСЬ ДО РЕМОНТУ / ПОПОВНЕННЯ (немає в новому файлі)' : null].filter(Boolean).join(' · ') || '—';
              return (
                <div key={i}>
                  {head && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'var(--panel)', borderBottom: '1px solid var(--input-border)', borderTop: first ? 'none' : '1px solid var(--panel-inset)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)' }}>
                      <div style={{ width: 6, height: 6, background: 'var(--accent)' }} />
                      {head}
                    </div>
                  )}
                  <div className="m-item" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--input-border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ color: it.destroyed ? 'var(--text-faint)' : 'var(--text)', textDecoration: it.destroyed ? 'line-through' : 'none', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{it.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>{sub}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {lim && (
                        <>
                          <div className="ss-stepper sm" style={{ background: 'transparent' }}>
                            <button type="button" disabled={locked} title={locked ? lockTitle : 'Витратити 1 заряд'} onClick={() => act({ type: 'DEC_ITEM', id: m.id, idx: i })}>−</button>
                            <div className="v">{it.current} / {it.max}</div>
                            <button type="button" disabled={locked} title={locked ? lockTitle : 'Повернути 1 заряд без списання PR'} onClick={() => act({ type: 'INC_ITEM', id: m.id, idx: i })}>+</button>
                          </div>
                          {it.current < it.max && (
                            <button
                              className="btn-outline sm"
                              type="button"
                              title="Поповнити заряди до максимуму"
                              onClick={() =>
                                spendPr({
                                  title: 'ПОПОВНЕННЯ ЗАРЯДІВ',
                                  question: `Поповнити заряди за ${price} PR?`,
                                  price,
                                  lines: [`${it.name}: ${it.current} → ${it.max}`, { t: `Базовий запас ${it.base ?? it.max} → ${price} PR`, ink: 'var(--text-dimmer)' }],
                                  action: { type: 'REFILL_ITEM', id: m.id, idx: i },
                                  done: 'Заряди поповнено.',
                                })
                              }
                            >
                              ↻ {price} PR
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                      {it.destroyed ? (
                        <button className="btn-danger sm" type="button" title="Ремонт за 1 ремкомплект" onClick={() => repair('item', i)}>
                          ЗНИЩЕНО · РЕМОНТ
                        </button>
                      ) : (
                        <button type="button" className="ss-icon ghost" disabled={locked} title={locked ? lockTitle : 'Позначити знищеним'} onClick={() => lose({ type: 'MARK_ITEM_DESTROYED', id: m.id, idx: i }, { field: 'destroyed', idx: i, name: it.name, label: `${it.name}: знищено` })}>
                          ⊘
                        </button>
                      )}
                      <button type="button" className="ss-icon ghost" style={{ fontSize: 11 }} title="Видалити з меха" onClick={() => removeItem(i)}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--input-bg)' }}>
              <span className="pre" style={{ color: 'var(--accent)' }}>&gt;</span>
              <div className="ss-seg sm">
                <button type="button" className={addType === 'weapon' ? 'on' : ''} title="Додати як зброю" onClick={() => setAddType('weapon')}>ЗБРОЯ</button>
                <button type="button" className={addType === 'system' ? 'on' : ''} title="Додати як систему" onClick={() => setAddType('system')}>СИСТЕМА</button>
              </div>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="Назва"
                style={{ flex: '1 1 120px', minWidth: 0, height: 24, padding: '0 6px', fontSize: 12, background: 'transparent', border: 'none' }}
              />
              <input
                value={addLim}
                onChange={(e) => setAddLim(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="Заряди"
                inputMode="numeric"
                style={{ width: 70, height: 24, padding: '0 6px', fontSize: 12, background: 'var(--panel-sunken)' }}
              />
              <button className="btn sm" type="button" style={{ width: 28, padding: 0, fontSize: 12 }} disabled={!addName.trim()} onClick={addItem} title="Додати">+</button>
            </div>
          </div>
        </Fold>

        <Fold title="МЕХ СКІЛИ" {...fold('skills')}>
          {build?.skills ? (
            <div className="ss-cells" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              {build.skills.map((s) => (
                <div key={s.name}>
                  <span className="k">{s.name}</span>
                  <span className="ss-count">{s.value}</span>
                </div>
              ))}
            </div>
          ) : EMPTY_BUILD}
        </Fold>

        <Fold title="ТАЛАНТИ" count={build?.talents?.length} {...fold('talents')}>
          {build?.talents ? (
            build.talents.length ? (
              <div className="ss-list">
                {build.talents.map((t) => (
                  <div key={t.name}>
                    <BuildRow name={t.name} tag={`РАНГ ${t.rank}`} />
                    {t.ranks.map((r, i) => (
                      <div key={i} style={{ paddingLeft: 14 }}>
                        <BuildRow name={`${i + 1}. ${r.name}`} desc={r.desc} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : EMPTY_BUILD
          ) : EMPTY_BUILD}
        </Fold>

        <Fold title="КОР БОНУСИ" count={build?.coreBonuses?.length} {...fold('core')}>
          {build?.coreBonuses?.length ? (
            <div className="ss-list">
              {build.coreBonuses.map((c) => <BuildRow key={c.name} name={c.name} tag={c.source} desc={c.desc} />)}
            </div>
          ) : EMPTY_BUILD}
        </Fold>
      </div>
      <div className="m-side" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 220, maxWidth: '100%', minWidth: 0 }}>
        <ArtSlot
          className="m-portrait ss-mechimg"
          art={art}
          label="ЗОБРАЖЕННЯ МЕХА"
          canEdit={canEditArt}
          onUpload={onUploadArt}
          onRemove={onRemoveArt}
          width={220}
          height={240}
        />
        {build?.licenses?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <FieldLabel>ЛІЦЕНЗІЇ</FieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {build.licenses.map((l) => (
                <div key={l.name} className="ss-tile" style={{ minHeight: 34, justifyContent: 'space-between', padding: '0 12px' }}>
                  <span style={{ fontSize: 12, letterSpacing: 1, color: 'var(--text)', overflowWrap: 'anywhere' }}>{l.name.toUpperCase()}</span>
                  <span className="big" style={{ fontSize: 18 }}>{l.rank}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Правка капів меха і максимумів зарядів (Engineering, кор-бонуси, фрейм — не все видно з імпорту).
function MechEdit({ mech: m, state, dispatch }) {
  const limited = (m.items || []).map((it, idx) => ({ it, idx })).filter(({ it }) => isLimited(it));
  return (
    <div className="ss-box" style={{ background: 'var(--panel)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div className="field-label">HP КАП</div>
          <input className="ss-input sm" type="number" value={state.mechEdit.hpMax} onChange={(e) => dispatch({ type: 'SET_EDIT_HP', value: e.target.value })} style={{ width: 80 }} />
        </div>
        <div>
          <div className="field-label">РЕМ. КАП</div>
          <input className="ss-input sm" type="number" value={state.mechEdit.repairMax} onChange={(e) => dispatch({ type: 'SET_EDIT_REPAIR', value: e.target.value })} style={{ width: 80 }} />
        </div>
        <div>
          <div className="field-label">ФРЕЙМ</div>
          <input className="ss-input sm" type="text" value={state.mechEdit.frame || ''} onChange={(e) => dispatch({ type: 'SET_EDIT_FRAME', value: e.target.value })} placeholder="Tortuga" style={{ width: 140 }} />
        </div>
        <button className="btn md" type="button" title="Зберегти ліміти HP та ремкомплектів і фрейм меха" onClick={() => dispatch({ type: 'SAVE_MECH_EDIT' })}>ЗБЕРЕГТИ</button>
      </div>
      {limited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="ss-label">МАКСИМУМ ЗАРЯДІВ</div>
          {limited.map(({ it, idx }) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{it.name}</span>
              <input
                className="ss-input sm"
                type="number"
                min={1}
                value={it.max}
                onChange={(e) => dispatch({ type: 'SET_ITEM_MAX', id: m.id, idx, value: e.target.value })}
                title="Максимум зарядів"
                style={{ width: 60, textAlign: 'center' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
