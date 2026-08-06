import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { computeLL, llTier } from '../pilot/logic';
import NavDrawer from '../components/NavDrawer.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Stat({ label, value, color }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
      {label} <span style={{ color: color || 'var(--text-bright)' }}>{value}</span>
    </div>
  );
}

export default function GmPanelPage() {
  const { user, role, isGm, logout } = useAuth();
  const navigate = useNavigate();

  const [pilots, setPilots] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isGm) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.gmListAllPilots(), api.gmListProfiles()])
      .then(([pilotList, profileList]) => {
        if (cancelled) return;
        setPilots(pilotList);
        setProfiles(profileList);
        setLoadError('');
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGm]);

  const groups = useMemo(() => {
    const nickById = new Map(profiles.map((p) => [p.id, p.nick]));
    const roleById = new Map(profiles.map((p) => [p.id, p.role]));
    const byUser = new Map();
    for (const pilot of pilots) {
      if (!byUser.has(pilot.userId)) byUser.set(pilot.userId, []);
      byUser.get(pilot.userId).push(pilot);
    }
    // Players with no pilots yet still show up in the roster.
    for (const p of profiles) {
      if (!byUser.has(p.id)) byUser.set(p.id, []);
    }
    return Array.from(byUser.entries())
      .map(([userId, list]) => ({
        userId,
        nick: nickById.get(userId) || 'невідомий гравець',
        role: roleById.get(userId) || 'player',
        pilots: list,
      }))
      .sort((a, b) => {
        // Own (GM) group last — the panel is about the players.
        const aOwn = a.userId === user?.id;
        const bOwn = b.userId === user?.id;
        if (aOwn !== bOwn) return aOwn ? 1 : -1;
        return a.nick.localeCompare(b.nick, 'uk');
      });
  }, [pilots, profiles, user?.id]);

  // Role still resolving — don't flash a redirect for an actual GM on refresh.
  if (role === null) {
    return <div style={{ padding: 40, color: 'var(--text-dimmer)' }}>Завантаження…</div>;
  }
  if (!isGm) {
    return <Navigate to="/pilots" replace />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, #1a0d14 0%, #0d070b 70%)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 860, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <img src="/logo-ferum-vox.webp" alt="" width={28} height={28} style={{ display: 'block' }} />
          <div className="title-font" style={{ fontSize: 26, letterSpacing: 3, color: '#e2b13c' }}>
            ГМ-ПАНЕЛЬ
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{user?.nick}</span>
            <button className="btn-ghost" onClick={() => navigate('/board')} type="button">
              ДОШКА ІГОР
            </button>
            <button className="btn-ghost" onClick={() => navigate('/pilots')} type="button">
              ← МОЇ ПІЛОТИ
            </button>
            <button className="btn-ghost" onClick={logout} type="button">
              ВИЙТИ
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-dimmer)', letterSpacing: 1, marginBottom: 24 }}>
          ГРАВЦІВ: {groups.length} · ПЕРСОНАЖІВ: {pilots.length}
        </div>

        {loadError && <div className="error-box" style={{ marginBottom: 16 }}>{loadError}</div>}
        {loading && <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>Завантаження…</div>}

        {!loading &&
          groups.map((group) => (
            <div key={group.userId} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="title-font" style={{ fontSize: 16, letterSpacing: 2, color: 'var(--text-bright)' }}>
                  {group.nick}
                </span>
                {group.role === 'gm' && (
                  <span style={{ fontSize: 10, color: '#e2b13c', letterSpacing: 1, border: '1px solid #6b5320', padding: '2px 6px' }}>
                    ГМ
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
                  {group.pilots.length ? `персонажів: ${group.pilots.length}` : 'персонажів немає'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.pilots.map((p) => {
                  const ll = computeLL(p.games);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigate(`/pilots/${p.id}`, { state: { from: 'gm' } })}
                      style={{
                        display: 'block',
                        width: '100%',
                        boxSizing: 'border-box',
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: '14px 18px',
                        background: '#160e13',
                        color: 'var(--text)',
                        border: '1px solid #3a2733',
                        fontFamily: "'Share Tech Mono',monospace",
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                        <span className="title-font" style={{ fontSize: 18, letterSpacing: 1 }}>{p.callsign}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{p.name}</span>
                        {p.status === 'archive' && (
                          <span style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: 1 }}>АРХІВ</span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dimmer)', whiteSpace: 'nowrap' }}>
                          {formatDate(p.updatedAt)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 18, marginTop: 8, flexWrap: 'wrap' }}>
                        <Stat label="ТІР" value={llTier(ll)} />
                        <Stat label="ЛЛ" value={ll} />
                        <Stat label="ІГОР" value={p.games} />
                        <Stat
                          label="ХП"
                          value={p.hp ? `${p.hp.current}/${p.hp.max}` : '—'}
                          color={p.hp && p.hp.current <= Math.ceil(p.hp.max / 3) ? 'var(--danger)' : undefined}
                        />
                        <Stat label="СТРЕС" value={p.stress} color={p.stress >= 6 ? 'var(--danger)' : undefined} />
                        <Stat label="МАНА" value={p.mana} />
                        <Stat label="МЕХІВ" value={p.mechCount} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        <div style={{ marginTop: 14, fontSize: 10, color: '#5a3d51', letterSpacing: 1, textAlign: 'center' }}>
          UNION ADMINISTRATIVE // GM OVERSIGHT
        </div>
      </div>
      <NavDrawer />
    </div>
  );
}
