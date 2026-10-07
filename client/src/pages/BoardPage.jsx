import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { llTier } from '../pilot/logic';
import { Msg, PageHeader, PageShell, Panel, useConfirm } from '../components/kit.jsx';
import { DIFFICULTY_GROUPS, difficultyByKey, difficultyLabel } from '../difficulty';
import DateTimeField from '../components/DateTimeField.jsx';

// Gold as *text on a card*, so it stays legible on the light themes; --gm itself is
// the bright gold meant for the GM's own dark surfaces.
const GOLD = 'var(--gm-ink)';

// Дати слоту необов'язкові, тож null сюди приходить штатно. Перевірка на null окрема
// від перевірки на Invalid Date: new Date(null) — це не помилка, а 1970 рік, і без
// цього рядка слот без дати показував би «01.01.1970».
function formatDT(iso) {
  if (iso == null || iso === '') return 'не вказано';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Дедлайн, якого немає, не може минути. Та сама пастка з new Date(null) = 1970:
// без цієї перевірки кожен слот без дедлайну вважався б протермінованим.
function deadlineIsPast(iso) {
  if (iso == null || iso === '') return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

// The badge sits on the card header, whose background is the theme's saturated primary
// — a status colour there can land gold-on-gold. It takes the header's own ink and
// leans on wording plus emphasis instead; the words already say the state.
function statusBadge(slot) {
  if (slot.status === 'cancelled') return { text: 'СКАСОВАНО', strong: true };
  // Two distinct things: the line-up is fixed (nobody else joins), and the game has been
  // played and paid for. A slot passes through the first on its way to the second.
  if (slot.status === 'closed') return { text: 'ГРА ЗАВЕРШЕНА', strong: true };
  if (slot.status === 'approved') return { text: 'СКЛАД ЗАТВЕРДЖЕНО · ЗАПИС ЗАКРИТО', strong: true };
  // The deadline is a hint for players, not a lock — only the GM closing the slot ends signup.
  if (deadlineIsPast(slot.signupDeadline)) return { text: 'ДЕДЛАЙН МИНУВ · НАБІР ЩЕ ВІДКРИТО', strong: true };
  return { text: 'НАБІР ВІДКРИТО', strong: false };
}

// Вибір складності випадаючим меню: у кожному пункті видно нагороду, яку він проставить,
// і рекомендований ЛЛ; пункти згруповані за рівнем. Перший пункт — «без складності»,
// бо вона необов'язкова. onPick отримує пресет або null.
const DIFFICULTY_TIERS = ['Легка', 'Середня', 'Важка'];

function DifficultyPicker({ value, onPick }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onPick(difficultyByKey(e.target.value))}
      className="ss-select"
      style={{ width: '100%', fontSize: 12 }}
    >
      <option value="">— без складності —</option>
      {DIFFICULTY_GROUPS.map((group, i) => (
        <optgroup key={i} label={DIFFICULTY_TIERS[i]}>
          {group.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label} — {d.mana} М · {d.pr} PR · {d.ll}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// 1 пілот · 2 пілоти · 5 пілотів — the ordinary rule, with the 11–14 exception.
function pluralPilots(n) {
  const ones = n % 10;
  const teens = n % 100;
  if (ones === 1 && teens !== 11) return 'пілот';
  if (ones >= 2 && ones <= 4 && (teens < 12 || teens > 14)) return 'пілоти';
  return 'пілотів';
}

// Only http(s) is matched, so a linkified href can never be a javascript: URL.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function linkify(text) {
  // String.split with a capturing group puts the matches at the odd indices.
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--accent)', textDecoration: 'underline', overflowWrap: 'anywhere' }}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

// A pasted Discord link is one long unbreakable token, which used to run straight out
// of the card. Wrap anywhere, clamp a long description to a few lines, and let it open.
function Description({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 200 || text.split('\n').length > 3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-soft)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          ...(long && !open ? { maxHeight: '4.8em', overflow: 'hidden' } : null),
        }}
      >
        {linkify(text)}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 10, letterSpacing: 1, color: 'var(--accent)' }}
        >
          {open ? 'ЗГОРНУТИ ОПИС ▴' : 'РОЗГОРНУТИ ОПИС ▾'}
        </button>
      )}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>{label}</span>
      {children}
    </label>
  );
}

