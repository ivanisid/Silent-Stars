import { useEffect, useState } from 'react';
import { Panel, useConfirm } from '../../components/kit.jsx';
import { onShowUpgrade } from '../../components/overlayBus';
import { INSURANCE_PACKS, UPGRADES, UPGRADE_GROUPS } from '../constants';

// «Особисті покращення» (інтерфейс 2c, замість «Особистого ангару»). Ліворуч — список за
// групами зі станом, праворуч — деталі обраного: ефект, уточнення, внесок частинами й
// покупка. Внесок, повернення й покупка пишуться в журнал операцій (з відкатом).
//
// Стани: own — придбано; ready — внесок зібрано повністю; buy — з гаманцем вистачає;
// poor — не вистачає.

const INTRO =
  '«Гільдія пропонує ряд додаткових послуг всім її учасникам. Від додаткових послуг менеджерів, до більшої кількості можливостей у вашому особистому ангарі. Одноразові вкладення які полегшать ваш подальший шлях в роботі найманця»';

function Svg({ size = 18, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" style={{ flex: 'none' }}>
      {children}
    </svg>
  );
}

const both = (m, p) => [m ? `${m} М` : '', p ? `${p} PR` : ''].filter(Boolean).join(' та ');

export function upgradeStatus(state, up) {
  const d = state.hangar.deposits?.[up.key] || {};
  const dep = { mana: d.mana || 0, pr: d.pr || 0 };
  const rest = { mana: Math.max(0, up.mana - dep.mana), pr: Math.max(0, up.pr - dep.pr) };
  const lack = { mana: Math.max(0, rest.mana - state.mana.balance), pr: Math.max(0, rest.pr - state.pr) };
  let k = 'poor';
  if (state.hangar.owned[up.key]) k = 'own';
  else if (!rest.mana && !rest.pr) k = 'ready';
  else if (!lack.mana && !lack.pr) k = 'buy';
  return { k, dep, rest, lack, part: dep.mana > 0 || dep.pr > 0 };
}

const DOT = {
  own: { bg: 'var(--success)', bd: 'var(--success)' },
  ready: { bg: 'transparent', bd: 'var(--success)' },
  buy: { bg: 'transparent', bd: 'var(--accent)' },
  poor: { bg: 'transparent', bd: 'var(--input-border)' },
};

function subText(up, st) {
  if (st.k === 'own') return 'придбано';
  if (st.k === 'ready') return 'зібрано · можна придбати';
  if (st.part) return `внесено ${st.dep.mana} / ${up.mana} М${up.pr ? ` · ${st.dep.pr} / ${up.pr} PR` : ''}`;
  return `${up.mana} М${up.pr ? ` · ${up.pr} PR` : ''}`;
}

function subInk(st) {
  if (st.k === 'own' || st.k === 'ready') return 'var(--success)';
  if (st.k === 'buy' || st.part) return 'var(--text-dim)';
  return 'var(--text-dimmer)';
}

const BADGE = {
  own: { label: 'АКТИВНЕ', ink: 'var(--success)', bd: 'var(--ok-border)', bg: 'var(--ok-bg)' },
  ready: { label: 'ЗІБРАНО', ink: 'var(--success)', bd: 'var(--ok-border)', bg: 'transparent' },
  buy: { label: 'ДОСТУПНЕ', ink: 'var(--accent)', bd: 'var(--accent-dim)', bg: 'transparent' },
};

// Рядок внеску однієї валюти: іконка, «внесено / ціна», смуга, кнопки.
function DepositRow({ icon, name, have, need, wallet, steps, canDep, onPut }) {
  const done = have >= need;
  const left = Math.max(0, need - have);
  const off = !canDep || wallet <= 0 || left <= 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--panel-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-dim)' }}>
        {icon}
        <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>{name}</span>
        <span className="num" style={{ marginLeft: 'auto', fontSize: 15, color: 'var(--text-bright)' }}>
          {have}
          <span style={{ color: 'var(--text-dimmer)', fontSize: 12 }}> / {need}</span>
        </span>
      </div>
      <div style={{ height: 4, background: 'var(--input-bg)', border: '1px solid var(--input-border)', display: 'flex' }}>
        <div style={{ width: `${Math.min(100, Math.round((have / need) * 100))}%`, background: done ? 'var(--success)' : 'var(--accent)' }} />
      </div>
      {canDep && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {steps.map((n) => (
            <button key={n} type="button" className="btn-ghost md" disabled={off} title={`Внести ${Math.min(n, left, wallet)}`} onClick={() => onPut(n)}>
              +{n}
            </button>
          ))}
          <button type="button" className="btn-ghost md" disabled={off} title={`Внести ${Math.min(left, wallet)} — скільки бракує, але не більше, ніж є`} onClick={() => onPut('all')}>
            Все можливе
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>у вас {wallet}</span>
        </div>
      )}
    </div>
  );
}

