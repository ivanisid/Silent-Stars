import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Msg, Panel } from './kit.jsx';

// Календар гравців: у які дні хто хоче грати, на два тижні вперед. Гравець клацає по дню —
// ставить або знімає свою відмітку; ГМ бачить, скільки людей і хто, та може одразу створити
// гру на обраний день. Ті самі відмітки ставляться в Discord командою /calendar.

export const CALENDAR_DAYS = 14;
const WEEKDAYS = ['НД', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

const pad = (n) => String(n).padStart(2, '0');
// Локальна дата як YYYY-MM-DD (toISOString дав би UTC і зсунув би день уночі).
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// До міграції 20261011c у базі немає ні таблиці, ні функції календаря — це не помилка
// гравця, тож замість технічного тексту показуємо, що календар ще не ввімкнено.
const NOT_ENABLED = /calendar_list|play_availability|PGRST202|PGRST205|schema cache/i;

function nextDays(n) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function PlayCalendar({ user, isGm, slots, onCreateForDay }) {
  const days = useMemo(() => nextDays(CALENDAR_DAYS), []);
  const from = dayKey(days[0]);
  const to = dayKey(days[days.length - 1]);
  const [byDay, setByDay] = useState({});
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  const fail = (err) => {
    if (NOT_ENABLED.test(err.message)) setDisabled(true);
    else setError(err.message);
  };

  async function load() {
    try {
      const list = await api.calendarList(from, to);
      setByDay(Object.fromEntries(list.map((d) => [d.day, d.players])));
      setError('');
    } catch (err) {
      // До міграції 20261011c функції calendar_list у базі ще немає — не лякаємо помилкою.
      fail(err);
    }
  }

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = api.subscribeCalendar(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // Ігри (не скасовані) за днем проведення — щоб було видно, де набір уже є.
  const gamesByDay = useMemo(() => {
    const out = {};
    for (const s of slots || []) {
      if (!s.gameAt || s.status === 'cancelled') continue;
      const k = dayKey(new Date(s.gameAt));
      (out[k] ||= []).push(s);
    }
    return out;
  }, [slots]);

  const mine = (k) => (byDay[k] || []).some((p) => p.userId === user?.id);

  async function toggle(k) {
    if (!user) return;
    setBusy(true);
    try {
      await api.calendarToggle(user.id, k, !mine(k));
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const max = Math.max(1, ...Object.values(byDay).map((p) => p.length));
  const pickedPlayers = picked ? byDay[picked] || [] : [];
  const pickedGames = picked ? gamesByDay[picked] || [] : [];
  const pickedDate = picked ? days.find((d) => dayKey(d) === picked) : null;

  if (disabled) return null;

  return (
    <Panel title="Календар" sub="ХОЧУ ГРАТИ · 2 ТИЖНІ">
      <div className="ss-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {days.map((d) => {
            const k = dayKey(d);
            const n = (byDay[k] || []).length;
            const me = mine(k);
            const games = gamesByDay[k] || [];
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={k}
                role="button"
                tabIndex={0}
                onClick={() => setPicked(k)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPicked(k))}
                title={`${n ? (byDay[k] || []).map((p) => p.nick).join(', ') : 'Ще ніхто не відмітив'}${me ? ' · ви відмітили' : ''}`}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  minWidth: 0,
                  padding: '6px 6px 5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  // День з грою — золота рамка й смуга згори: видно з першого погляду.
                  border: `1px solid ${picked === k ? 'var(--accent)' : games.length ? 'var(--gm-ink)' : 'var(--input-border)'}`,
                  borderLeft: `3px solid ${me ? 'var(--accent)' : games.length ? 'var(--gm-ink)' : 'transparent'}`,
                  boxShadow: games.length ? 'inset 0 3px 0 var(--gm-ink)' : undefined,
                  // Чим більше охочих, тим насиченіше тло.
                  background: n
                    ? `color-mix(in srgb, var(--accent) ${Math.round(8 + (n / max) * 30)}%, var(--panel-sunken))`
                    : 'var(--panel-sunken)',
                  color: 'var(--text)',
                }}
              >
                <span style={{ fontSize: 9, letterSpacing: 1, color: weekend ? 'var(--warn)' : 'var(--text-dimmer)' }}>
                  {WEEKDAYS[d.getDay()]} {pad(d.getDate())}.{pad(d.getMonth() + 1)}
                </span>
                <span className="title-font" style={{ fontSize: 18, lineHeight: 1, color: n ? 'var(--text-bright)' : 'var(--text-faint)' }}>{n}</span>
                <span style={{ fontSize: 9, letterSpacing: 1, color: games.length ? 'var(--gm-ink)' : 'var(--text-dimmer)', minHeight: 11 }}>
                  {games.length ? `▮ ${games.length} ${games.length === 1 ? 'ГРА' : 'ІГОР'}` : ''}
                </span>
                {/* Своя відмітка — одним кліком, без відкриття дня. */}
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={me}
                  title={me ? 'Зняти відмітку' : 'Хочу грати цього дня'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(k);
                  }}
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 18,
                    height: 18,
                    padding: 0,
                    fontSize: 11,
                    lineHeight: '16px',
                    border: `1px solid ${me ? 'var(--accent)' : 'var(--input-border)'}`,
                    background: me ? 'var(--accent)' : 'var(--input-bg)',
                    color: me ? 'var(--bg)' : 'var(--text-dimmer)',
                    cursor: 'pointer',
                  }}
                >
                  {me ? '−' : '+'}
                </button>
              </div>
            );
          })}
        </div>

        {picked && pickedDate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', border: '1px solid var(--input-border)', background: 'var(--panel-inset)' }}>
            {/* Хто відмітив обраний день — лічильник і так є в клітинці, тут лише імена. */}
            <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6 }}>
              <span style={{ color: 'var(--text-bright)', letterSpacing: 1 }}>
                {WEEKDAYS[pickedDate.getDay()]} {pad(pickedDate.getDate())}.{pad(pickedDate.getMonth() + 1)}:
              </span>{' '}
              {pickedPlayers.length ? pickedPlayers.map((p) => p.nick).join(', ') : 'поки ніхто не відмітив'}
            </div>
            {pickedGames.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
                Ігри цього дня: {pickedGames.map((s) => `«${s.title || 'без назви'}» (${s.signups.length}/${s.seats})`).join(', ')}
              </div>
            )}
            {isGm && (
              <button className="btn-gm" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => onCreateForDay(pickedDate)}>
                + СТВОРИТИ ГРУ НА ЦЕЙ ДЕНЬ
              </button>
            )}
          </div>
        )}
        {error && <Msg kind="err">{error}</Msg>}
      </div>
    </Panel>
  );
}