// GM slot creation form, collapsed behind a button.
function CreateSlotForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [gameAt, setGameAt] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [seats, setSeats] = useState(4);
  const [rewardMana, setRewardMana] = useState(0);
  const [rewardPr, setRewardPr] = useState(0);
  // Складність — необов'язкова: ГМ може задати нагороду вручну й не обирати її.
  const [difficulty, setDifficulty] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    // Дати необов'язкові: слот може існувати як «колись зіграємо», без розкладу.
    const seatsNum = Number(seats);
    if (!Number.isInteger(seatsNum) || seatsNum < 1) return setError('Кількість місць — ціле число від 1.');
    const manaNum = Number(rewardMana);
    const prNum = Number(rewardPr);
    if (!Number.isInteger(manaNum) || manaNum < 0) return setError('Нагорода в мані — ціле число від 0.');
    if (!Number.isInteger(prNum) || prNum < 0) return setError('Нагорода в PR — ціле число від 0.');
    setBusy(true);
    setError('');
    try {
      await api.gmCreateSlot({
        title,
        description,
        gameAt: gameAt ? gameAt.toISOString() : null,
        signupDeadline: deadline ? deadline.toISOString() : null,
        seats: seatsNum,
        rewardMana: manaNum,
        rewardPr: prNum,
        difficulty,
      });
      setTitle('');
      setDescription('');
      setGameAt(null);
      setDeadline(null);
      setDifficulty('');
      setSeats(4);
      setRewardMana(0);
      setRewardPr(0);
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-gm" type="button" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
        + СТВОРИТИ СЛОТ ГРИ
      </button>
    );
  }

  return (
    <Panel title="НОВИЙ СЛОТ ГРИ" tone="gm">
      <form onSubmit={submit} className="ss-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
          <Field label="НАЗВА">
            <input className="ss-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Назва місії" />
          </Field>
          <Field label="СКЛАДНІСТЬ · ЗАПОВНЮЄ НАГОРОДУ">
            <DifficultyPicker
              value={difficulty}
              onPick={(d) => {
                // Пресет заповнює обидва поля нагороди; «без складності» знімає вибір,
                // але вже проставлені числа лишає — їх правлять руками нижче.
                if (!d) return setDifficulty('');
                setDifficulty(d.key);
                setRewardMana(d.mana);
                setRewardPr(d.pr);
              }}
            />
          </Field>
        </div>
        <Field label="ОПИС">
          <textarea className="ss-input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Короткий опис гри…" style={{ fontSize: 12 }} />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DateTimeField label="ДАТА ГРИ" value={gameAt} onChange={setGameAt} />
          <DateTimeField label="КІНЕЦЬ НАБОРУ" value={deadline} onChange={setDeadline} />
          <Field label="МІСЦЬ">
            <input className="ss-input" type="number" min={1} max={20} value={seats} onChange={(e) => setSeats(e.target.value)} style={{ width: 80 }} />
          </Field>
          <Field label="НАГОРОДА · М">
            <input className="ss-input" type="number" min={0} value={rewardMana} onChange={(e) => setRewardMana(e.target.value)} style={{ width: 100 }} />
          </Field>
          <Field label="НАГОРОДА · PR">
            <input className="ss-input" type="number" min={0} value={rewardPr} onChange={(e) => setRewardPr(e.target.value)} style={{ width: 80 }} />
          </Field>
        </div>
        <div className="ss-note">
          Дати необов'язкові. Нагороду можна змінити до завершення гри — тоді її отримають затверджені пілоти разом з однією зіграною грою.
        </div>
        {error && <Msg kind="err">{error}</Msg>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="submit" disabled={busy}>СТВОРИТИ</button>
          <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>СКАСУВАТИ</button>
        </div>
      </form>
    </Panel>
  );
}

// Нагорода ГМа за гру: стільки ж мани чи PR, скільки гравцям, одному зі своїх пілотів, або +3 до пріоритету.
function gmRewardOptions(slot, hasPilots) {
  const needPilot = hasPilots ? '' : 'Потрібен хоча б один ваш персонаж';
  return [
    {
      key: 'mana',
      label: `ОТРИМАТИ МАНУ · ${slot.rewardMana} М`,
      disabled: !hasPilots || slot.rewardMana <= 0,
      hint: slot.rewardMana <= 0 ? 'У цієї гри немає нагороди мани' : needPilot,
    },
    {
      key: 'pr',
      label: `ОТРИМАТИ PR · ${slot.rewardPr}`,
      disabled: !hasPilots || slot.rewardPr <= 0,
      hint: slot.rewardPr <= 0 ? 'У цієї гри немає нагороди PR' : needPilot,
    },
    { key: 'priority', label: 'ОТРИМАТИ ПРІОРИТЕТ · +3', disabled: false, hint: '' },
  ];
}

// Текст про нагороду ГМа: для вже завершеної гри береться зі слота, для підтвердження — з вибору.
function gmRewardText(slot, key = slot.gmReward, pilot = null) {
  const who = pilot?.callsign || slot.gmRewardPilot;
  if (key === 'mana') return `${slot.rewardMana} М${who ? ` → ${who}` : ''}`;
  if (key === 'pr') return `${slot.rewardPr} PR${who ? ` → ${who}` : ''}`;
  if (key === 'priority') return '+3 до пріоритету';
  return '—';
}

