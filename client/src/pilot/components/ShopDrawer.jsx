import { useEffect, useRef, useState } from 'react';
import { SHOP_DATA, PR_SERVICES, LIMITED_REFILL_PR, PR_PACK_SIZE, INSURANCE_PACKS } from '../constants';
import { KIT_PR, KITS_FULL_PR, isLimited, itemRefillPr } from '../repair';
import { derivePilotView } from '../derive';
import { useConfirm } from '../../components/kit.jsx';
import { announceOpen, modalIsOpen, onOpenShop, onOtherOpen, showUpgrade } from '../../components/overlayBus';

// Магазин (інтерфейс 2c): скошений язичок праворуч з вкладками-лічильниками PR / МАНА /
// ПОЛІС і напівпрозора панель. Відкритість і вкладка — стан інтерфейсу, у пілоті не
// зберігаються.
//
// Позиції, що застосовуються до меха чи системи, розгортають під собою список цілей —
// кожна зі своєю ціною й причиною, якщо недоступна. Одна ціль — одразу вікно
// підтвердження. Відновлення лімітних зарядів завжди показує список: неповні лімітні
// системи всіх мехів, ціна кожної — за її базовим запасом.

const TABS = [
  { key: 'repair', title: 'PRINTER' },
  { key: 'mana', title: 'SHOP' },
  { key: 'ins', title: 'INSURANCE' },
];

const REPAIR_ALL = 'HP, структура, реактор, ремкомплекти й заряди — до максимуму. Знищене відновлюється, Core Power заряджається.';

function Svg({ size = 18, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" style={{ flex: 'none' }}>
      {children}
    </svg>
  );
}
const IconPr = () => <Svg><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" /><circle cx="12" cy="12" r="3.5" /></Svg>;
const IconMana = () => <Svg><circle cx="12" cy="12" r="9.5" /><path d="M8 16.5V8l4 4.5L16 8v8.5" /><path d="M6.5 14h11" /></Svg>;
const IconShield = ({ size }) => <Svg size={size}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" /></Svg>;
const IconLock = ({ size }) => <Svg size={size}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;

const frameOf = (m) => [m.frameSource, m.frame].filter(Boolean).join(' ').toUpperCase();

