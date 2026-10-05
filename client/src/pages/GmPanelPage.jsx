import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { llTier } from '../pilot/logic';
import { Menu, Msg, PageHeader, PageShell, Panel, useConfirm } from '../components/kit.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const COLS = 'minmax(140px,1.4fr) repeat(8, minmax(44px,.5fr)) 120px';

function plural(n) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'ПЕРСОНАЖ';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'ПЕРСОНАЖІ';
  return 'ПЕРСОНАЖІВ';
}

export default function GmPanelPage() {
  const { user, role, isGm } = useAuth();
  const [q, setQ] = useState('');
  const [pilots, setPilots] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ask, dialog] = useConfirm();
  const [roleNote, setRoleNote] = useState('');

  async function changeRole(group) {
    const toGm = group.role !== 'gm';
    const ok = await ask({
      title: toGm ? 'ЗРОБИТИ ГМОМ?' : 'ЗНЯТИ РОЛЬ ГМА?',
      tone: toGm ? 'gm' : 'danger',
      lines: toGm
        ? [`«${group.nick}»`, 'бачитиме персонажів усіх гравців і цю панель', 'зможе створювати й вести слоти ігор', 'зможе змінювати ролі інших учасників']
        : [`«${group.nick}»`, 'втратить доступ до ГМ-панелі й чужих персонажів'],
      yesLabel: toGm ? 'ЗРОБИТИ ГМОМ' : 'ЗНЯТИ РОЛЬ',
    });
    if (!ok) return;
    setLoadError('');
    setRoleNote('');
    try {
      const newRole = await api.gmSetRole(group.userId, toGm ? 'gm' : 'player');
      setProfiles((list) => list.map((p) => (p.id === group.userId ? { ...p, role: newRole } : p)));
      setRoleNote(newRole === 'gm' ? `«${group.nick}» тепер ГМ.` : `«${group.nick}» більше не ГМ.`);
    } catch (err) {
      setLoadError(err.message);
    }
  }


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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((g) =>
        g.nick.toLowerCase().includes(needle)
          ? g
          : { ...g, pilots: g.pilots.filter((p) => p.callsign.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)) },
      )
      .filter((g) => g.pilots.length > 0 || g.nick.toLowerCase().includes(needle));
  }, [groups, q]);

  // Role still resolving — don't flash a redirect for an actual GM on refresh.
  if (role === null) {
    return (
      <PageShell>
        <div className="ss-note">&gt; Завантаження…</div>
      </PageShell>
    );
  }
  if (!isGm) {
    return <Navigate to="/pilots" replace />;
  }

  return (
    <PageShell>
      <PageHeader
        section="OVERSIGHT"
        title={<span style={{ color: 'var(--gm-ink)' }}>ГМ-ПАНЕЛЬ</span>}
        tag={<span className="ss-tag gm">ГМ</span>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>ГРАВЦІВ <span style={{ color: 'var(--text-bright)' }}>{groups.length}</span></div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>ПЕРСОНАЖІВ <span style={{ color: 'var(--text-bright)' }}>{pilots.length}</span></div>
        <input className="ss-input sm m-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ гравець або позивний" style={{ marginLeft: 'auto', width: 220 }} />
      </div>

      {dialog}
      {loadError && <Msg kind="err">{loadError}</Msg>}
      {roleNote && <Msg kind="ok">{roleNote}</Msg>}
      {loading && <div className="ss-note">&gt; Завантаження…</div>}

      {!loading &&
        shown.map((group) => (
          <Panel
            key={group.userId}
            tone="gm"
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {group.nick}
                {group.role === 'gm' && <span className="ss-tag gm" style={{ padding: '1px 6px' }}>ГМ</span>}
              </span>
            }
            sub={group.pilots.length ? `${group.pilots.length} ${plural(group.pilots.length)}` : 'ПЕРСОНАЖІВ НЕМАЄ'}
            right={
              // Свою роль змінити не можна — меню лише в чужих групах.
              group.userId !== user?.id && (
                <Menu
                  small
                  title="Роль учасника"
                  items={[
                    { header: 'РОЛЬ' },
                    group.role === 'gm'
                      ? { label: 'ЗНЯТИ РОЛЬ ГМА…', danger: true, onClick: () => changeRole(group) }
                      : { label: 'ЗРОБИТИ ГМОМ…', onClick: () => changeRole(group) },
                  ]}
                />
              )
            }
          >
            {group.pilots.length > 0 && (
              <div className="gm-thead" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '6px 14px', fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1, borderBottom: '1px solid var(--panel-border)' }}>
                <span>ПІЛОТ</span><span>МАНА</span><span>PR</span><span>ЛЛ</span><span>ІГОР</span><span>ХП</span><span>СТРЕС</span><span>ТІР</span><span>МЕХІВ</span><span style={{ textAlign: 'right' }}>ОНОВЛЕНО</span>
              </div>
            )}
            {group.pilots.map((p, i) => (
              <Link
                key={p.id}
                to={`/pilots/${p.id}`}
                className="gm-row num"
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '8px 14px', borderTop: i ? '1px solid var(--panel-border)' : 'none', fontSize: 12, opacity: p.status === 'archive' ? 0.6 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span className="title-font" style={{ fontSize: 16, letterSpacing: 1, color: 'var(--text-bright)' }}>{p.callsign}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {p.status === 'archive' && <span className="ss-tag bad">АРХІВ</span>}
                </div>
                <span data-l="МАНА">{p.mana}</span>
                <span data-l="PR">{p.pr}</span>
                <span data-l="ЛЛ">{p.ll}</span>
                <span data-l="ІГОР">{p.games}</span>
                <span data-l="ХП">{p.hp ? `${p.hp.current}/${p.hp.max}` : '—'}</span>
                <span data-l="СТРЕС">{p.stress}</span>
                <span data-l="ТІР">{llTier(p.ll)}</span>
                <span data-l="МЕХІВ">{p.mechCount}</span>
                <span className="gm-upd" style={{ color: 'var(--text-dimmer)', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatDate(p.updatedAt)}</span>
              </Link>
            ))}
            {group.pilots.length === 0 && <div className="ss-note" style={{ padding: '10px 14px', fontSize: 12 }}>&gt; Персонажів немає.</div>}
          </Panel>
        ))}

      <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, textAlign: 'center' }}>FERUM VOX // GM OVERSIGHT</div>
    </PageShell>
  );
}
