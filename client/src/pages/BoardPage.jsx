import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { computeLL, llTier } from '../pilot/logic';
import NavDrawer from '../components/NavDrawer.jsx';
import DateTimeField from '../components/DateTimeField.jsx';

// Gold as *text on a card*, so it stays legible on the light themes; --gm itself is
// the bright gold meant for the GM's own dark surfaces.
const GOLD = 'var(--gm-ink)';
const GOLD_DIM = 'var(--gm-dim)';

function formatDT(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  if (new Date(slot.signupDeadline) < new Date()) return { text: 'ДЕДЛАЙН МИНУВ · НАБІР ЩЕ ВІДКРИТО', strong: true };
  return { text: 'НАБІР ВІДКРИТО', strong: false };
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
  const [rewardDc, setRewardDc] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!gameAt) return setError('Вкажіть дату проведення гри.');
    if (!deadline) return setError('Вкажіть дату закінчення набору.');
    const seatsNum = Number(seats);
    if (!Number.isInteger(seatsNum) || seatsNum < 1) return setError('Кількість місць — ціле число від 1.');
    const manaNum = Number(rewardMana);
    const dcNum = Number(rewardDc);
    if (!Number.isInteger(manaNum) || manaNum < 0) return setError('Нагорода в мані — ціле число від 0.');
    if (!Number.isInteger(dcNum) || dcNum < 0) return setError('Нагорода в DC — ціле число від 0.');
    setBusy(true);
    setError('');
    try {
      await api.gmCreateSlot({
        title,
        description,
        gameAt: gameAt.toISOString(),
        signupDeadline: deadline.toISOString(),
        seats: seatsNum,
        rewardMana: manaNum,
        rewardDc: dcNum,
      });
      setTitle('');
      setDescription('');
      setGameAt(null);
      setDeadline(null);
      setSeats(4);
      setRewardMana(0);
      setRewardDc(0);
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
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <DateTimeField label="ДАТА ПРОВЕДЕННЯ" value={gameAt} onChange={setGameAt} />
          <DateTimeField label="КІНЕЦЬ НАБОРУ" value={deadline} onChange={setDeadline} />
          <div>
            <div className="field-label">МІСЦЬ</div>
            <input type="number" min={1} max={20} value={seats} onChange={(e) => setSeats(e.target.value)} style={{ width: 70, padding: '8px 10px', fontSize: 13 }} />
          </div>
          <div>
            <div className="field-label">НАГОРОДА · МАНА</div>
            <input type="number" min={0} value={rewardMana} onChange={(e) => setRewardMana(e.target.value)} style={{ width: 90, padding: '8px 10px', fontSize: 13 }} />
          </div>
          <div>
            <div className="field-label">НАГОРОДА · DC</div>
            <input type="number" min={0} value={rewardDc} onChange={(e) => setRewardDc(e.target.value)} style={{ width: 70, padding: '8px 10px', fontSize: 13 }} />
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

function SlotCard({ slot, user, isGm, myPilots, myBonus, onChanged }) {
  const navigate = useNavigate();
  const [pilotId, setPilotId] = useState('');
  const [mechId, setMechId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // GM roster picks (signup ids) before resolving.
  const [picked, setPicked] = useState(() => new Set());
  const [editReward, setEditReward] = useState(false);
  const [rMana, setRMana] = useState(0);
  const [rDc, setRDc] = useState(0);

  const badge = statusBadge(slot);
  const isOpen = slot.status === 'open';
  // Roster locked, game still ahead — signup is shut but nothing has been awarded.
  const isApproved = slot.status === 'approved';
  // Played and settled: 'closed' is set by the call that pays the reward out.
  const isDone = slot.status === 'closed';
  const awarded = slot.signups.filter((g) => g.approved === true).length;
  const mySignup = slot.signups.find((g) => g.userId === user.id);
  const contest = slot.signups.length > slot.seats;
  const deadlinePassed = new Date(slot.signupDeadline) < new Date();
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
                  `${slot.rewardDc > 0 ? ` · ${slot.rewardDc} DC на меха` : ''} · +1 зіграна гра`
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
          <span>
            НАГОРОДА:{' '}
            <span style={{ color: slot.rewardMana || slot.rewardDc ? GOLD : 'var(--text-dimmer)' }}>
              {slot.rewardMana} М · {slot.rewardDc} DC
            </span>
          </span>
        </div>

        {slot.description && <Description text={slot.description} />}

        {contest && isOpen && (
          <div style={{ fontSize: 11, color: 'var(--warn)', letterSpacing: 1 }}>
            УЧАСНИКІВ БІЛЬШЕ, НІЖ МІСЦЬ — КОНТЕСТ D20
          </div>
        )}

        {slot.signups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slot.signups.map((g) => {
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
                      checked={picked.has(g.id)}
                      onChange={() => togglePick(g.id)}
                      style={{ accentColor: GOLD }}
                    />
                  )}
                  <span className="title-font" style={{ fontSize: 14, letterSpacing: 1 }}>{g.callsign || '—'}</span>
                  <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    ЛЛ {computeLL(g.games)} · Т{llTier(computeLL(g.games))}
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
                    {g.roll !== null ? (
                      <span style={{ color: 'var(--text-bright)', whiteSpace: 'nowrap' }}>
                        🎲 {g.roll}
                        {g.rollBonus > 0 && <span style={{ color: GOLD }}> + {g.rollBonus}</span>}
                        {' = '}
                        <span style={{ fontSize: 14 }}>{g.roll + (g.rollBonus || 0)}</span>
                      </span>
                    ) : (
                      contest && <span style={{ color: 'var(--text-dimmer)' }}>без кидка</span>
                    )}
                    {g.approved === true && <span style={{ color: 'var(--success)', letterSpacing: 1 }}>✓ УЧАСТЬ</span>}
                    {g.approved === false && <span style={{ color: 'var(--danger)', letterSpacing: 1 }}>✗ НЕ ЦЬОГО РАЗУ</span>}
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
        {isOpen && mySignup && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {contest && mySignup.roll === null && (
              <button className="btn" type="button" disabled={busy} onClick={() => run(() => api.boardRoll(mySignup.id))}>
                🎲 КИНУТИ D20{myBonus > 0 ? ` (+${myBonus})` : ''}
              </button>
            )}
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
                <div>
                  <div className="field-label">МАНА</div>
                  <input type="number" min={0} value={rMana} onChange={(e) => setRMana(e.target.value)} style={{ width: 90, padding: '7px 10px', fontSize: 13 }} />
                </div>
                <div>
                  <div className="field-label">DC</div>
                  <input type="number" min={0} value={rDc} onChange={(e) => setRDc(e.target.value)} style={{ width: 70, padding: '7px 10px', fontSize: 13 }} />
                </div>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const m = Number(rMana);
                    const d = Number(rDc);
                    if (!Number.isInteger(m) || m < 0 || !Number.isInteger(d) || d < 0) {
                      return setError('Нагорода — цілі числа від 0.');
                    }
                    setEditReward(false);
                    run(() => api.gmUpdateSlotReward(slot.id, { rewardMana: m, rewardDc: d }));
                  }}
                >
                  ЗБЕРЕГТИ НАГОРОДУ
                </button>
                <button className="btn-ghost" type="button" onClick={() => setEditReward(false)}>
                  СКАСУВАТИ
                </button>
              </div>
            ) : (
              <button
                className="btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setRMana(slot.rewardMana);
                  setRDc(slot.rewardDc);
                  setEditReward(true);
                }}
              >
                ЗМІНИТИ НАГОРОДУ
              </button>
            )}
            {isOpen && (
              <button
                className="btn"
                type="button"
                disabled={busy || slot.signups.length === 0}
                onClick={() => {
                  const msg =
                    `Затвердити склад: ${picked.size} з ${slot.signups.length}?\n\n` +
                    'Запис на гру закриється, а ті, хто не потрапив, отримають +3 до кидка участі. ' +
                    'Нагорода поки НЕ нараховується — це станеться, коли ви завершите гру.';
                  if (!window.confirm(msg)) return;
                  run(() => api.gmApproveRoster(slot.id, Array.from(picked)));
                }}
                style={{ borderColor: GOLD_DIM, color: GOLD }}
              >
                ЗАТВЕРДИТИ СКЛАД ({picked.size})
              </button>
            )}
            {isApproved && (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => {
                  const msg =
                    `Завершити гру і видати нагороду ${awarded} ${pluralPilots(awarded)}?\n\n` +
                    `Кожен отримає ${slot.rewardMana} М і +1 зіграну гру, ` +
                    `а ${slot.rewardDc} DC ляжуть на меха, з яким він записався. ` +
                    'Це діє одразу й не скасовується.';
                  if (!window.confirm(msg)) return;
                  run(() => api.gmCloseGame(slot.id));
                }}
                style={{ borderColor: GOLD_DIM, color: GOLD }}
              >
                ЗАВЕРШИТИ ГРУ І ВИДАТИ НАГОРОДУ
              </button>
            )}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const sorted = useMemo(() => {
    // Live games first, then the ones already played, then the abandoned ones.
    const order = { open: 0, approved: 1, closed: 2, cancelled: 3 };
    const rank = (s) => order[s.status] ?? 9;
    return [...slots].sort((a, b) => rank(a) - rank(b) || new Date(b.gameAt) - new Date(a.gameAt));
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
          {myBonus > 0
            ? <>ВАШ БОНУС ДО КИДКА УЧАСТІ: <span style={{ color: GOLD }}>+{myBonus}</span> (накопичується, поки не виграєте контест)</>
            : 'БОНУСУ ДО КИДКА НЕМАЄ — ВІН НАКОПИЧУЄТЬСЯ ЗА ПРОГРАНІ КОНТЕСТИ'}
        </div>

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
              myBonus={myBonus}
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
