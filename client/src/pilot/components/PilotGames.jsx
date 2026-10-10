import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

// Ігри, на які записаний цей пілот, — у шапці профілю під рядком ЛЛ. Спершу те, що попереду
// (набір відкритий / склад затверджено), за датою; далі кілька останніх зіграних.
// Оновлюється наживо, як і дошка: запис з Discord з'являється тут без перезавантаження.

const PLAYED_SHOWN = 3;

function formatDate(iso) {
  if (!iso) return 'дата не призначена';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Що ця гра означає для пілота: текст і колір.
function statusOf(g) {
  const slot = g.game_slots;
  if (slot.status === 'cancelled') return { text: 'СКАСОВАНО', color: 'var(--text-dimmer)' };
  if (slot.status === 'closed') return { text: 'ЗІГРАНО', color: 'var(--text-dim)' };
  if (slot.status === 'approved') {
    if (g.approved) return { text: '✓ У СКЛАДІ', color: 'var(--success)' };
    if (g.released_at) return { text: '↩ ЗВІЛЬНИВ МІСЦЕ', color: 'var(--text-dimmer)' };
    return { text: '✗ НЕ ЦЬОГО РАЗУ', color: 'var(--danger)' };
  }
  if (g.guaranteed) return { text: '◆ ГАРАНТОВАНЕ МІСЦЕ', color: 'var(--accent)' };
  const priority = g.roll == null ? null : g.roll + (g.roll_bonus || 0);
  return { text: priority == null ? 'ЗАПИСАНО' : `ЗАПИСАНО · ПРІОРИТЕТ ${priority}`, color: 'var(--accent)' };
}

const ts = (g) => (g.game_slots.game_at ? new Date(g.game_slots.game_at).getTime() : null);

// Ігри пілота з живим оновленням — потрібні і шапці профілю, і записнику (прив'язка
// нотатки до гри), тож завантажуються один раз на сторінці.
export function usePilotGames(pilotId) {
  const [games, setGames] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = () => api.listPilotGames(pilotId).then((g) => !cancelled && setGames(g)).catch(() => !cancelled && setGames([]));
    load();
    const unsubscribe = api.subscribeBoard(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    }, `pilot-games-${pilotId}`);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [pilotId]);
  return games;
}

export function gameShortLabel(g) {
  const at = g.game_slots.game_at ? new Date(g.game_slots.game_at) : null;
  const pad = (n) => String(n).padStart(2, '0');
  const date = at && !Number.isNaN(at.getTime()) ? ` · ${pad(at.getDate())}.${pad(at.getMonth() + 1)}` : '';
  return `${g.game_slots.title || 'Гра без назви'}${date}`;
}

export default function PilotGames({ games }) {
  if (games === null) return null;

  // Попереду: набір чи затверджений склад; без дати — нагорі (ще не заплановані), далі за датою.
  const ahead = games
    .filter((g) => g.game_slots.status === 'open' || g.game_slots.status === 'approved')
    .sort((a, b) => {
      const x = ts(a);
      const y = ts(b);
      if (x === y) return 0;
      if (x === null) return -1;
      if (y === null) return 1;
      return x - y;
    });
  // Зіграні — лише ті, де пілот був у складі; найсвіжіші першими.
  const played = games
    .filter((g) => g.game_slots.status === 'closed' && g.approved)
    .sort((a, b) => (ts(b) ?? 0) - (ts(a) ?? 0))
    .slice(0, PLAYED_SHOWN);
  const rows = [...ahead, ...played];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div className="ss-label">ІГРИ ПІЛОТА</div>
        <Link to="/board" style={{ fontSize: 11, marginLeft: 'auto' }}>запис на гру →</Link>
      </div>

      {rows.length === 0 ? (
        <div className="ss-note"><span className="pre">&gt; </span>Пілот ще не записаний на жодну гру.</div>
      ) : (
        <div className="ss-list">
          {rows.map((g, i) => {
            const st = statusOf(g);
            const past = g.game_slots.status === 'closed';
            return (
              <div
                key={g.id}
                className="m-game"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px minmax(0,1fr) auto',
                  gap: 14,
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: past ? 'transparent' : 'var(--panel-sunken)',
                  borderTop: i ? '1px solid var(--input-border)' : 'none',
                  opacity: past ? 0.7 : 1,
                }}
              >
                <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{formatDate(g.game_slots.game_at)}</span>
                <span style={{ color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.game_slots.title || 'Гра без назви'}
                </span>
                <span style={{ color: st.color, fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' }}>{st.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
