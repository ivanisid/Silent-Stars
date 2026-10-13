import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { llTier } from '../pilot/logic';
import { ConfirmDialog, Menu, Msg, MobileHead, PageHeader, PageShell, Panel, useConfirm } from '../components/kit.jsx';
import { useIsMobile } from '../useMobile';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Видалення незворотне, тож «так» стає доступним лише після введення ніка учасника.
function DeleteUserDialog({ group, onYes, onNo }) {
  const [typed, setTyped] = useState('');
  const match = typed.trim().toLowerCase() === group.nick.trim().toLowerCase();
  return (
    <ConfirmDialog
      title="ВИДАЛИТИ ПРОФІЛЬ?"
      tone="danger"
      lines={[
        `«${group.nick}»`,
        `персонажів: ${group.pilots.length} — зникнуть разом із мехами, резервами й журналом дій`,
        'записи на ігри та прив\'язка Discord теж зникнуть',
        'акаунт буде видалено — увійти в нього більше не вийде',
        'відновлення: неможливе',
      ]}
      note="Якщо гравець просто не грає — краще перенести його персонажів в архів."
      yesLabel="ВИДАЛИТИ НАЗАВЖДИ"
      canYes={match}
      onYes={onYes}
      onNo={onNo}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>ВВЕДІТЬ НІК «{group.nick}», ЩОБ ПІДТВЕРДИТИ</span>
        <input className="ss-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus placeholder={group.nick} />
      </label>
    </ConfirmDialog>
  );
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
  // Discord гравців, які його прив'язали: { userId: { name, id } }.
  const [discord, setDiscord] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ask, dialog] = useConfirm();
  const [roleNote, setRoleNote] = useState('');
  const [deleting, setDeleting] = useState(null); // група, яку збираються видалити
  const mobile = useIsMobile();

  async function deleteUser(group) {
    setDeleting(null);
    setLoadError('');
    setRoleNote('');
    try {
      const nick = await api.gmDeleteUser(group.userId);
      setProfiles((list) => list.filter((p) => p.id !== group.userId));
      setPilots((list) => list.filter((p) => p.userId !== group.userId));
      setRoleNote(`Профіль «${nick}» видалено.`);
    } catch (err) {
      setLoadError(err.message);
    }
  }

  async function changeRole(group) {
    const toGm = group.role !== 'gm';
    const ok = await ask({
      title: toGm ? 'ПІДВИЩИТИ ДО GM?' : 'ПОНИЗИТИ ДО ГРАВЦЯ?',
      tone: toGm ? 'gm' : 'danger',
      lines: toGm
        ? [`«${group.nick}»`, 'бачитиме персонажів усіх гравців і цю панель', 'зможе створювати й вести слоти ігор', 'зможе змінювати ролі інших учасників']
        : [`«${group.nick}»`, 'втратить доступ до ГМ-панелі й чужих персонажів'],
      yesLabel: toGm ? 'ПІДВИЩИТИ' : 'ПОНИЗИТИ',
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
    Promise.all([api.gmListAllPilots(), api.gmListProfiles(), api.gmListDiscordLinks()])
      .then(([pilotList, profileList, discordLinks]) => {
        if (cancelled) return;
        setPilots(pilotList);
        setProfiles(profileList);
        setDiscord(discordLinks);
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
        discord: discord[userId] || null,
        pilots: list,
      }))
      .sort((a, b) => {
        // Own (GM) group last — the panel is about the players.
        const aOwn = a.userId === user?.id;
        const bOwn = b.userId === user?.id;
        if (aOwn !== bOwn) return aOwn ? 1 : -1;
        return a.nick.localeCompare(b.nick, 'uk');
      });
  }, [pilots, profiles, discord, user?.id]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    // Гравця шукаємо й за Discord-іменем.
    const own = (g) => g.nick.toLowerCase().includes(needle) || (g.discord?.name || '').toLowerCase().includes(needle);
    return groups
      .map((g) =>
        own(g)
          ? g
          : { ...g, pilots: g.pilots.filter((p) => p.callsign.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)) },
      )
      .filter((g) => g.pilots.length > 0 || own(g));
  }, [groups, q]);

  // Role still resolving — don't flash a redirect for an actual GM on refresh.
  if (role === null) {
    return (
      <PageShell>
        <div className="ss-note"><span className="pre">&gt; </span>Завантаження…</div>
      </PageShell>
    );
  }
  if (!isGm) {
    return <Navigate to="/pilots" replace />;
  }

  // Свою роль змінити не можна — меню лише в чужих групах.
  const groupMenu = (group) =>
    group.userId !== user?.id && (
      <Menu
        small
        title="Роль учасника"
        items={[
          { header: 'РОЛЬ' },
          group.role === 'gm'
            ? { label: 'ПОНИЗИТИ ДО ГРАВЦЯ…', onClick: () => changeRole(group) }
            : { label: 'ПІДВИЩИТИ ДО GM…', onClick: () => changeRole(group) },
          { header: 'ПРОФІЛЬ' },
          group.role === 'gm'
            ? { label: 'ВИДАЛИТИ ПРОФІЛЬ — СПЕРШУ ПОНИЗИТИ', danger: true, disabled: true }
            : { label: 'ВИДАЛИТИ ПРОФІЛЬ…', danger: true, onClick: () => setDeleting(group) },
        ]}
      />
    );

  // Телефон: замість 10-колонкової таблиці — картка пілота з сіткою 4×2.
  if (mobile) {
    return (
      <PageShell>
        <MobileHead
          tone="gm"
          section="OVERSIGHT"
          title={<span style={{ color: 'var(--gm-ink)' }}>ГМ-ПАНЕЛЬ</span>}
          right={<span className="ss-tag gm">ГМ</span>}
        />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>
          <span>ГРАВЦІВ <span style={{ color: 'var(--text-bright)' }}>{groups.length}</span></span>
          <span>ПЕРСОНАЖІВ <span style={{ color: 'var(--text-bright)' }}>{pilots.length}</span></span>
          <span>З DISCORD <span style={{ color: 'var(--text-bright)' }}>{groups.filter((g) => g.discord).length}</span></span>
        </div>
        <input className="ss-input sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ гравець, Discord або позивний" style={{ width: '100%' }} />

        {dialog}
        {deleting && <DeleteUserDialog group={deleting} onYes={() => deleteUser(deleting)} onNo={() => setDeleting(null)} />}
        {loadError && <Msg kind="err">{loadError}</Msg>}
        {roleNote && <Msg kind="ok">{roleNote}</Msg>}
        {loading && <div className="ss-note"><span className="pre">&gt; </span>Завантаження…</div>}

        {!loading &&
          shown.map((group) => (
            <Panel
              key={group.userId}
              tone="gm"
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {group.nick}
                  {group.role === 'gm' && <span className="ss-tag gm" style={{ padding: '1px 6px' }}>ГМ</span>}
                </span>
              }
              sub={group.pilots.length ? `${group.pilots.length} ${plural(group.pilots.length)}` : 'ПЕРСОНАЖІВ НЕМАЄ'}
              right={groupMenu(group)}
            >
              {group.discord && (
                <div style={{ padding: '8px 14px 0' }}>
                  <span className="ss-tag" style={{ padding: '1px 6px', textTransform: 'none', userSelect: 'all' }} title={`Discord прив'язано · ID ${group.discord.id}`}>
                    DISCORD · {group.discord.name || group.discord.id}
                  </span>
                </div>
              )}
              {group.pilots.map((p, i) => {
                const cells = [
                  ['МАНА', p.mana],
                  ['PR', p.pr],
                  ['ЛЛ', p.ll],
                  ['ІГОР', p.games],
                  ['ХП', p.hp ? `${p.hp.current}/${p.hp.max}` : '—'],
                  ['СТРЕС', p.stress],
                  ['ТІР', llTier(p.ll)],
                  ['МЕХІВ', p.mechCount],
                ];
                return (
                  <Link
                    key={p.id}
                    to={`/pilots/${p.id}`}
                    className="ss-roster-row num"
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderTop: i || group.discord ? '1px solid var(--panel-border)' : 'none', marginTop: !i && group.discord ? 8 : 0, opacity: p.status === 'archive' ? 0.6 : 1, color: 'inherit' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span className="title-font" style={{ fontSize: 16, letterSpacing: 1, color: 'var(--text-bright)' }}>{p.callsign}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      {p.status === 'archive' && <span className="ss-tag bad">АРХІВ</span>}
                      <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>›</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px 8px' }}>
                      {cells.map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-dimmer)' }}>{k}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-bright)' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>ОНОВЛЕНО {formatDate(p.updatedAt)}</span>
                  </Link>
                );
              })}
              {group.pilots.length === 0 && <div className="ss-note" style={{ padding: '10px 14px', fontSize: 12 }}><span className="pre">&gt; </span>Персонажів немає.</div>}
            </Panel>
          ))}
        {!loading && shown.length === 0 && <div className="ss-note"><span className="pre">&gt; </span>Нічого не знайдено.</div>}

        <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, textAlign: 'center' }}>FERUM VOX // GM OVERSIGHT</div>
      </PageShell>
    );
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
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>З DISCORD <span style={{ color: 'var(--text-bright)' }}>{groups.filter((g) => g.discord).length}</span></div>
        <input className="ss-input sm m-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/ гравець, Discord або позивний" style={{ marginLeft: 'auto', width: 220 }} />
      </div>

      {dialog}
      {deleting && <DeleteUserDialog group={deleting} onYes={() => deleteUser(deleting)} onNo={() => setDeleting(null)} />}
      {loadError && <Msg kind="err">{loadError}</Msg>}
      {roleNote && <Msg kind="ok">{roleNote}</Msg>}
      {loading && <div className="ss-note"><span className="pre">&gt; </span>Завантаження…</div>}

      {!loading &&
        shown.map((group) => (
          <Panel
            key={group.userId}
            tone="gm"
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {group.nick}
                {group.role === 'gm' && <span className="ss-tag gm" style={{ padding: '1px 6px' }}>ГМ</span>}
                {/* Discord — лише якщо гравець прив'язав його до акаунта. */}
                {group.discord && (
                  <span
                    className="ss-tag"
                    style={{ padding: '1px 6px', textTransform: 'none', userSelect: 'all' }}
                    title={`Discord прив'язано · ID ${group.discord.id}`}
                  >
                    DISCORD · {group.discord.name || group.discord.id}
                  </span>
                )}
              </span>
            }
            sub={group.pilots.length ? `${group.pilots.length} ${plural(group.pilots.length)}` : 'ПЕРСОНАЖІВ НЕМАЄ'}
            right={groupMenu(group)}
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
            {group.pilots.length === 0 && <div className="ss-note" style={{ padding: '10px 14px', fontSize: 12 }}><span className="pre">&gt; </span>Персонажів немає.</div>}
          </Panel>
        ))}

      <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, textAlign: 'center' }}>FERUM VOX // GM OVERSIGHT</div>
    </PageShell>
  );
}