function SlotCard({ slot, user, isGm, myPilots, onChanged }) {
  const navigate = useNavigate();
  const [pilotId, setPilotId] = useState('');
  const [mechId, setMechId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // GM roster picks (signup ids) before resolving.
  const [picked, setPicked] = useState(() => new Set());
  const [editReward, setEditReward] = useState(false);
  const [rMana, setRMana] = useState(0);
  const [rPr, setRPr] = useState(0);
  const [rDiff, setRDiff] = useState('');
  // Завершення гри: ГМ обирає одну нагороду для себе — ману, PR (одному зі своїх пілотів) або пріоритет.
  const [closing, setClosing] = useState(false);
  const [gmReward, setGmReward] = useState('');
  const [gmPilotId, setGmPilotId] = useState('');
  // Збереження нагороди мовчазне: без підтвердження ГМ не відрізняє «зберіг»
  // від «передумав і закрив редактор».
  const [savedNote, setSavedNote] = useState('');
  // Підтвердження «теги скопійовано» — без нього кнопка нічим не показує, що спрацювала.
  const [tagsNote, setTagsNote] = useState('');
  const [ask, dialog] = useConfirm();

  const badge = statusBadge(slot);
  const isOpen = slot.status === 'open';
  // Roster locked, game still ahead — signup is shut but nothing has been awarded.
  const isApproved = slot.status === 'approved';
  // Played and settled: 'closed' is set by the call that pays the reward out.
  const isDone = slot.status === 'closed';
  const awarded = slot.signups.filter((g) => g.approved === true).length;
  // Нагороду отримують лише записи з пілотом; запис без прив'язки до апки пілота не має.
  const rewarded = slot.signups.filter((g) => g.approved === true && g.pilotId).length;
  const mySignup = slot.signups.find((g) => g.userId === user.id);
  const contest = slot.signups.length > slot.seats;
  // Пріоритет (d20 + бонус) кидається під час запису; вищий іде вгору списку, рівні — у порядку запису.
  // Гарантоване місце (бонус +9) — над усіма: воно входить у склад, хоч би що відмітив ГМ.
  const priority = (g) => (g.guaranteed ? 1000 : g.roll === null ? -1 : g.roll + (g.rollBonus || 0));
  const ranked = [...slot.signups].sort((a, b) => priority(b) - priority(a));
  // Скільки реально піде в склад: відмічені ГМом плюс гарантовані.
  const rosterSize = new Set([...picked, ...slot.signups.filter((g) => g.guaranteed).map((g) => g.id)]).size;
  const deadlinePassed = deadlineIsPast(slot.signupDeadline);
  // Running the game is what grants the controls, not being a GM: another GM is an
  // ordinary player here, and the person running it does not play in it.
  const ownsSlot = slot.createdBy === user.id;

  // A mech is only worth asking about when the pilot actually has a choice to make.
  const chosenPilot = myPilots.find((p) => p.id === pilotId);
  const mechs = chosenPilot?.mechs || [];
  const needsMechChoice = mechs.length > 1;

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Редактор закривається лише після підтвердженого збереження. Раніше він закривався
  // одразу перед запитом, тож невдала правка виглядала як успішна: панель зникала, а на
  // картці лишалась стара сума — і саме ця сума потім ішла в нагороду.
  async function saveReward() {
    const m = Number(rMana);
    const d = Number(rPr);
    if (!Number.isInteger(m) || m < 0 || !Number.isInteger(d) || d < 0) {
      return setError('Нагорода — цілі числа від 0.');
    }
    setBusy(true);
    setError('');
    setSavedNote('');
    try {
      const saved = await api.gmUpdateSlotReward(slot.id, { rewardMana: m, rewardPr: d, difficulty: rDiff });
      await onChanged();
      setEditReward(false);
      const lbl = difficultyLabel(saved.difficulty);
      setSavedNote(`Збережено: ${saved.rewardMana} М · ${saved.rewardPr} PR${lbl ? ` · ${lbl}` : ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Поля нагороди не в <form>, тож Enter сам по собі нічого не робив: ГМ міг набрати
  // суму, натиснути Enter і піти далі, вважаючи що зберіг.
  function onRewardKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveReward();
    } else if (e.key === 'Escape') {
      setEditReward(false);
    }
  }

  function togglePick(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmThen(opts, fn) {
    if (await ask(opts)) run(fn);
  }

  const meta = [
    { k: 'ВЕДЕ', v: `${slot.createdByNick || '—'}${ownsSlot ? ' (ви)' : ''}`, ink: ownsSlot ? GOLD : undefined },
    { k: 'ГРА', v: formatDT(slot.gameAt) },
    { k: 'НАБІР ДО', v: formatDT(slot.signupDeadline), ink: deadlinePassed && isOpen ? 'var(--warn)' : undefined },
    { k: 'МІСЦЬ / ЗАПИСАЛОСЬ', v: `${slot.seats} / ${slot.signups.length}`, ink: contest ? 'var(--warn)' : undefined },
    difficultyLabel(slot.difficulty) && { k: 'СКЛАДНІСТЬ', v: difficultyLabel(slot.difficulty) },
    { k: 'НАГОРОДА', v: `${slot.rewardMana} М · ${slot.rewardPr} PR`, ink: slot.rewardMana || slot.rewardPr ? GOLD : 'var(--text-dimmer)' },
  ].filter(Boolean);

  return (
    <Panel
      title={slot.title || 'ГРА БЕЗ НАЗВИ'}
      sub={<span style={{ opacity: badge.strong ? 1 : 0.72, fontSize: 10 }}>{badge.text}</span>}
      tone={isDone ? 'done' : undefined}
      style={slot.status === 'cancelled' ? { opacity: 0.55 } : undefined}
    >
      {dialog}
      <div className="ss-body">
        {isDone && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
            <span className="title-font" style={{ fontSize: 14, letterSpacing: 2, color: 'var(--success)' }}>✓ ГРА ЗАВЕРШЕНА</span>
            <span style={{ fontSize: 11, color: 'var(--text-soft)', lineHeight: 1.6 }}>
              {rewarded > 0
                ? `Нагороди нараховано · ${rewarded} ${pluralPilots(rewarded)} · ${slot.rewardMana} М кожному` +
                  `${slot.rewardPr > 0 ? ` · ${slot.rewardPr} PR` : ''}`
                : 'Нікого не затверджено — нагород не нараховано'}
              {slot.gmReward && ` · ГМ: ${gmRewardText(slot)}`}
            </span>
          </div>
        )}

        {isApproved && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--panel-sunken)', border: '1px solid var(--input-border)' }}>
            <span className="title-font" style={{ fontSize: 14, letterSpacing: 2, color: 'var(--text-bright)' }}>СКЛАД ЗАТВЕРДЖЕНО</span>
            <span style={{ fontSize: 11, color: 'var(--text-soft)', lineHeight: 1.6 }}>
              {awarded > 0
                ? `Грає ${awarded} ${pluralPilots(awarded)} · запис закрито · нагороду буде нараховано, коли ГМ завершить гру`
                : 'Нікого не затверджено · запис закрито'}
            </span>
          </div>
        )}

        <div className="ss-cells">
          {meta.map((m) => (
            <div key={m.k}>
              <span className="k">{m.k}</span>
              <span className="v" style={{ color: m.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.v}>{m.v}</span>
            </div>
          ))}
        </div>

        {slot.description && <Description text={slot.description} />}

        {contest && isOpen && (
          <div style={{ fontSize: 11, color: 'var(--warn)', letterSpacing: 1 }}>:: Учасників більше, ніж місць — склад визначає пріоритет.</div>
        )}

        {slot.signups.length > 0 && (
          <div className="ss-list">
            {ranked.map((g, i) => {
              const mine = g.userId === user.id;
              const checked = g.guaranteed || picked.has(g.id);
              return (
                <div
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '8px 10px',
                    borderTop: i ? '1px solid var(--input-border)' : 'none',
                    background: mine ? 'var(--panel-inset)' : 'transparent',
                    borderLeft: `3px solid ${mine ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  {ownsSlot && isOpen && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={g.guaranteed}
                      title={g.guaranteed ? 'Гарантоване місце — входить у склад автоматично' : 'У склад'}
                      onClick={() => togglePick(g.id)}
                      style={{
                        flex: 'none',
                        width: 18,
                        height: 18,
                        padding: 0,
                        border: `1px solid ${checked ? 'var(--gm)' : 'var(--gm-dim)'}`,
                        background: checked ? 'var(--gm)' : 'var(--input-bg)',
                        color: 'var(--bg)',
                        fontSize: 12,
                        lineHeight: '16px',
                        opacity: g.guaranteed ? 0.6 : 1,
                        cursor: g.guaranteed ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {checked ? '✓' : ''}
                    </button>
                  )}
                  {/* Запис без прив'язки до апки: лише ім'я з Discord, без пілота й меха. */}
                  {g.pilotId ? (
                    <>
                      <span className="title-font" style={{ fontSize: 16, letterSpacing: 1, color: 'var(--text-bright)' }}>{g.callsign || '—'}</span>
                      <span style={{ color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>ЛЛ {g.ll} · T{llTier(g.ll)}</span>
                      {g.mech && <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>▮ {g.mech}</span>}
                      <span style={{ color: 'var(--text-faint)' }}>{g.nick || 'невідомо'}</span>
                    </>
                  ) : (
                    <>
                      <span className="title-font" style={{ fontSize: 16, letterSpacing: 1, color: 'var(--text-bright)' }}>{g.nick || 'невідомо'}</span>
                      <span style={{ color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }} title="Записався в Discord без прив'язки до апки">
                        {g.discordOnly ? 'DISCORD · БЕЗ ПІЛОТА' : 'БЕЗ ПІЛОТА'}
                      </span>
                    </>
                  )}
                  {/* Only a GM can read someone else's pilot (RLS), so the link is theirs
                      alone — for anyone else it would land on "пілота не знайдено". */}
                  {isGm && g.pilotId && (
                    <button
                      className="btn-ghost sm"
                      type="button"
                      onClick={() => navigate(`/pilots/${g.pilotId}`)}
                      style={{ height: 22, padding: '0 8px' }}
                      title={`Відкрити профіль ${g.callsign || 'пілота'}`}
                    >
                      ПРОФІЛЬ
                    </button>
                  )}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {g.guaranteed && (
                      <span style={{ color: GOLD, whiteSpace: 'nowrap', letterSpacing: 1 }} title={`Бонус +${g.rollBonus}`}>◆ ГАРАНТОВАНЕ МІСЦЕ</span>
                    )}
                    {!g.guaranteed && g.roll !== null && (
                      <span
                        style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}
                        title={`d20: ${g.roll}${g.rollBonus > 0 ? ` + бонус ${g.rollBonus}` : ''}`}
                      >
                        <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>ПРІОРИТЕТ</span>
                        <span className="title-font" style={{ fontSize: 17, lineHeight: 1, color: g.rollBonus > 0 ? GOLD : 'var(--text-bright)' }}>
                          {g.roll + (g.rollBonus || 0)}
                        </span>
                      </span>
                    )}
                    {g.approved === true && <span style={{ color: 'var(--success)', letterSpacing: 1 }}>✓ УЧАСТЬ</span>}
                    {g.approved === false && g.releasedAt && <span style={{ color: 'var(--text-dim)', letterSpacing: 1 }}>↩ ЗВІЛЬНИВ МІСЦЕ</span>}
                    {g.approved === false && !g.releasedAt && <span style={{ color: 'var(--danger)', letterSpacing: 1 }}>✗ НЕ ЦЬОГО РАЗУ</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {slot.signups.length === 0 && <div className="ss-note" style={{ fontSize: 12 }}>&gt; Ще ніхто не записався.</div>}

        {error && <Msg kind="err">{error}</Msg>}

        {/* Player actions — the GM running this game does not play in it */}
        {ownsSlot && isOpen && (
          <div style={{ fontSize: 11, color: 'var(--text-grey)', letterSpacing: 1 }}>&gt; Ви ведете цю гру — запис власним персонажем недоступний.</div>
        )}
        {isOpen && !mySignup && !ownsSlot && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="ss-select"
              value={pilotId}
              onChange={(e) => {
                setPilotId(e.target.value);
                setMechId('');
              }}
              style={{ flex: '0 1 240px', height: 30, fontSize: 12 }}
            >
              <option value="">— оберіть персонажа —</option>
              {myPilots.map((p) => (
                <option key={p.id} value={p.id}>{p.callsign} ({p.name})</option>
              ))}
            </select>
            {needsMechChoice && (
              <select className="ss-select" value={mechId} onChange={(e) => setMechId(e.target.value)} style={{ flex: '0 1 200px', height: 30, fontSize: 12 }}>
                <option value="">— оберіть меха —</option>
                {mechs.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
            <button
              className="btn"
              type="button"
              disabled={busy || !pilotId || (needsMechChoice && !mechId)}
              onClick={() => {
                const mech = needsMechChoice
                  ? mechs.find((m) => m.id === mechId)
                  : mechs[0]; // single mech needs no asking; none means none
                run(() => api.boardSignup(slot.id, pilotId, mech));
              }}
            >
              ЗАПИСАТИСЬ · d20
            </button>
          </div>
        )}
        {isApproved && mySignup?.approved === true && (
          <button
            className="btn-ghost"
            type="button"
            disabled={busy}
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              confirmThen(
                {
                  title: 'ЗВІЛЬНИТИ МІСЦЕ?',
                  lines: [
                    'місце одразу отримає наступний за пріоритетом із тих, хто не потрапив',
                    'повернутися в склад після цього не вийде',
                  ],
                  yesLabel: 'ЗВІЛЬНИТИ',
                },
                () => api.boardReleaseSeat(slot.id),
              )
            }
          >
            ↩ ЗВІЛЬНИТИ МІСЦЕ
          </button>
        )}
        {isOpen && mySignup && (
          <button className="btn-ghost" type="button" disabled={busy} style={{ alignSelf: 'flex-start' }} onClick={() => run(() => api.boardWithdraw(mySignup.id))}>
            ВИЙТИ ЗІ СЛОТА
          </button>
        )}

        {/* GM actions. The reward stays editable right up to the payout, which is why the
            roster is locked one step before the game is closed. */}
        {ownsSlot && (isOpen || isApproved) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--gm-dim)', paddingTop: 12 }}>
            {editReward && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="СКЛАДНІСТЬ" style={{ flex: '1 1 220px' }}>
                  <DifficultyPicker
                    value={rDiff}
                    onPick={(d) => {
                      if (!d) return setRDiff('');
                      setRDiff(d.key);
                      setRMana(d.mana);
                      setRPr(d.pr);
                    }}
                  />
                </Field>
                <Field label="МАНА">
                  <input className="ss-input" type="number" min={0} autoFocus value={rMana} onChange={(e) => setRMana(e.target.value)} onKeyDown={onRewardKey} style={{ width: 90, height: 30 }} />
                </Field>
                <Field label="PR">
                  <input className="ss-input" type="number" min={0} value={rPr} onChange={(e) => setRPr(e.target.value)} onKeyDown={onRewardKey} style={{ width: 70, height: 30 }} />
                </Field>
                <button className="btn" type="button" disabled={busy} onClick={saveReward}>
                  {busy ? 'ЗБЕРІГАЮ…' : 'ЗБЕРЕГТИ'}
                </button>
                <button className="btn-ghost" type="button" onClick={() => setEditReward(false)}>СКАСУВАТИ</button>
              </div>
            )}
            {isApproved && closing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', border: '1px solid var(--gm-dim)', background: 'var(--panel-sunken)' }}>
                <div className="title-font" style={{ fontSize: 13, letterSpacing: 2, color: GOLD }}>НАГОРОДА ГМА — ОБЕРІТЬ ОДНУ</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {gmRewardOptions(slot, myPilots.length > 0).map((o) => (
                    <button
                      key={o.key}
                      className={gmReward === o.key ? 'btn-gm' : 'btn-ghost'}
                      type="button"
                      disabled={busy || o.disabled}
                      title={o.hint}
                      onClick={() => setGmReward(o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {(gmReward === 'mana' || gmReward === 'pr') && (
                  <select className="ss-select" value={gmPilotId} onChange={(e) => setGmPilotId(e.target.value)} style={{ alignSelf: 'flex-start', height: 30, fontSize: 12 }}>
                    {myPilots.map((p) => (
                      <option key={p.id} value={p.id}>{p.callsign} ({p.name})</option>
                    ))}
                  </select>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-grey)', lineHeight: 1.6 }}>
                  {gmReward === 'mana' && `Обраний персонаж отримає ${slot.rewardMana} М — стільки ж, скільки гравці.`}
                  {gmReward === 'pr' && `Обраний персонаж отримає ${slot.rewardPr} PR — стільки ж, скільки гравці (надлишок понад кап згорить).`}
                  {gmReward === 'priority' && '+3 до бонусу пріоритету на наступний запис на гру.'}
                  {!gmReward && 'Без вибору гру не завершити.'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn-gm"
                    type="button"
                    disabled={busy || editReward || !gmReward || ((gmReward === 'mana' || gmReward === 'pr') && !gmPilotId)}
                    onClick={() =>
                      confirmThen(
                        {
                          title: 'ЗАВЕРШИТИ ГРУ?',
                          tone: 'gm',
                          question: `Видати нагороду ${rewarded} ${pluralPilots(rewarded)}?`,
                          lines: [
                            `кожен отримає ${slot.rewardMana} М`,
                            `${slot.rewardPr} PR — у його пул PR (надлишок понад кап згорить)`,
                            `для вас: ${gmRewardText(slot, gmReward, myPilots.find((p) => p.id === gmPilotId))}`,
                            ...(rewarded < awarded ? [`${awarded - rewarded} без пілота — нагороди не отримають`] : []),
                            'лічильник зіграних ігор оновиться сам — це не нагорода',
                            'діє одразу й не скасовується',
                          ],
                          yesLabel: 'ЗАВЕРШИТИ',
                        },
                        () => api.gmCloseGame(slot.id, { gmReward, gmPilotId }),
                      )
                    }
                  >
                    ЗАВЕРШИТИ
                  </button>
                  <button className="btn-ghost" type="button" disabled={busy} onClick={() => setClosing(false)}>СКАСУВАТИ</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {!editReward && (
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRMana(slot.rewardMana);
                    setRPr(slot.rewardPr);
                    setRDiff(slot.difficulty || '');
                    setSavedNote('');
                    setEditReward(true);
                  }}
                >
                  ЗМІНИТИ НАГОРОДУ
                </button>
              )}
              {isOpen && (
                <button
                  className="btn-gm"
                  type="button"
                  disabled={busy || slot.signups.length === 0}
                  onClick={() =>
                    confirmThen(
                      {
                        title: 'ЗАТВЕРДИТИ СКЛАД?',
                        tone: 'gm',
                        lines: [
                          `у складі: ${rosterSize} з ${slot.signups.length}`,
                          'запис на гру закриється',
                          'хто потрапив у склад, витрачає бонус',
                          'якщо був контест, ті, хто не потрапив, зберігають бонус і отримують ще +3',
                          'нагорода поки НЕ нараховується — це станеться, коли ви завершите гру',
                        ],
                        yesLabel: 'ЗАТВЕРДИТИ',
                      },
                      () => api.gmApproveRoster(slot.id, Array.from(picked)),
                    )
                  }
                >
                  ЗАТВЕРДИТИ СКЛАД · {rosterSize}
                </button>
              )}
              {isApproved && !closing && (
                <button
                  className="btn-gm"
                  type="button"
                  disabled={busy || editReward}
                  title={editReward ? 'Спершу збережіть або скасуйте зміну нагороди' : undefined}
                  onClick={() => {
                    setGmReward('');
                    setGmPilotId(myPilots[0]?.id || '');
                    setClosing(true);
                  }}
                >
                  ЗАВЕРШИТИ ГРУ І ВИДАТИ НАГОРОДУ
                </button>
              )}
              {isApproved && (
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={busy}
                  title="Рядок тегів складу для Discord: вставте в гілку, пост чи чат"
                  onClick={() => run(async () => {
                    const { text, unlinked } = await api.getRosterTags(slot.id);
                    await navigator.clipboard.writeText(text);
                    setTagsNote(
                      'Теги скопійовано — вставте в Discord.' +
                      (unlinked.length ? ` Без прив'язаного Discord: ${unlinked.join(', ')}.` : ''),
                    );
                  })}
                >
                  # КОПІЮВАТИ ТЕГИ
                </button>
              )}
              <button
                className="btn-danger"
                type="button"
                disabled={busy}
                style={{ marginLeft: 'auto' }}
                onClick={() =>
                  confirmThen(
                    {
                      title: 'СКАСУВАТИ СЛОТ?',
                      tone: 'danger',
                      lines: [`«${slot.title || 'Гра без назви'}»`, `записаних: ${slot.signups.length}`, 'запис на гру закриється'],
                      yesLabel: 'СКАСУВАТИ СЛОТ',
                    },
                    () => api.gmCancelSlot(slot.id),
                  )
                }
              >
                СКАСУВАТИ СЛОТ
              </button>
            </div>
            {savedNote && <div style={{ fontSize: 11, color: 'var(--success)' }}>&gt;&gt; {savedNote}</div>}
            {tagsNote && <div style={{ fontSize: 11, color: 'var(--success)' }}>&gt;&gt; {tagsNote}</div>}
          </div>
        )}
        {ownsSlot && !isOpen && !isApproved && (
          <div style={{ display: 'flex', borderTop: '1px solid var(--gm-dim)', paddingTop: 12 }}>
            <button
              className="btn-danger"
              type="button"
              disabled={busy}
              onClick={() =>
                confirmThen(
                  {
                    title: 'ВИДАЛИТИ СЛОТ?',
                    tone: 'danger',
                    lines: [`«${slot.title || 'Гра без назви'}»`, 'слот зникне з дошки назавжди', 'відновлення: неможливе'],
                    yesLabel: 'ВИДАЛИТИ',
                  },
                  () => api.gmDeleteSlot(slot.id),
                )
              }
            >
              ВИДАЛИТИ СЛОТ
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

// Прив'язка Discord: після неї кнопки під оголошеннями в Discord записують у ту саму
// дошку від імені цього акаунта. Код одноразовий, живе 15 хвилин.
function DiscordLink({ user }) {
  const [link, setLink] = useState(undefined); // undefined — ще вантажиться
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Чи може цей акаунт входити через Discord (OAuth). Прив'язка /link кодом цього не дає.
  const [hasLogin, setHasLogin] = useState(false);

  async function load() {
    try {
      setLink(await api.getDiscordLink(user.id));
      setHasLogin(await api.hasDiscordLogin());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (link === undefined && !error) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', fontSize: 12 }}>
      <span style={{ color: 'var(--text-dimmer)', letterSpacing: 1 }}>DISCORD</span>
      {link ? (
        <>
          <span style={{ color: 'var(--success)' }}>прив'язано{link.discord_username ? ` · ${link.discord_username}` : ''}</span>
          <span style={{ color: 'var(--text-dimmer)', fontSize: 11 }}>— у Discord можна записуватись із пілотом і мехом</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!hasLogin && (
              <button className="btn-ghost md" type="button" disabled={busy}
                title="Після цього можна входити в апку кнопкою «Увійти через Discord» — у цей самий акаунт"
                onClick={() => run(api.linkDiscordLogin)}>
                УВІМКНУТИ ВХІД ЧЕРЕЗ DISCORD
              </button>
            )}
            {/* Відв'язка кодом не прибирає Discord-вхід, тож для таких акаунтів її не пропонуємо. */}
            {!hasLogin && (
              <button className="btn-ghost md" type="button" disabled={busy}
                onClick={() => run(async () => { await api.unlinkDiscord(user.id); setLink(null); setCode(''); })}>
                ВІДВ'ЯЗАТИ
              </button>
            )}
            {hasLogin && <span style={{ color: 'var(--text-dimmer)', fontSize: 11 }}>вхід через Discord увімкнено</span>}
          </div>
        </>
      ) : code ? (
        <>
          <span style={{ color: 'var(--text-soft)' }}>код прив'язки</span>
          <code style={{ color: 'var(--accent)', fontSize: 14, letterSpacing: 2, userSelect: 'all' }}>{code}</code>
          <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>/link · 15 хв</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn-ghost md" type="button" disabled={busy} onClick={() => run(load)}>ПЕРЕВІРИТИ</button>
          </div>
        </>
      ) : (
        <>
          <span style={{ color: 'var(--text-dimmer)' }}>не прив'язано — у Discord можна записатись і так, але без пілота й меха</span>
          {/* Через Discord одним кліком: і прив'язка, і вхід. Код /link — запасний шлях. */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn md" type="button" disabled={busy} onClick={() => run(api.linkDiscordLogin)}>
              ПРИВ'ЯЗАТИ ЧЕРЕЗ DISCORD
            </button>
            <button className="btn-ghost md" type="button" disabled={busy} onClick={() => run(async () => setCode(await api.createDiscordLinkCode()))}>
              КОД ДЛЯ /link
            </button>
          </div>
        </>
      )}
      {error && <Msg kind="err" style={{ width: '100%' }}>{error}</Msg>}
    </div>
  );
}

export default function BoardPage() {
  const { user, isGm } = useAuth();

  const [slots, setSlots] = useState([]);
  const [myPilots, setMyPilots] = useState([]);
  const [myBonus, setMyBonus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  async function reload() {
    try {
      const [board, pilots, bonus] = await Promise.all([
        api.boardList(),
        api.listPilots(user.id),
        api.getMyContestBonus(user.id),
      ]);
      setSlots(board);
      setMyPilots(pilots.filter((p) => p.status !== 'archive'));
      setMyBonus(bonus);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // Записи з Discord (і з інших вкладок) мають з'являтися без F5. Події приходять
    // пачками — затвердження складу міняє кожен запис — тож перечитуємо раз на пачку.
    let timer;
    const unsubscribe = api.subscribeBoard(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, 400);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const sorted = useMemo(() => {
    // Live games first, then the ones already played, then the abandoned ones.
    const order = { open: 0, approved: 1, closed: 2, cancelled: 3 };
    const rank = (s) => order[s.status] ?? 9;
    // Слот без дати проведення йде вгору своєї групи: він ще не запланований, а не
    // давно минулий. Без цього new Date(null) = 1970 і він провалювався б у кінець.
    // Всередині «без дати» порядок задає created_at, інакше вони плавають довільно.
    // Віднімання тут не годиться: два слоти без дати дали б Infinity − Infinity = NaN,
    // а NaN у компараторі ламає порядок усього списку. Тому явне порівняння.
    const when = (s) => (s.gameAt ? new Date(s.gameAt).getTime() : null);
    const byDate = (a, b) => {
      const x = when(a);
      const y = when(b);
      if (x === y) return 0;
      if (x === null) return -1;
      if (y === null) return 1;
      return y - x;
    };
    return [...slots].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        byDate(a, b) ||
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    );
  }, [slots]);

  const bonusText =
    myBonus >= 9
      ? 'На наступну гру місце гарантоване — кидати не треба.'
      : myBonus > 0
        ? 'Бонус додається до d20 при записі: +3 за кожен програний контест, +9 — гарантоване місце. Згорає, коли потрапите в склад.'
        : 'При записі кидається d20 — це ваш пріоритет. Бонус до нього накопичується за програні контести.';

  return (
    <PageShell narrow>
      <PageHeader section="MISSION BOARD" title="ЗАПИС НА ГРУ" tag={isGm ? <span className="ss-tag gm">ГМ</span> : null} />

      <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--input-border)', background: 'var(--panel-sunken)' }}>
        <div style={{ flex: 'none', width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRight: '1px solid var(--input-border)', padding: '8px 0' }}>
          <div className="title-font" style={{ fontSize: 24, lineHeight: 1, color: myBonus > 0 ? GOLD : 'var(--text-dimmer)' }}>
            {myBonus >= 9 ? '◆' : `+${myBonus}`}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: 1 }}>БОНУС</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '10px 14px', fontSize: 11, lineHeight: 1.6, color: 'var(--text-grey)', textWrap: 'pretty' }}>
          {myBonus >= 9 ? <span style={{ color: GOLD }}>+{myBonus} · </span> : null}
          {bonusText}
        </div>
      </div>

      {user && <DiscordLink user={user} />}

      {loadError && <Msg kind="err">{loadError}</Msg>}
      {loading && <div className="ss-note">&gt; Завантаження…</div>}

      {isGm && !loading && <CreateSlotForm onCreated={reload} />}

      {!loading && sorted.length === 0 && (
        <div className="ss-slot" style={{ padding: 22, fontSize: 12, color: 'var(--text-dimmer)' }}>&gt; Ігор поки немає.</div>
      )}

      {sorted.map((slot) => (
        <SlotCard key={slot.id} slot={slot} user={user} isGm={isGm} myPilots={myPilots} onChanged={reload} />
      ))}

      <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, textAlign: 'center' }}>
        FERUM VOX // MISSION BOARD
      </div>
    </PageShell>
  );
}
