import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { llTier } from '../pilot/logic';
import NavDrawer from '../components/NavDrawer.jsx';
import { DIFFICULTY_GROUPS, difficultyByKey, difficultyLabel } from '../difficulty';
import DateTimeField from '../components/DateTimeField.jsx';

// Gold as *text on a card*, so it stays legible on the light themes; --gm itself is
// the bright gold meant for the GM's own dark surfaces.
const GOLD = 'var(--gm-ink)';
const GOLD_DIM = 'var(--gm-dim)';

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
      style={{ width: '100%', padding: '9px 10px', fontSize: 13 }}
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
    <div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-soft-dim)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          ...(long && !open
            ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
            : null),
        }}
      >
        {linkify(text)}
      </div>
      {long && (
        <button
          className="btn-ghost"
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ fontSize: 11, padding: '3px 10px', marginTop: 6 }}
        >
          {open ? 'ЗГОРНУТИ ОПИС' : 'РОЗГОРНУТИ ОПИС'}
        </button>
      )}
    </div>
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
      <button className="btn" type="button" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
        + СТВОРИТИ СЛОТ ГРИ
      </button>
    );
  }

  return (
    <div className="card" style={{ borderColor: GOLD_DIM }}>
      <div className="card-header">
        <div className="title" style={{ color: GOLD }}>НОВИЙ СЛОТ ГРИ</div>
      </div>
      <form onSubmit={submit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div className="field-label">НАЗВА (ОПЦІОНАЛЬНО)</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Назва місії" style={{ width: '100%', padding: '9px 12px', fontSize: 14 }} />
        </div>
        <div>
          <div className="field-label">ОПИС (ОПЦІОНАЛЬНО)</div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Короткий опис гри…" style={{ width: '100%', padding: '9px 12px', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
        </div>
        <div>
          <div className="field-label">СКЛАДНІСТЬ (ОПЦІОНАЛЬНО) — ЗАПОВНЮЄ НАГОРОДУ</div>
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
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <DateTimeField label="ДАТА ПРОВЕДЕННЯ (ОПЦІОНАЛЬНО)" value={gameAt} onChange={setGameAt} />
          <DateTimeField label="КІНЕЦЬ НАБОРУ (ОПЦІОНАЛЬНО)" value={deadline} onChange={setDeadline} />
          <div>
            <div className="field-label">МІСЦЬ</div>
            <input type="number" min={1} max={20} value={seats} onChange={(e) => setSeats(e.target.value)} style={{ width: 70, padding: '8px 10px', fontSize: 13 }} />
          </div>
          <div>
            <div className="field-label">НАГОРОДА · МАНА</div>
            <input type="number" min={0} value={rewardMana} onChange={(e) => setRewardMana(e.target.value)} style={{ width: 90, padding: '8px 10px', fontSize: 13 }} />
          </div>
          <div>
            <div className="field-label">НАГОРОДА · PR</div>
            <input type="number" min={0} value={rewardPr} onChange={(e) => setRewardPr(e.target.value)} style={{ width: 70, padding: '8px 10px', fontSize: 13 }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
          Нагороду можна змінити будь-коли до завершення гри. Під час завершення вона нараховується
          затвердженим пілотам автоматично, разом із однією зіграною грою.
        </div>
        {error && <div className="error-box">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="submit" disabled={busy}>СТВОРИТИ</button>
          <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>СКАСУВАТИ</button>
        </div>
      </form>
    </div>
  );
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
  // Збереження нагороди мовчазне: без підтвердження ГМ не відрізняє «зберіг»
  // від «передумав і закрив редактор».
  const [savedNote, setSavedNote] = useState('');
  // Підтвердження «теги скопійовано» — без нього кнопка нічим не показує, що спрацювала.
  const [tagsNote, setTagsNote] = useState('');

  const badge = statusBadge(slot);
  const isOpen = slot.status === 'open';
  // Roster locked, game still ahead — signup is shut but nothing has been awarded.
  const isApproved = slot.status === 'approved';
  // Played and settled: 'closed' is set by the call that pays the reward out.
  const isDone = slot.status === 'closed';
  const awarded = slot.signups.filter((g) => g.approved === true).length;
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

  return (
    <div className="card" style={slot.status === 'cancelled' ? { opacity: 0.55 } : undefined}>
      <div className="card-header">
        <div className="title">{slot.title || 'ГРА БЕЗ НАЗВИ'}</div>
        <div style={{ fontSize: 10, color: 'var(--header-text)', opacity: badge.strong ? 1 : 0.72, letterSpacing: 1 }}>
          {badge.text}
        </div>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isDone && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              flexWrap: 'wrap',
              padding: '9px 12px',
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
            }}
          >
            <span className="title-font" style={{ fontSize: 13, letterSpacing: 2, color: 'var(--success)' }}>
              ✓ ГРА ЗАВЕРШЕНА
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-soft-dim)', lineHeight: 1.6 }}>
              {awarded > 0
                ? `Нагороди нараховано · ${awarded} ${pluralPilots(awarded)} · ${slot.rewardMana} М кожному` +
                  `${slot.rewardPr > 0 ? ` · ${slot.rewardPr} PR` : ''}`
                : 'Нікого не затверджено — нагород не нараховано'}
            </span>
          </div>
        )}

        {isApproved && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              flexWrap: 'wrap',
              padding: '9px 12px',
              background: 'var(--panel-inset)',
              border: '1px solid var(--input-border)',
            }}
          >
            <span className="title-font" style={{ fontSize: 13, letterSpacing: 2, color: 'var(--text-bright)' }}>
              СКЛАД ЗАТВЕРДЖЕНО
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-soft-dim)', lineHeight: 1.6 }}>
              {awarded > 0
                ? `Грає ${awarded} ${pluralPilots(awarded)} · запис закрито · нагороду буде нараховано, коли ГМ завершить гру`
                : 'Нікого не затверджено · запис закрито'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dim)' }}>
          <span>
            ВЕДЕ:{' '}
            <span style={{ color: ownsSlot ? GOLD : 'var(--text-bright)' }}>
              {slot.createdByNick || '—'}{ownsSlot ? ' (ви)' : ''}
            </span>
          </span>
          <span>ГРА: <span style={{ color: 'var(--text-bright)' }}>{formatDT(slot.gameAt)}</span></span>
          <span>НАБІР ДО: <span style={{ color: deadlinePassed && isOpen ? 'var(--warn)' : 'var(--text-bright)' }}>{formatDT(slot.signupDeadline)}</span></span>
          <span>МІСЦЬ: <span style={{ color: 'var(--text-bright)' }}>{slot.seats}</span></span>
          <span>ЗАПИСАЛОСЬ: <span style={{ color: contest ? 'var(--warn)' : 'var(--text-bright)' }}>{slot.signups.length}</span></span>
          {difficultyLabel(slot.difficulty) && (
            <span>
              СКЛАДНІСТЬ:{' '}
              <span style={{ color: 'var(--text-bright)' }}>{difficultyLabel(slot.difficulty)}</span>
            </span>
          )}
          <span>
            НАГОРОДА:{' '}
            <span style={{ color: slot.rewardMana || slot.rewardPr ? GOLD : 'var(--text-dimmer)' }}>
              {slot.rewardMana} М · {slot.rewardPr} PR
            </span>
          </span>
        </div>

        {slot.description && <Description text={slot.description} />}

        {contest && isOpen && (
          <div style={{ fontSize: 11, color: 'var(--warn)', letterSpacing: 1 }}>
            УЧАСНИКІВ БІЛЬШЕ, НІЖ МІСЦЬ — СКЛАД ВИЗНАЧАЄ ПРІОРИТЕТ
          </div>
        )}

        {slot.signups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ranked.map((g) => {
              const mine = g.userId === user.id;
              return (
                <div
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    fontSize: 12,
                    padding: '7px 10px',
                    background: mine ? 'var(--panel-inset)' : 'var(--panel-sunken)',
                    border: `1px solid ${mine ? 'var(--input-border)' : 'var(--rule)'}`,
                  }}
                >
                  {ownsSlot && isOpen && (
                    <input
                      type="checkbox"
                      checked={g.guaranteed || picked.has(g.id)}
                      disabled={g.guaranteed}
                      title={g.guaranteed ? 'Гарантоване місце — входить у склад автоматично' : undefined}
                      onChange={() => togglePick(g.id)}
                      style={{ accentColor: GOLD }}
                    />
                  )}
                  <span className="title-font" style={{ fontSize: 14, letterSpacing: 1 }}>{g.callsign || '—'}</span>
                  <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    ЛЛ {g.ll} · Т{llTier(g.ll)}
                  </span>
                  {g.mech && (
                    <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>▮ {g.mech}</span>
                  )}
                  <span style={{ color: 'var(--text-dimmer)' }}>{g.nick || 'невідомо'}</span>
                  {/* Only a GM can read someone else's pilot (RLS), so the link is theirs
                      alone — for anyone else it would land on "пілота не знайдено". */}
                  {isGm && g.pilotId && (
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => navigate(`/pilots/${g.pilotId}`)}
                      style={{ fontSize: 10, padding: '3px 8px', letterSpacing: 1 }}
                      title={`Відкрити профіль ${g.callsign || 'пілота'}`}
                    >
                      ПРОФІЛЬ
                    </button>
                  )}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
                    {g.guaranteed && (
                      <span style={{ color: GOLD, whiteSpace: 'nowrap', letterSpacing: 1 }} title={`Бонус +${g.rollBonus}`}>
                        🛡 ГАРАНТОВАНЕ МІСЦЕ
                      </span>
                    )}
                    {!g.guaranteed && g.roll !== null && (
                      <span
                        style={{ color: 'var(--text-bright)', whiteSpace: 'nowrap' }}
                        title={`d20: ${g.roll}${g.rollBonus > 0 ? ` + бонус ${g.rollBonus}` : ''}`}
                      >
                        ПРІОРИТЕТ <span style={{ fontSize: 14, color: g.rollBonus > 0 ? GOLD : undefined }}>{g.roll + (g.rollBonus || 0)}</span>
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
        {slot.signups.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Ще ніхто не записався.</div>
        )}

        {error && <div className="error-box">{error}</div>}

        {/* Player actions — the GM running this game does not play in it */}
        {ownsSlot && isOpen && (
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', letterSpacing: 1 }}>
            ВИ ВЕДЕТЕ ЦЮ ГРУ — ЗАПИС ВЛАСНИМ ПЕРСОНАЖЕМ НЕДОСТУПНИЙ
          </div>
        )}
        {isOpen && !mySignup && !ownsSlot && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={pilotId}
              onChange={(e) => {
                setPilotId(e.target.value);
                setMechId('');
              }}
              style={{ padding: '8px 10px', fontSize: 13 }}
            >
              <option value="">— оберіть персонажа —</option>
              {myPilots.map((p) => (
                <option key={p.id} value={p.id}>{p.callsign} ({p.name})</option>
              ))}
            </select>
            {needsMechChoice && (
              <select value={mechId} onChange={(e) => setMechId(e.target.value)} style={{ padding: '8px 10px', fontSize: 13 }}>
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
              ЗАПИСАТИСЬ
            </button>
          </div>
        )}
        {isApproved && mySignup?.approved === true && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                const msg =
                  'Звільнити своє місце в складі?\n\n' +
                  'Його одразу отримає наступний за пріоритетом із тих, хто не потрапив. ' +
                  'Повернутися в склад після цього не вийде.';
                if (!window.confirm(msg)) return;
                run(() => api.boardReleaseSeat(slot.id));
              }}
            >
              ↩ ЗВІЛЬНИТИ МІСЦЕ
            </button>
          </div>
        )}
        {isOpen && mySignup && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-ghost" type="button" disabled={busy} onClick={() => run(() => api.boardWithdraw(mySignup.id))}>
              ВИЙТИ ЗІ СЛОТА
            </button>
          </div>
        )}

        {/* GM actions. The reward stays editable right up to the payout, which is why the
            roster is locked one step before the game is closed. */}
        {ownsSlot && (isOpen || isApproved) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid var(--gm-rule)`, paddingTop: 12 }}>
            {editReward ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', width: '100%' }}>
                <div style={{ width: '100%' }}>
                  <div className="field-label">СКЛАДНІСТЬ</div>
                  <DifficultyPicker
                    value={rDiff}
                    onPick={(d) => {
                      if (!d) return setRDiff('');
                      setRDiff(d.key);
                      setRMana(d.mana);
                      setRPr(d.pr);
                    }}
                  />
                </div>
                <div>
                  <div className="field-label">МАНА</div>
                  <input type="number" min={0} autoFocus value={rMana} onChange={(e) => setRMana(e.target.value)} onKeyDown={onRewardKey} style={{ width: 90, padding: '7px 10px', fontSize: 13 }} />
                </div>
                <div>
                  <div className="field-label">PR</div>
                  <input type="number" min={0} value={rPr} onChange={(e) => setRPr(e.target.value)} onKeyDown={onRewardKey} style={{ width: 70, padding: '7px 10px', fontSize: 13 }} />
                </div>
                <button className="btn" type="button" disabled={busy} onClick={saveReward}>
                  {busy ? 'ЗБЕРІГАЮ…' : 'ЗБЕРЕГТИ НАГОРОДУ'}
                </button>
                <button className="btn-ghost" type="button" onClick={() => setEditReward(false)}>
                  СКАСУВАТИ
                </button>
              </div>
            ) : (
              <>
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
                {savedNote && (
                  <span style={{ fontSize: 11, color: GOLD }}>✓ {savedNote}</span>
                )}
              </>
            )}
            {isOpen && (
              <button
                className="btn"
                type="button"
                disabled={busy || slot.signups.length === 0}
                onClick={() => {
                  const msg =
                    `Затвердити склад: ${rosterSize} з ${slot.signups.length}?\n\n` +
                    'Запис на гру закриється. Хто потрапив у склад, витрачає бонус; якщо був контест, ' +
                    'ті, хто не потрапив, зберігають бонус і отримують ще +3. ' +
                    'Нагорода поки НЕ нараховується — це станеться, коли ви завершите гру.';
                  if (!window.confirm(msg)) return;
                  run(() => api.gmApproveRoster(slot.id, Array.from(picked)));
                }}
                style={{ borderColor: GOLD_DIM, color: GOLD }}
              >
                ЗАТВЕРДИТИ СКЛАД ({rosterSize})
              </button>
            )}
            {isApproved && (
              <button
                className="btn"
                type="button"
                disabled={busy || editReward}
                title={editReward ? 'Спершу збережіть або скасуйте зміну нагороди' : undefined}
                onClick={() => {
                  const msg =
                    `Завершити гру і видати нагороду ${awarded} ${pluralPilots(awarded)}?\n\n` +
                    `Кожен отримає ${slot.rewardMana} М, ` +
                    `а ${slot.rewardPr} PR — у його пул PR (надлишок понад кап згорить). ` +
                    'Лічильник зіграних ігор оновиться сам — це не нагорода. ' +
                    'Це діє одразу й не скасовується.';
                  if (!window.confirm(msg)) return;
                  run(() => api.gmCloseGame(slot.id));
                }}
                style={{ borderColor: GOLD_DIM, color: GOLD }}
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
                🏷 КОПІЮВАТИ ТЕГИ
              </button>
            )}
            {tagsNote && <span style={{ fontSize: 11, color: 'var(--success)', width: '100%' }}>{tagsNote}</span>}
            <button
              className="btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Скасувати цей слот гри?')) return;
                run(() => api.gmCancelSlot(slot.id));
              }}
            >
              СКАСУВАТИ СЛОТ
            </button>
          </div>
        )}
        {ownsSlot && !isOpen && !isApproved && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: `1px solid var(--gm-rule)`, paddingTop: 12 }}>
            <button
              className="btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Видалити цей слот назавжди?')) return;
                run(() => api.gmDeleteSlot(slot.id));
              }}
            >
              ВИДАЛИТИ СЛОТ
            </button>
          </div>
        )}
      </div>
    </div>
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
    <div style={{ border: '1px solid var(--input-border)', background: 'var(--panel-inset)', padding: '10px 14px', marginBottom: 18, fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <span style={{ letterSpacing: 1, color: 'var(--text-dim)' }}>DISCORD:</span>
      {link ? (
        <>
          <span style={{ color: 'var(--text-bright)' }}>прив'язано{link.discord_username ? ` · ${link.discord_username}` : ''}</span>
          <span style={{ color: 'var(--text-dimmer)' }}>— записуйтесь кнопками під оголошеннями в Discord</span>
          {!hasLogin && (
            <button className="btn-ghost" type="button" disabled={busy} style={{ marginLeft: 'auto' }}
              title="Після цього можна входити в апку кнопкою «Увійти через Discord» — у цей самий акаунт"
              onClick={() => run(api.linkDiscordLogin)}>
              УВІМКНУТИ ВХІД ЧЕРЕЗ DISCORD
            </button>
          )}
          {/* Відв'язка кодом не прибирає Discord-вхід, тож для таких акаунтів її не пропонуємо. */}
          {!hasLogin && (
            <button className="btn-ghost" type="button" disabled={busy}
              onClick={() => run(async () => { await api.unlinkDiscord(user.id); setLink(null); setCode(''); })}>
              ВІДВ'ЯЗАТИ
            </button>
          )}
          {hasLogin && <span style={{ color: 'var(--text-dimmer)', marginLeft: 'auto' }}>вхід через Discord увімкнено</span>}
        </>
      ) : code ? (
        <>
          <span>Код прив'язки:</span>
          <code style={{ color: 'var(--accent)', fontSize: 14, userSelect: 'all' }}>{code}</code>
          <span style={{ color: 'var(--text-dimmer)' }}>(введіть у Discord командою /link, діє 15 хв)</span>
          <button className="btn-ghost" type="button" disabled={busy} style={{ marginLeft: 'auto' }}
            onClick={() => run(load)}>
            ПЕРЕВІРИТИ
          </button>
        </>
      ) : (
        <>
          <span style={{ color: 'var(--text-dimmer)' }}>не прив'язано — прив'яжіть, щоб записуватись на ігри прямо з Discord</span>
          {/* Через Discord одним кліком: і прив'язка, і вхід. Код /link — запасний шлях. */}
          <button className="btn" type="button" disabled={busy} style={{ marginLeft: 'auto' }}
            onClick={() => run(api.linkDiscordLogin)}>
            ПРИВ'ЯЗАТИ ЧЕРЕЗ DISCORD
          </button>
          <button className="btn-ghost" type="button" disabled={busy}
            onClick={() => run(async () => setCode(await api.createDiscordLinkCode()))}>
            КОД ДЛЯ /link
          </button>
        </>
      )}
      {error && <div className="error-box" style={{ width: '100%' }}>{error}</div>}
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

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, var(--page-grad) 0%, var(--bg) 70%)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 860, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <img src="/logo-ferum-vox.webp" alt="" width={28} height={28} style={{ display: 'block' }} />
          <div className="title-font" style={{ fontSize: 26, letterSpacing: 3 }}>
            ЗАПИС НА ГРУ
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>{user?.nick}</div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-dimmer)', letterSpacing: 1, marginBottom: 24 }}>
          {myBonus >= 9
            ? <>ВАШ БОНУС: <span style={{ color: GOLD }}>+{myBonus}</span> — 🛡 НА НАСТУПНУ ГРУ МІСЦЕ ГАРАНТОВАНЕ, КИДАТИ НЕ ТРЕБА</>
            : myBonus > 0
            ? <>ВАШ БОНУС ДО ПРІОРИТЕТУ: <span style={{ color: GOLD }}>+{myBonus}</span> (додається до d20 при записі; +3 за кожен програний контест, +9 — гарантоване місце; згорає, коли потрапите в склад)</>
            : 'ПРИ ЗАПИСІ КИДАЄТЬСЯ D20 — ЦЕ ВАШ ПРІОРИТЕТ. БОНУС ДО НЬОГО НАКОПИЧУЄТЬСЯ ЗА ПРОГРАНІ КОНТЕСТИ'}
        </div>

        {user && <DiscordLink user={user} />}

        {loadError && <div className="error-box" style={{ marginBottom: 16 }}>{loadError}</div>}
        {loading && <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Завантаження…</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {isGm && !loading && <CreateSlotForm onCreated={reload} />}

          {!loading && sorted.length === 0 && (
            <div style={{ border: '1px dashed var(--input-border)', padding: 22, textAlign: 'center', fontSize: 12, color: 'var(--text-dimmer)' }}>
              Ігор поки немає.
            </div>
          )}

          {sorted.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              user={user}
              isGm={isGm}
              myPilots={myPilots}
              onChanged={reload}
            />
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, textAlign: 'center' }}>
          UNION ADMINISTRATIVE // MISSION BOARD
        </div>
      </div>
      <NavDrawer />
    </div>
  );
}
