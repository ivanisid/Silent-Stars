import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isLimited, itemRefillCost } from '../repair';
import {
  BUILTIN_KEYS,
  builtinItem,
  catalogItems,
  insurancePacks,
  costOf,
  costOfItem,
  costText,
  itemTitle,
  lackText,
  onSale,
  prPackSize,
  refillTiers,
  useShopCatalog,
} from '../shopCatalog';
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

function Svg({ size = 18, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" style={{ flex: 'none' }}>
      {children}
    </svg>
  );
}
const IconPr = ({ size }) => <Svg size={size}><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" /><circle cx="12" cy="12" r="3.5" /></Svg>;
const IconMana = ({ size }) => <Svg size={size}><circle cx="12" cy="12" r="9.5" /><path d="M8 16.5V8l4 4.5L16 8v8.5" /><path d="M6.5 14h11" /></Svg>;
const IconShield = ({ size }) => <Svg size={size}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" /></Svg>;
const IconLock = ({ size }) => <Svg size={size}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;

const frameOf = (m) => [m.frameSource, m.frame].filter(Boolean).join(' ').toUpperCase();

export default function ShopDrawer({ state, dispatch, mobile = false }) {
  useShopCatalog();
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
  // ?shop=<вкладка> — посилання з чаркуша пілота у Foundry відкриває магазин одразу.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const t = params.get('shop');
    if (t == null) return;
    show(TABS.some((x) => x.key === t) ? t : 'repair');
    params.delete('shop');
    setParams(params, { replace: true });
  }, [params]);
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
  const policies = state.hangar.policies || {};
  const packs = insurancePacks(state.hangar.owned, policies);
  const heldCount = packs.filter((p) => policies[p.key]).length;
  const one = mechs.length === 1;

  // ---------- Підтвердження й виконання ----------
  // cost — { pr, mana }: списуються обидві суми. prDelta — на скільки зміниться PR (у пачки
  // PR це ще й нараховане), за замовчуванням −cost.pr.
  async function confirmPay({ title, question, cost, prDelta = -cost.pr, lines, action, done }) {
    const okPr = pr >= cost.pr;
    const okMana = mana >= cost.mana;
    const yes = await ask({
      title,
      question,
      lines: [
        ...lines.map((t) => (typeof t === 'string' ? { t, ink: 'var(--text)' } : t)),
        (cost.pr > 0 || prDelta !== 0) && { t: `PR: ${pr} → ${pr + prDelta}`, ink: 'var(--text)' },
        cost.mana > 0 && { t: `Мана: ${mana} → ${mana - cost.mana} М`, ink: 'var(--text)' },
        !okPr && { t: '!! Недостатньо PR.', ink: 'var(--danger)' },
        !okMana && { t: '!! Недостатньо мани.', ink: 'var(--danger)' },
      ],
      canYes: okPr && okMana,
    });
    if (!yes) return;
    dispatch(action);
    setMsg(`>> ${done} Списано ${costText(cost)}.`);
  }

  // ---------- Позиції ----------
  // row: { key, title, price, note, block, targets?, run? }
  // target: { key, title, note, price, block, run }
  const noMech = mechs.length === 0 ? 'Немає жодного меха' : '';
  const lack = (cost) => lackText(state, cost);

  const KIT = costOf('kit');
  const KITS_FULL = costOf('kitsfull');
  const PR_PACK_SIZE = prPackSize();

  const kitTargets = (full) =>
    mechs
      .filter((m) => m.repairCurrent < m.repairMax)
      .map((m) => ({
        key: m.id,
        title: m.name,
        note: `${m.repairCurrent} / ${m.repairMax}${full ? ` → ${m.repairMax}` : ''}`,
        price: costText(full ? KITS_FULL : KIT),
        block: lack(full ? KITS_FULL : KIT),
        run: () =>
          confirmPay({
            title: 'PRINTER',
            question: full ? `Поповнити всі ремкомплекти «${m.name}»?` : `Купити 1 ремкомплект для «${m.name}»?`,
            cost: full ? KITS_FULL : KIT,
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
        const cost = itemRefillCost(it);
        return {
          key: `${m.id}:${idx}`,
          title: it.name,
          note: `${one ? '' : `${m.name} · `}${it.current} / ${it.max}${it.destroyed ? ' · знищено' : ''}`,
          price: costText(cost),
          cost,
          block: lack(cost),
          run: () =>
            confirmPay({
              title: 'ПОПОВНЕННЯ ЗАРЯДІВ',
              question: `Поповнити заряди «${it.name}»?`,
              cost,
              lines: [
                `${m.name} · ${it.name}: ${it.current} → ${it.max}`,
                { t: `Базовий запас ${it.base ?? it.max} → ${costText(cost)}`, ink: 'var(--text-dimmer)' },
              ],
              action: { type: 'REFILL_ITEM', id: m.id, idx },
              done: `«${it.name}»: заряди поповнено.`,
            }),
        };
      }),
  );
  // Найдешевша з неповних систем — щоб рядок не блокувався, поки хоч одну можна поповнити.
  const refillCheapest = refillTargets.reduce((a, t) => (!a || t.cost.pr < a.pr ? t.cost : a), null);
  const refillRange = Object.values(refillTiers()).map(Number);
  const refillMana = builtinItem('refill').mana || 0;

  const prRepair = builtinItem('prfull');
  const lux = { fullrepair: builtinItem('mfull'), core: builtinItem('core'), prpack: builtinItem('prpack') };
  const PR_FULL = costOfItem(prRepair);
  const MANA_FULL = costOfItem(lux.fullrepair);
  const CORE = costOfItem(lux.core);
  const PACK = costOfItem(lux.prpack);

  const fullRepairTargets = (byMana) =>
    mechs.map((m) => {
      const cost = byMana ? MANA_FULL : PR_FULL;
      return {
        key: m.id,
        title: m.name,
        note: frameOf(m) || '—',
        price: costText(cost),
        block: lack(cost),
        run: () =>
          confirmPay({
            title: byMana ? 'LUXURY' : 'PRINTER',
            question: `Повний ремонт / передрук «${m.name}»?`,
            cost,
            lines: [],
            action: byMana ? { type: 'SHOP_BUY', key: 'mfull', mechId: m.id } : { type: 'PR_FULL_REPAIR', id: m.id },
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
      price: costText(CORE),
      block: lack(CORE),
      run: () =>
        confirmPay({
          title: 'LUXURY',
          question: `Зарядити Core Power «${m.name}»?`,
          cost: CORE,
          lines: [],
          action: { type: 'SHOP_BUY', key: 'core', mechId: m.id },
          done: `«${m.name}»: Core Power заряджено.`,
        }),
    }));

  // Пачка PR рахується від гаманця після оплати (якщо пачка коштує ще й PR).
  const prAfterPack = pr - PACK.pr;
  const packGain = Math.max(0, Math.min(PR_PACK_SIZE, prCap - prAfterPack));

  // Позиція, додана ГМом: без механіки — лише списання й запис у журнал.
  const customRow = (it) => {
    const byMana = it.kind === 'shop';
    const cost = costOfItem(it);
    return {
      key: it.key,
      title: it.title,
      price: costText(cost),
      note: '',
      block: lack(cost),
      run: () =>
        confirmPay({
          title: byMana ? 'LUXURY' : 'PRINTER',
          question: `Придбати «${it.title}»?`,
          cost,
          lines: [],
          action: byMana ? { type: 'SHOP_BUY', key: it.key } : { type: 'PRINTER_BUY', key: it.key },
          done: `«${it.title}» придбано.`,
        }),
    };
  };

  const builtin = {
    repair: [
      {
        key: 'kit',
        title: builtinItem('kit').title,
        price: costText(KIT),
        note: noMech ? '' : kitsNote(false),
        block: noMech || (kitTargets(false).length ? lack(KIT) : 'Ремкомплекти вже повні'),
        targets: kitTargets(false),
      },
      {
        key: 'kitsfull',
        title: builtinItem('kitsfull').title,
        price: costText(KITS_FULL),
        note: noMech ? '' : kitsNote(true),
        block: noMech || (kitTargets(true).length ? lack(KITS_FULL) : 'Ремкомплекти вже повні'),
        targets: kitTargets(true),
      },
      {
        key: 'refill',
        title: builtinItem('refill').title,
        price: `${Math.min(...refillRange)}–${Math.max(...refillRange)} PR${refillMana ? ` + ${refillMana} М` : ''}`,
        note: refillTargets.length ? `неповних: ${refillTargets.length}` : '',
        block: noMech || (refillTargets.length ? lack(refillCheapest) : 'Усі лімітні заряди повні'),
        targets: refillTargets,
        list: true,
      },
      {
        key: 'prfull',
        title: prRepair.title,
        price: costText(PR_FULL),
        note: [one ? frameOf(mechs[0]) || mechs[0].name : '', onSale('mfull') ? `або ${costText(MANA_FULL)} у LUXURY` : ''].filter(Boolean).join(' · '),
        block: noMech || lack(PR_FULL),
        targets: fullRepairTargets(false),
      },
    ],
    mana: [
      {
        key: 'mfull',
        title: lux.fullrepair.title,
        price: costText(MANA_FULL),
        note: one ? frameOf(mechs[0]) || mechs[0].name : '',
        block: noMech || lack(MANA_FULL),
        targets: fullRepairTargets(true),
      },
      {
        key: 'core',
        title: lux.core.title,
        price: costText(CORE),
        note: one ? frameOf(mechs[0]) || mechs[0].name : '',
        block: noMech || (coreTargets.length ? lack(CORE) : 'Core Power уже заряджено'),
        targets: coreTargets,
      },
      {
        key: 'prpack',
        title: itemTitle(lux.prpack),
        price: costText(PACK),
        note: packGain < PR_PACK_SIZE && packGain > 0 ? `пілоту · влізе лише +${packGain} PR (кап ${prCap})` : 'пілоту',
        block: prAfterPack >= prCap ? `PR уже на капі (${prCap})` : lack(PACK),
        run: () =>
          confirmPay({
            title: 'LUXURY',
            question: `Купити ${PR_PACK_SIZE} PR?`,
            cost: PACK,
            prDelta: packGain - PACK.pr,
            lines: [packGain < PR_PACK_SIZE && { t: `Кап ${prCap}: решта ${PR_PACK_SIZE - packGain} PR не нарахується.`, ink: 'var(--warn)' }].filter(Boolean),
            action: { type: 'SHOP_BUY', key: 'prpack' },
            done: `Додано ${packGain} PR.`,
          }),
      },
    ],
  };

  // Рядки вкладки — у порядку каталогу, без прихованих. Вкладка магазину repair ↔ printer.
  const rowsOf = (kind, list) =>
    catalogItems(kind)
      .filter((it) => !it.archived)
      .map((it) => (BUILTIN_KEYS.includes(it.key) ? list.find((r) => r.key === it.key) : customRow(it)))
      .filter(Boolean);

  const rows = {
    repair: rowsOf('printer', builtin.repair),
    mana: rowsOf('shop', builtin.mana),
    ins: packs.map((p) => {
      const cost = [p.pr ? `${p.pr} PR` : '', p.mana ? `${p.mana} М` : ''].filter(Boolean).join(' + ');
      if (!policies[p.key]) {
        return {
          key: p.key,
          title: p.title,
          price: cost,
          note: p.desc,
          block: lack(costOfItem(p)),
          run: () => buyPolicy(p, cost),
        };
      }
      return {
        key: p.key,
        title: p.title,
        price: 'ВИКОРИСТАТИ',
        note: `придбано · ${p.desc}`,
        block: p.mech ? noMech : '',
        ...(p.mech
          ? { targets: mechs.map((m) => ({ key: m.id, title: m.name, note: frameOf(m) || '—', price: 'ВИКОРИСТАТИ', block: '', run: () => applyPolicy(p, m) })) }
          : { run: () => applyPolicy(p) }),
      };
    }),
  };

  async function buyPolicy(p, cost) {
    const yes = await ask({
      title: 'INSURANCE',
      question: `Придбати поліс «${p.title}»?`,
      lines: [
        { t: p.desc, ink: 'var(--text-dim)' },
        p.pr > 0 && { t: `PR: ${pr} → ${pr - p.pr}`, ink: 'var(--text)' },
        p.mana > 0 && { t: `Мана: ${mana} → ${mana - p.mana} М`, ink: 'var(--text)' },
      ],
      yesLabel: 'ПРИДБАТИ',
      canYes: pr >= p.pr && mana >= p.mana,
    });
    if (!yes) return;
    dispatch({ type: 'INSURANCE_BUY', key: p.key });
    setMsg(`>> Поліс «${p.title}» придбано. Списано ${cost}.`);
  }

  async function applyPolicy(p, m) {
    const yes = await ask({
      title: 'INSURANCE',
      question: m ? `Використати поліс «${p.title}» для «${m.name}»?` : `Використати поліс «${p.title}»?`,
      lines: [{ t: p.desc, ink: 'var(--text-dim)' }],
      yesLabel: 'ВИКОРИСТАТИ',
    });
    if (!yes) return;
    dispatch({ type: 'INSURANCE_USE', key: p.key, mechId: m?.id });
    setExpanded(null);
    setMsg(`>> Поліс «${p.title}» використано${m ? ` — ${m.name}` : ''}.`);
  }

  function pressRow(r) {
    if (r.targets) {
      if (!r.list && r.targets.length === 1) return r.targets[0].run();
      return setExpanded((e) => (e === r.key ? null : r.key));
    }
    return r.run?.();
  }

  // Рядки в порядку показу: розгорнута позиція тягне за собою свої цілі.
  const shown = [];
  if (tab === 'ins' && !fund) {
    packs.forEach((p) => shown.push({ kind: 'pack', key: p.key, p }));
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
  const fa = (i) => (mobile ? 0.55 : glow ? glow[i] ?? 0.1 : 0.1);

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

  const tabBtns = (iconSize) => (
    <>
      {tabBtn('repair', <IconPr size={iconSize} />, <span className="n">{pr}</span>, 'PR')}
      {tabBtn('mana', <IconMana size={iconSize} />, <span className="n">{mana}</span>, 'МАНА')}
      {tabBtn(
        'ins',
        fund ? <IconShield size={iconSize} /> : <IconLock size={iconSize} />,
        fund ? <span className="n" style={{ color: 'var(--success)' }}>{heldCount}</span> : <span className="n" style={{ color: 'var(--text-faint)' }}>—</span>,
        'ПОЛІС',
        fund ? ' fund' : '',
      )}
    </>
  );

  const list = (
    <div className="list" ref={listRef}>
      {shown.map((s, i) => {
        if (s.kind === 'pack') {
          return (
            <div key={s.key} className="row" style={{ opacity: 0.45 }}>
              <div className="bg" style={{ opacity: fa(i) }} />
              <div className="tx">
                <span className="tt">{s.p.title}</span>
                <span className="nt">{s.p.desc}</span>
              </div>
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
  );

  // Телефон: стрічка над таб-баром — стрілка й три вкладки в ряд; панель відкривається
  // над стрічкою, висотою за вмістом, без затемнення сторінки.
  if (mobile) {
    return (
      <>
        {dialog}
        <div className={`ss-shop m${open ? ' open' : ''}`}>
          {open && (
            <div className="body">
              <div className="glass" />
              <div className="line" />
              <div className="head">
                <span className="h">{TABS.find((t) => t.key === tab).title}</span>
              </div>
              {msg && <div className="msg">{msg}</div>}
              {list}
            </div>
          )}
          <div className="strip">
            <div className="bev toggle">
              <div className="b1" />
              <div className="b2" />
              <div className="c">
                <button type="button" aria-label="Магазин" aria-expanded={open} onClick={() => (open ? close() : show(tab))}>
                  <Svg size={14}><path d={open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} /></Svg>
                </button>
              </div>
            </div>
            <div className="bev tabs">
              <div className="b1" />
              <div className="b2" />
              <div className="c">{tabBtns(14)}</div>
            </div>
          </div>
        </div>
      </>
    );
  }

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
              <div className="c">{tabBtns(18)}</div>
            </div>
          </div>
        </div>

        {/* inert — щоб у закритому магазині кнопки не ловили фокус з клавіатури. */}
        <div className="wrap" aria-hidden={!open} {...(open ? null : { inert: '' })}>
          <div style={{ paddingLeft: 10 }}>
            <div className="body" onMouseMove={glowMove} onMouseLeave={glowLeave}>
              <div className="glass" />
              <div className="head">
                <span className="h">{TABS.find((t) => t.key === tab).title}</span>
              </div>
              {msg && <div className="msg">{msg}</div>}
              {list}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