export default function UpgradesPanel({ state, dispatch }) {
  const [ask, dialog] = useConfirm();
  const [sel, setSel] = useState(() => (UPGRADES.find((u) => !state.hangar.owned[u.key]) || UPGRADES[0]).key);
  const [msg, setMsg] = useState('');

  useEffect(
    () =>
      onShowUpgrade((key) => {
        if (UPGRADES.some((u) => u.key === key)) {
          setSel(key);
          setMsg('');
        }
      }),
    [],
  );

  const mana = state.mana.balance;
  const { pr } = state;
  const ownedCount = UPGRADES.filter((u) => state.hangar.owned[u.key]).length;
  const up = UPGRADES.find((u) => u.key === sel) || UPGRADES[0];
  const st = upgradeStatus(state, up);
  const canDep = st.k === 'buy' || st.k === 'poor';
  const badge = BADGE[st.k] || { label: st.part ? 'ЗБІР КОШТІВ' : 'НЕ ВИСТАЧАЄ КОШТІВ', ink: 'var(--text-dim)', bd: 'var(--input-border)', bg: 'transparent' };

  const why = {
    own: 'Покращення вже діє.',
    ready: 'Внесок зібрано повністю.',
    buy: `Решта: ${both(st.rest.mana, st.rest.pr)}. Можна доплатити й придбати одразу.`,
    poor: `Не вистачає ${both(st.lack.mana, st.lack.pr)}. Внесене зберігається в покращенні.`,
  }[st.k];

  const put = (currency, amount) => {
    dispatch({ type: 'UPGRADE_DEPOSIT', key: up.key, currency, amount });
    setMsg('');
  };

  async function buy() {
    if (st.k === 'ready') {
      dispatch({ type: 'UPGRADE_BUY', key: up.key });
      setMsg(`>> «${up.title}» придбано.`);
      return;
    }
    const lines = [
      { t: `Вже внесено: ${st.dep.mana} М${up.pr ? ` · ${st.dep.pr} PR` : ''}.`, ink: 'var(--text-dim)' },
      { t: `Мана: ${mana} → ${mana - st.rest.mana} М`, ink: 'var(--text)' },
      st.rest.pr > 0 && { t: `PR: ${pr} → ${pr - st.rest.pr}`, ink: 'var(--text)' },
    ];
    const ok = await ask({ title: 'ПОКУПКА', question: `Придбати «${up.title}»?`, lines, yesLabel: 'ПРИДБАТИ' });
    if (!ok) return;
    dispatch({ type: 'UPGRADE_BUY', key: up.key });
    setMsg(`>> «${up.title}» придбано. Списано ${both(st.rest.mana, st.rest.pr)}.`);
  }

  function refund() {
    dispatch({ type: 'UPGRADE_REFUND', key: up.key });
    setMsg(`>> Внесене в «${up.title}» повернено на гаманець.`);
  }

  const btn = {
    own: { label: 'ПРИДБАНО', cls: 'btn-ghost', style: { color: 'var(--success)', borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', opacity: 1 } },
    ready: { label: 'ПРИДБАТИ', cls: 'btn' },
    buy: { label: 'ДОПЛАТИТИ Й ПРИДБАТИ', cls: 'btn' },
    poor: { label: 'ПРИДБАТИ', cls: 'btn-remain' },
  }[st.k];

  return (
    <Panel id="upgrades" title="ОСОБИСТІ ПОКРАЩЕННЯ" sub={`${ownedCount} / ${UPGRADES.length}`}>
      {dialog}
      <div style={{ padding: '10px 14px', fontSize: 11, lineHeight: 1.6, color: 'var(--text-dimmer)', borderBottom: '1px solid var(--panel-border)', textWrap: 'pretty' }}>{INTRO}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 420 }}>
        <div className="ss-up-list">
          {UPGRADE_GROUPS.map((g) => {
            const items = UPGRADES.filter((u) => u.group === g);
            const n = items.filter((u) => state.hangar.owned[u.key]).length;
            return (
              <div key={g} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 12px 8px' }}>
                  <span style={{ fontSize: 10, letterSpacing: 2, color: 'var(--accent)' }}>{g}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dimmer)' }}>{n} / {items.length}</span>
                </div>
                <div style={{ height: 2, margin: '0 12px 6px', background: 'var(--input-border)', display: 'flex' }}>
                  <div style={{ width: `${Math.round((n / items.length) * 100)}%`, background: 'var(--success)' }} />
                </div>
                {items.map((u) => {
                  const s = upgradeStatus(state, u);
                  const on = u.key === up.key;
                  return (
                    <button
                      key={u.key}
                      type="button"
                      className={`ss-up-item${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => {
                        setSel(u.key);
                        setMsg('');
                      }}
                    >
                      <span style={{ width: 8, height: 8, background: DOT[s.k].bg, border: `1px solid ${DOT[s.k].bd}` }} />
                      <span style={{ fontSize: 12, color: 'var(--text-bright)', lineHeight: 1.3 }}>{u.title}</span>
                      <span />
                      <span style={{ fontSize: 10, color: subInk(s), letterSpacing: 0.5 }}>{subText(u, s)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ flex: '999 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 24px 16px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--panel-border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-dimmer)' }}>{up.group}</span>
                <span className="title-font" style={{ fontSize: 26, color: 'var(--text-bright)', lineHeight: 1.1 }}>{up.title}</span>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 10, letterSpacing: 1, padding: '4px 8px', color: badge.ink, border: `1px solid ${badge.bd}`, background: badge.bg, whiteSpace: 'nowrap' }}>
                {badge.label}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 9, letterSpacing: 2, color: 'var(--text-faint)' }}>З ДОСЬЄ ГІЛЬДІЇ</span>
              <span style={{ fontSize: 11, color: 'var(--text-info)', lineHeight: 1.6, textWrap: 'pretty' }}>{up.quote}</span>
            </div>
          </div>

          <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 10, letterSpacing: 2, color: 'var(--accent)' }}>ЕФЕКТ</span>
            {up.effect.map((r) => (
              <div key={r} style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-bright)', textWrap: 'pretty' }}>{r}</div>
            ))}
            {up.notes.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px dashed var(--input-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 9, letterSpacing: 2, color: 'var(--text-faint)' }}>УТОЧНЕННЯ</span>
                {up.notes.map((r) => (
                  <div key={r} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 8, fontSize: 11, lineHeight: 1.6, color: 'var(--text-dim)' }}>
                    <span style={{ color: 'var(--text-faint)' }}>·</span>
                    <span style={{ textWrap: 'pretty' }}>{r}</span>
                  </div>
                ))}
              </div>
            )}
            {up.packs && (
              <>
                <span style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-dimmer)', marginTop: 6 }}>ВІДКРИВАЄ В МАГАЗИНІ</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                  {INSURANCE_PACKS.map((p) => (
                    <div key={p.key} style={{ padding: 10, border: '1px dashed var(--input-border)', background: 'var(--panel-sunken)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-bright)' }}>
                        <span style={{ color: 'var(--text-dimmer)', display: 'flex' }}>
                          <Svg size={13}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" /></Svg>
                        </span>
                        {p.title}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', lineHeight: 1.4 }}>{p.desc} · 1 раз</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ margin: 'auto 24px 20px', border: '1px solid var(--panel-border)', background: 'var(--panel-sunken)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, letterSpacing: 2, color: 'var(--accent)' }}>ВНЕСОК</span>
              <span style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>ресурси можна вносити частинами</span>
              {st.k !== 'own' && st.part && (
                <button type="button" className="ss-up-refund" onClick={refund} title="Повернути все внесене в це покращення на гаманець">
                  Повернути внесене
                </button>
              )}
            </div>
            <DepositRow
              icon={<Svg><circle cx="12" cy="12" r="9.5" /><path d="M8 16.5V8l4 4.5L16 8v8.5" /><path d="M6.5 14h11" /></Svg>}
              name="Мана"
              have={st.k === 'own' ? up.mana : st.dep.mana}
              need={up.mana}
              wallet={mana}
              steps={[50, 100]}
              canDep={canDep}
              onPut={(n) => put('mana', n)}
            />
            {up.pr > 0 && (
              <DepositRow
                icon={<Svg><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" /><circle cx="12" cy="12" r="3.5" /></Svg>}
                name="PR"
                have={st.k === 'own' ? up.pr : st.dep.pr}
                need={up.pr}
                wallet={pr}
                steps={[5, 25]}
                canDep={canDep}
                onPut={(n) => put('pr', n)}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderTop: '1px solid var(--panel-border)' }}>
              <span style={{ fontSize: 11, lineHeight: 1.5, flex: 1, minWidth: 160, color: st.k === 'poor' ? 'var(--text-dim)' : st.k === 'buy' ? 'var(--text)' : 'var(--success)' }}>
                {msg ? <span style={{ color: 'var(--success)' }}>{msg}</span> : why}
              </span>
              <button
                type="button"
                className={btn.cls}
                style={{ height: 36, padding: '0 18px', letterSpacing: 2, ...(btn.style || {}) }}
                disabled={st.k === 'own' || st.k === 'poor'}
                title={st.k === 'poor' ? `Не вистачає ${both(st.lack.mana, st.lack.pr)}` : undefined}
                onClick={buy}
              >
                {btn.label}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
