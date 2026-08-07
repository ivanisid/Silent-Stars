import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { computeLL, llTier } from '../pilot/logic';
import NavDrawer from '../components/NavDrawer.jsx';
import DateTimeField from '../components/DateTimeField.jsx';

const GOLD = '#e2b13c';
const GOLD_DIM = '#6b5320';

function formatDT(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusBadge(slot) {
  if (slot.status === 'cancelled') return { text: 'СКАСОВАНО', color: 'var(--danger)' };
  if (slot.status === 'closed') return { text: 'СКЛАД ЗАТВЕРДЖЕНО', color: 'var(--success)' };
  // The deadline is a hint for players, not a lock — only the GM closing the slot ends signup.
  if (new Date(slot.signupDeadline) < new Date()) return { text: 'ДЕДЛАЙН МИНУВ · НАБІР ЩЕ ВІДКРИТО', color: 'var(--warn)' };
  return { text: 'НАБІР ВІДКРИТО', color: 'var(--accent)' };
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
          Нагороду можна змінити будь-коли до закриття гри. Під час закриття вона нараховується
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
  const mySignup = slot.signups.find((g) => g.userId === user.id);
  const contest = slot.signups.length > slot.seats;
  const deadlinePassed = new Date(slot.signupDeadline) < new Date();

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
        <div style={{ fontSize: 10, color: badge.color, letterSpacing: 1 }}>{badge.text}</div>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dim)' }}>
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

        {slot.description && (
          <div style={{ fontSize: 12, color: 'var(--text-dimmer)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{slot.description}</div>
        )}

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
                    background: mine ? '#101c2c' : '#0c1420',
                    border: `1px solid ${mine ? 'var(--input-border)' : '#16233450'}`,
                  }}
                >
                  {isGm && isOpen && (
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

        {/* Player actions */}
        {isOpen && !mySignup && (
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

        {/* GM actions */}
        {isGm && isOpen && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${GOLD_DIM}50`, paddingTop: 12 }}>
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
            <button
              className="btn"
              type="button"
              disabled={busy || slot.signups.length === 0}
              onClick={() => {
                const msg =
                  `Затвердити склад (${picked.size} з ${slot.signups.length}) і закрити гру?\n\n` +
                  `Кожен затверджений пілот отримає ${slot.rewardMana} М, ${slot.rewardDc} DC ` +
                  'і +1 зіграну гру. Це діє одразу й не скасовується.';
                if (!window.confirm(msg)) return;
                run(() => api.gmResolveSlot(slot.id, Array.from(picked)));
              }}
              style={{ borderColor: GOLD_DIM, color: GOLD }}
            >
              ЗАТВЕРДИТИ СКЛАД ({picked.size}) І ЗАКРИТИ
            </button>
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
        {isGm && !isOpen && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: `1px solid ${GOLD_DIM}50`, paddingTop: 12 }}>
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
    const rank = (s) => (s.status === 'open' ? 0 : s.status === 'closed' ? 1 : 2);
    return [...slots].sort((a, b) => rank(a) - rank(b) || new Date(b.gameAt) - new Date(a.gameAt));
  }, [slots]);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, #0d1a2c 0%, #070d16 70%)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 860, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <img src="/logo-ferum-vox.webp" alt="" width={28} height={28} style={{ display: 'block' }} />
          <div className="title-font" style={{ fontSize: 26, letterSpacing: 3 }}>
            ДОШКА ЗАВДАНЬ
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
              Завдань поки немає.
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

        <div style={{ marginTop: 14, fontSize: 10, color: '#3d5573', letterSpacing: 1, textAlign: 'center' }}>
          UNION ADMINISTRATIVE // MISSION BOARD
        </div>
      </div>
      <NavDrawer />
    </div>
  );
}