export default function ShopDrawer({ state, dispatch }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('repair');
  const [expanded, setExpanded] = useState(null);
  const [msg, setMsg] = useState('');
  const [glow, setGlow] = useState(null);
  const [ask, dialog] = useConfirm();
  const listRef = useRef(null);
  const raf = useRef(0);

  const show = (t) => {
    setTab(t);
    setExpanded(null);
    setMsg('');
    setOpen(true);
    announceOpen('shop');
  };
  const close = () => setOpen(false);

  useEffect(() => onOtherOpen('shop', close), []);
  useEffect(() => onOpenShop(show), []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && !modalIsOpen() && close();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const { pr } = state;
  const mana = state.mana.balance;
  const { prCap } = derivePilotView(state);
  const mechs = state.mechs;
  const fund = !!state.hangar.owned.insure;
  const one = mechs.length === 1;

  // ---------- Підтвердження й виконання ----------
  async function confirmPr({ title, question, price, lines, action, done }) {
    const ok = pr >= price;
    const yes = await ask({
      title,
      question,
      lines: [
        ...lines.map((t) => (typeof t === 'string' ? { t, ink: 'var(--text)' } : t)),
        { t: `PR: ${pr} → ${pr - price}`, ink: 'var(--text)' },
        !ok && { t: '!! Недостатньо PR.', ink: 'var(--danger)' },
      ],
      canYes: ok,
    });
    if (!yes) return;
    dispatch(action);
    setMsg(`>> ${done} Списано ${price} PR.`);
  }

  async function confirmMana({ title, question, price, lines, action, done }) {
    const ok = mana >= price;
    const yes = await ask({
      title,
      question,
      lines: [
        ...lines.map((t) => (typeof t === 'string' ? { t, ink: 'var(--text)' } : t)),
        { t: `Мана: ${mana} → ${mana - price} М`, ink: 'var(--text)' },
        !ok && { t: '!! Недостатньо мани.', ink: 'var(--danger)' },
      ],
      canYes: ok,
    });
    if (!yes) return;
    dispatch(action);
    setMsg(`>> ${done} Списано ${price} М.`);
  }

  // ---------- Позиції ----------
  // row: { key, title, price, note, block, targets?, run? }
  // target: { key, title, note, price, block, run }
  const noMech = mechs.length === 0 ? 'Немає жодного меха' : '';
  const lackPr = (cost) => (pr < cost ? 'Недостатньо PR' : '');
  const lackMana = (cost) => (mana < cost ? 'Недостатньо мани' : '');

  const kitTargets = (full) =>
    mechs
      .filter((m) => m.repairCurrent < m.repairMax)
      .map((m) => ({
        key: m.id,
        title: m.name,
        note: `${m.repairCurrent} / ${m.repairMax}${full ? ` → ${m.repairMax}` : ''}`,
        price: `${full ? KITS_FULL_PR : KIT_PR} PR`,
        block: lackPr(full ? KITS_FULL_PR : KIT_PR),
        run: () =>
          confirmPr({
            title: 'PRINTER',
            question: full ? `Поповнити всі ремкомплекти «${m.name}»?` : `Купити 1 ремкомплект для «${m.name}»?`,
            price: full ? KITS_FULL_PR : KIT_PR,
            lines: [`Ремкомплекти: ${m.repairCurrent} → ${full ? m.repairMax : m.repairCurrent + 1}`],
            action: { type: 'BUY_KITS', id: m.id, mode: full ? 'full' : 'one' },
            done: full ? `«${m.name}»: ремкомплекти поповнено.` : `«${m.name}»: куплено 1 ремкомплект.`,
          }),
      }));

  const kitsNote = (full) => {
    if (!one) return 'оберіть меха';
    const m = mechs[0];
    return full ? `до ${m.repairMax}` : `${m.repairCurrent} / ${m.repairMax}`;
  };

  // Усі неповні лімітні системи всіх мехів.
  const refillTargets = mechs.flatMap((m) =>
    (m.items || [])
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => isLimited(it) && it.current < it.max)
      .map(({ it, idx }) => {
        const price = itemRefillPr(it);
        return {
          key: `${m.id}:${idx}`,
          title: it.name,
          note: `${one ? '' : `${m.name} · `}${it.current} / ${it.max}${it.destroyed ? ' · знищено' : ''}`,
          price: `${price} PR`,
          block: lackPr(price),
          run: () =>
            confirmPr({
              title: 'ПОПОВНЕННЯ ЗАРЯДІВ',
              question: `Поповнити заряди «${it.name}»?`,
              price,
              lines: [
                `${m.name} · ${it.name}: ${it.current} → ${it.max}`,
                { t: `Базовий запас ${it.base ?? it.max} → ${price} PR`, ink: 'var(--text-dimmer)' },
              ],
              action: { type: 'REFILL_ITEM', id: m.id, idx },
              done: `«${it.name}»: заряди поповнено.`,
            }),
        };
      }),
  );
  const refillMin = Math.min(...refillTargets.map((t) => parseInt(t.price, 10)));
  const refillRange = Object.values(LIMITED_REFILL_PR);

  const prRepair = PR_SERVICES.find((s) => s.key === 'fullrepair');
  const lux = Object.fromEntries(SHOP_DATA.map((it) => [it.key, it]));

  const fullRepairTargets = (byMana) =>
    mechs.map((m) => {
      const price = byMana ? lux.fullrepair.price : prRepair.cost;
      return {
        key: m.id,
        title: m.name,
        note: frameOf(m) || '—',
        price: `${price} ${byMana ? 'М' : 'PR'}`,
        block: byMana ? lackMana(price) : lackPr(price),
        run: () =>
          (byMana ? confirmMana : confirmPr)({
            title: byMana ? 'LUXURY' : 'PRINTER',
            question: `Повний ремонт / передрук «${m.name}»?`,
            price,
            lines: [{ t: REPAIR_ALL, ink: 'var(--text-dim)' }],
            action: byMana ? { type: 'SHOP_BUY', key: 'fullrepair', mechId: m.id } : { type: 'PR_FULL_REPAIR', id: m.id },
            done: `«${m.name}» передруковано.`,
          }),
      };
    });

  const coreTargets = mechs
    .filter((m) => !m.corePower)
    .map((m) => ({
      key: m.id,
      title: m.name,
      note: frameOf(m) || 'Core Power витрачено',
      price: `${lux.core.price} М`,
      block: lackMana(lux.core.price),
      run: () =>
        confirmMana({
          title: 'LUXURY',
          question: `Зарядити Core Power «${m.name}»?`,
          price: lux.core.price,
          lines: [],
          action: { type: 'SHOP_BUY', key: 'core', mechId: m.id },
          done: `«${m.name}»: Core Power заряджено.`,
        }),
    }));

  const packGain = Math.max(0, Math.min(PR_PACK_SIZE, prCap - pr));

  const rows = {
    repair: [
      {
        key: 'kit',
        title: '1 ремонтний комплект',
        price: `${KIT_PR} PR`,
        note: noMech ? '' : kitsNote(false),
        block: noMech || (kitTargets(false).length ? lackPr(KIT_PR) : 'Ремкомплекти вже повні'),
        targets: kitTargets(false),
      },
      {
        key: 'kitsfull',
        title: 'Поповнення всіх ремонтних комплектів',
        price: `${KITS_FULL_PR} PR`,
        note: noMech ? '' : kitsNote(true),
        block: noMech || (kitTargets(true).length ? lackPr(KITS_FULL_PR) : 'Ремкомплекти вже повні'),
        targets: kitTargets(true),
      },
      {
        key: 'refill',
        title: 'Відновлення лімітних зарядів однієї системи',
        price: `${Math.min(...refillRange)}–${Math.max(...refillRange)} PR`,
        note: refillTargets.length ? `неповних: ${refillTargets.length}` : '',
        block: noMech || (refillTargets.length ? lackPr(refillMin) : 'Усі лімітні заряди повні'),
        targets: refillTargets,
        list: true,
      },
      {
        key: 'prfull',
        title: 'Повний ремонт / передрук меха',
        price: `${prRepair.cost} PR`,
        note: `${one ? `${frameOf(mechs[0]) || mechs[0].name} · ` : ''}або ${lux.fullrepair.price} М у LUXURY`,
        block: noMech || lackPr(prRepair.cost),
        targets: fullRepairTargets(false),
      },
    ],
    mana: [
      {
        key: 'mfull',
        title: 'Повний ремонт / передрук меха',
        price: `${lux.fullrepair.price} М`,
        note: one ? frameOf(mechs[0]) || mechs[0].name : '',
        block: noMech || lackMana(lux.fullrepair.price),
        targets: fullRepairTargets(true),
      },
      {
        key: 'core',
        title: 'Заряд Core Power',
        price: `${lux.core.price} М`,
        note: one ? frameOf(mechs[0]) || mechs[0].name : '',
        block: noMech || (coreTargets.length ? lackMana(lux.core.price) : 'Core Power уже заряджено'),
        targets: coreTargets,
      },
      {
        key: 'prpack',
        title: lux.prpack.title,
        price: `${lux.prpack.price} М`,
        note: packGain < PR_PACK_SIZE && packGain > 0 ? `пілоту · влізе лише +${packGain} PR (кап ${prCap})` : 'пілоту',
        block: pr >= prCap ? `PR уже на капі (${prCap})` : lackMana(lux.prpack.price),
        run: () =>
          confirmMana({
            title: 'LUXURY',
            question: `Купити ${PR_PACK_SIZE} PR?`,
            price: lux.prpack.price,
            lines: [
              `PR: ${pr} → ${pr + packGain}`,
              packGain < PR_PACK_SIZE && { t: `Кап ${prCap}: решта ${PR_PACK_SIZE - packGain} PR не нарахується.`, ink: 'var(--warn)' },
            ].filter(Boolean),
            action: { type: 'SHOP_BUY', key: 'prpack' },
            done: `Додано ${packGain} PR.`,
          }),
      },
    ],
  };

  function pressRow(r) {
    if (r.targets) {
      if (!r.list && r.targets.length === 1) return r.targets[0].run();
      return setExpanded((e) => (e === r.key ? null : r.key));
    }
    return r.run?.();
  }

  // Рядки в порядку показу: розгорнута позиція тягне за собою свої цілі.
  const shown = [];
  if (tab === 'ins') {
    INSURANCE_PACKS.forEach((p) => shown.push({ kind: 'pack', key: p.key, p }));
  } else {
    rows[tab].forEach((r) => {
      shown.push({ kind: 'row', key: r.key, r });
      if (expanded === r.key && !r.block) r.targets.forEach((t) => shown.push({ kind: 'target', key: `${r.key}/${t.key}`, t }));
    });
  }

  // Підсвітка під курсором: кожен рядок яскравішає ближче до курсора.
  const glowMove = (e) => {
    const y = e.clientY;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      setGlow(
        [...el.children].map((c) => {
          const b = c.getBoundingClientRect();
          return Math.max(0.1, 1 - Math.abs(y - (b.top + b.height / 2)) / 150);
        }),
      );
    });
  };
  const glowLeave = () => {
    cancelAnimationFrame(raf.current);
    setGlow(null);
  };
  const fa = (i) => (glow ? glow[i] ?? 0.1 : 0.1);

  const tabBtn = (key, icon, num, label, extraCls = '') => {
    const on = open && tab === key;
    return (
      <button
        type="button"
        className={`tab${on ? ' on' : ''}${extraCls}`}
        title={TABS.find((t) => t.key === key).title}
        onClick={() => (on ? close() : show(key))}
      >
        <div className="bar" />
        {icon}
        {num}
        <span className="k">{label}</span>
      </button>
    );
  };

  return (
    <>
      {dialog}
      {open && <div className="ss-shop-back" onClick={close} />}
      <div className={`ss-shop${open ? ' open' : ''}`}>
        <div className="line" />
        <div className="tabcol">
          <div className="bev toggle">
            <div className="b1" />
            <div className="b2" />
            <div className="c">
              <button type="button" aria-label="Магазин" aria-expanded={open} onClick={() => (open ? close() : show(tab))}>
                <Svg size={14}><path d={open ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></Svg>
              </button>
            </div>
          </div>
          <div className="tabsrow">
            <div style={{ width: 2 }} />
            <div className="bev tabs">
              <div className="b1" />
              <div className="b2" />
              <div className="c">
                {tabBtn('repair', <IconPr />, <span className="n">{pr}</span>, 'PR')}
                {tabBtn('mana', <IconMana />, <span className="n">{mana}</span>, 'МАНА')}
                {tabBtn(
                  'ins',
                  fund ? <IconShield size={18} /> : <IconLock size={18} />,
                  fund ? <span className="n" style={{ color: 'var(--success)' }}>0</span> : <span className="n" style={{ color: 'var(--text-faint)' }}>—</span>,
                  'ПОЛІС',
                  fund ? ' fund' : '',
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="wrap" aria-hidden={!open}>
          <div style={{ paddingLeft: 10 }}>
            <div className="body" onMouseMove={glowMove} onMouseLeave={glowLeave}>
              <div className="glass" />
              <div className="head">
                <span className="h">{TABS.find((t) => t.key === tab).title}</span>
              </div>
              {msg && <div className="msg">{msg}</div>}
              <div className="list" ref={listRef}>
                {shown.map((s, i) => {
                  if (s.kind === 'pack') {
                    return (
                      <div key={s.key} className="row" style={{ opacity: fund ? 1 : 0.45 }}>
                        <div className="bg" style={{ opacity: fa(i) }} />
                        <div className="tx">
                          <span className="tt">{s.p.title}</span>
                          <span className="nt">{s.p.desc} · 1 раз</span>
                        </div>
                        {fund && (
                          <button type="button" className="price na" disabled title="Ціну ще не визначено">— PR</button>
                        )}
                      </div>
                    );
                  }
                  if (s.kind === 'target') {
                    const t = s.t;
                    return (
                      <div key={s.key} className="row sub">
                        <div className="bg" style={{ opacity: fa(i) }} />
                        <div className="tx">
                          <span className="tt">{t.title}</span>
                          <span className={`nt${t.block ? ' bad' : ''}`}>{t.block || t.note}</span>
                        </div>
                        <button type="button" className="price" disabled={!!t.block} title={t.block || undefined} onClick={t.run}>
                          {t.price}
                        </button>
                      </div>
                    );
                  }
                  const r = s.r;
                  const multi = r.targets && (r.list || r.targets.length > 1);
                  const isOpen = expanded === r.key && !r.block;
                  return (
                    <div key={s.key} className="row">
                      <div className="bg" style={{ opacity: fa(i) }} />
                      <div className="tx">
                        <span className="tt">{r.title}</span>
                        <span className={`nt${r.block ? ' bad' : ''}`}>{r.block || r.note}</span>
                      </div>
                      <button
                        type="button"
                        className="price"
                        disabled={!!r.block}
                        title={r.block || (multi ? (isOpen ? 'Сховати список' : 'Показати, до чого застосувати') : undefined)}
                        aria-expanded={multi ? isOpen : undefined}
                        onClick={() => pressRow(r)}
                      >
                        {r.price}
                        {multi && !r.block ? ` ${isOpen ? '▾' : '▸'}` : ''}
                      </button>
                    </div>
                  );
                })}
                {tab === 'ins' && !fund && (
                  <button
                    type="button"
                    className="lock"
                    onClick={() => {
                      close();
                      showUpgrade('insure');
                    }}
                  >
                    <IconLock size={14} />
                    <span style={{ flex: 1, color: 'var(--text)' }}>Потрібен «Страховий фонд»</span>
                    Особисті покращення
                    <Svg size={12}><path d="M9 6l6 6-6 6" /></Svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
