# ГМ-редактор магазину й особистих покращень — підготовка

Перед початком: прочитати `CLAUDE.md`, `docs/overview.md`. Зразки, на які спиратися:
каталог рідкісних резервів (`client/src/pilot/rareReserves.js`, `RareReserveEditor.jsx`,
міграції `20261006_rare_reserves_catalog.sql`, `20261006b_rare_reserve_price.sql`) і
редактор правил (`docs/rules-page-spec.md`).

Завдання (від користувача):
1. Магазин — зміна цін будь-якої позиції й додавання нових позицій у відповідні вкладки.
2. Особисті покращення — зміна цін, описів і додавання нових покращень.

Цей документ — інвентаризація того, що є зараз, і план. Розділ 0 — рішення, які має
прийняти користувач до початку коду.

## 0. Що треба вирішити до коду

1. **Що робить нова позиція магазину.** Кожна наявна позиція має свою механіку в редюсері
   (табл. §1.1). Нова позиція, яку додав ГМ, може:
   - (а) лише списувати ціну й писати запис у журнал операцій, без зміни стану пілота/меха;
   - (б) обирати механіку з наявних (ремкомплекти, повний ремонт, заряд Core Power, пачка PR,
     для полісів — дія при використанні) з власною ціною;
   - (в) і те, й інше.
2. **Що робить нове покращення.** Механіку мають лише `buffer` (кап PR), `parking` (другий
   слот меха), `insure` (вкладка INSURANCE), `insure2` (заміна пакета клона); `quantum` —
   лише текст. Нове покращення — позначка «придбано» + тексти (як `quantum`), з необов'язковим
   «потрібне інше покращення» (`requires`)? Чи потрібні ще механіки?
3. **Чи редагуються параметри механік**, а не лише ціни: кап PR з «Трастовим фондом» (200,
   дзеркалиться в SQL `gm_close_game`), розмір пачки PR (10), щаблі поповнення зарядів
   (30 / 20 / 10 PR за 1 / 2 / 3+ зарядів), базовий кап PR (100), старт PR (30).
4. **Де живе редактор:**
   - (а) режим `РЕДАГУВАННЯ` прямо в магазині (`ShopDrawer`) і панелі «Особисті покращення»,
     як на сторінці правил;
   - (б) окремий розділ ГМ-панелі (`/gm`) зі списками позицій за вкладками й покращень.
   Магазин і покращення живуть у профілі пілота, тож у (а) ГМ редагує з профілю будь-якого
   пілота.
5. **Зміна ціни покращення, в яке гравці вже вносили частинами** (`state.hangar.deposits`).
   Зараз: якщо внесок більший за нову ціну, при покупці надлишок зникає (`UPGRADE_BUY`
   обнуляє внесок). Варіанти: повертати надлишок на гаманець при покупці / дозволити так, як є.
6. **Видалення позицій.** На ключі посилаються стани пілотів (`hangar.owned`, `deposits`,
   `policies`). Пропозиція — як у рідкісних резервів: не видаляти, а ховати (`archived`).
   Чи можна ховати вбудовані позиції (з механікою), чи лише додані ГМом?
7. **Текст правил.** `docs/rules-source.md` і розділи `rule_sections` містять ті самі ціни
   текстом (додатковий ремонт, страхові пакети). Зміна ціни в магазині їх не оновить.
   Лишити так (ГМ править правила окремо)?
8. **Звичайні резерви** (`/reserves`, ціна за рангом `RESERVE_RANK_PR` 10 / 20 / 40) — входять
   у «будь-що в магазині» чи ні?
9. **Написи нового інтерфейсу** — §5 містить пропозицію; потрібне підтвердження або заміна
   (див. `CLAUDE.md`: нічого понад затверджене).

## 1. Що є зараз

Увесь вміст — константи в `client/src/pilot/constants.js` і `client/src/pilot/repair.js`;
стан пілота — `pilots.state` (jsonb), зміни — редюсер `client/src/pilot/reducer.js`.

### 1.1. Магазин (`client/src/pilot/components/ShopDrawer.jsx`)

| Вкладка | Позиція | Ціна | Джерело | Дія редюсера | Що робить |
|---|---|---|---|---|---|
| PRINTER | 1 ремонтний комплект | 10 PR | `KIT_PR` (repair.js) | `BUY_KITS` mode one | +1 ремкомплект меху |
| PRINTER | Поповнення всіх ремкомплектів | 50 PR | `KITS_FULL_PR` | `BUY_KITS` mode full | ремкомплекти до максимуму |
| PRINTER | Відновлення лімітних зарядів однієї системи | 30 / 20 / 10 PR | `LIMITED_REFILL_PR` | `REFILL_ITEM` | заряди системи до максимуму; ціна за базовим запасом 1 / 2 / 3+ |
| PRINTER | Повний ремонт / передрук меха | 100 PR | `PR_SERVICES.fullrepair.cost` | `PR_FULL_REPAIR` | `fullyRepaired` |
| SHOP | Повний ремонт / передрук меха | 500 М | `SHOP_DATA.fullrepair.price` | `SHOP_BUY` | `fullyRepaired` |
| SHOP | Заряд Core Power | 250 М | `SHOP_DATA.core.price` | `SHOP_BUY` | `corePower = true` |
| SHOP | Printer Requisition · 10 шт | 200 М | `SHOP_DATA.prpack` + `PR_PACK_SIZE` | `SHOP_BUY` | +10 PR до капу |
| INSURANCE | Full recover | 100 PR + 100 М | `INSURANCE_PACKS` | `INSURANCE_BUY` / `USE` | при використанні — `fullyRepaired` меха |
| INSURANCE | Structure repair | 50 PR + 200 М | ″ | ″ | HP до максимуму, структура повна |
| INSURANCE | Reactor maintenance | 50 PR + 200 М | ″ | ″ | реактор повний |
| INSURANCE | Second chance / To hell and back | 0 PR + 2000 М | ″ | ″ | без зміни стану (лише запис); назва й опис міняються з `insure2` |

Вкладка INSURANCE відкривається покращенням `insure`. Поліс кожного типу — не більше одного
невикористаного (`state.hangar.policies`).

Ті самі ціни використовуються поза магазином:
- `KIT_PR` — у ремонті меха (`repairCost` у repair.js: бракуючі ремкомплекти докуповуються
  по `KIT_PR`) і кнопках ремкомплектів у `MechsPanel.jsx`;
- `KITS_FULL_PR`, ціни повного ремонту (PR і мана) — у `MechsPanel.jsx`;
- `PR_SERVICES` — частково (у магазині рядки зібрані вручну; `PR_SERVICES.kit/kitsfull` не
  читаються, ціни беруться з `KIT_PR` / `KITS_FULL_PR`).

### 1.2. Особисті покращення (`client/src/pilot/components/UpgradesPanel.jsx`)

Групи `UPGRADE_GROUPS`: «ФІНАНСОВИЙ МЕНЕДЖЕР», «ОСОБИСТИЙ АНГАР». Поля покращення:
`key, group, title, mana, pr, quote, effect[], notes[]`, необов'язкові `requires`, `packs`.

| key | Назва | Ціна | Механіка в коді |
|---|---|---|---|
| buffer | Трастовий фонд | 400 М | кап PR 100 → 200: `prCap` (reducer.js:84), `derive.js:25`, SQL `gm_close_game` (`20261008_optional_link_signup_and_gm_reward.sql:237`) |
| insure | Страховий фонд | 300 М | відкриває вкладку INSURANCE; `packs: true` — список пакетів у панелі |
| insure2 | Страховий фонд покращення | 1000 М, `requires: insure` | `insurancePack` заміняє пакет `clone` |
| parking | Розширений ангар | 800 М + 75 PR | `mechSlots` — другий слот меха |
| quantum | Квантове ліцензування | 1000 М + 100 PR | немає (лише текст) |

Також у панелі — вступна цитата `INTRO` (константа в `UpgradesPanel.jsx`).

Дії редюсера: `UPGRADE_DEPOSIT`, `UPGRADE_REFUND`, `UPGRADE_BUY` — шукають покращення в
`UPGRADES` і читають `up.mana`, `up.pr`, `up.requires`, `up.title`.

### 1.3. Наслідок для архітектури

Редюсер синхронний і читає каталоги напряму з констант. Отже каталог з бази має бути
доступний йому синхронно — так само, як `rareReserveByKey` (модульний кеш +
`useSyncExternalStore`).

## 2. Дані

### Таблиця `public.shop_items` (міграція `<дата>_shop_catalog.sql`)

Одна таблиця на позиції магазину й покращення (поле `kind`), бо в обох однакові потреби
(ціна в М і PR, тексти, порядок, приховування):

```
key        text primary key            -- 'kit', 'core', 'recover', 'buffer', ... ; нові — згенеровані
kind       text not null               -- 'printer' | 'shop' | 'insurance' | 'upgrade'
grp        text                        -- група покращення
title      text not null
price_pr   integer not null default 0 check (price_pr >= 0)
price_mana integer not null default 0 check (price_mana >= 0)
effect     text not null               -- механіка (див. нижче); вбудовані — фіксовані
params     jsonb not null default '{}' -- параметри механіки й тексти (quote, effect[], notes[], desc, requires, upgraded)
builtin    boolean not null default false
archived   boolean not null default false
sort       integer not null
updated_at timestamptz default now(), updated_by uuid references auth.users
```

- RLS увімкнено; `select` — будь-який автентифікований; прямого запису немає.
- Запис — `security definer` RPC з `private.is_gm()` (як `gm_save_rare_reserve`):
  `gm_save_shop_item(...)`, `gm_set_shop_item_archived(p_key, p_archived)`,
  `gm_reorder_shop_items(p_kind, p_keys text[])`. Для `builtin` RPC не дає змінити `key`,
  `kind`, `effect`. Помилки — українською.
- Окремо (якщо §0.4б або потрібне редагування) — таблиця/рядок для `INTRO` і груп покращень.
- Застосовувати через Supabase MCP лише після підтвердження користувача.

`effect` — закритий перелік, з яким уміє працювати редюсер. Вбудовані значення:
`kit_one`, `kits_full`, `refill_tiered`, `full_repair`, `core`, `pr_pack`, `ins_recover`,
`ins_structure`, `ins_reactor`, `ins_none`, `up_pr_cap`, `up_insurance`, `up_insurance2`,
`up_mech_slot`, `up_none`. Що з цього пропонується для нових позицій — за §0.1–0.2 (мінімум —
`none` / `ins_none` / `up_none`: списання + запис у журнал / позначка «придбано»).

### Наповнення

Друга міграція `<дата>_shop_catalog_seed.sql` вставляє всі позиції з §1.1–1.2 **дослівно**
(назви, ціни, тексти `quote` / `effect` / `notes` / `desc`) з `builtin = true` і тими самими
ключами, що зараз (`owned.buffer` тощо в станах пілотів лишаються дійсними).

### Сервер

Якщо кап PR редагується (§0.3) — `gm_close_game` читає кап з `shop_items` (ключ `buffer`,
`params.cap`) замість літералів 200/100. Інакше SQL не змінюється.

## 3. Клієнт

- `client/src/pilot/shopCatalog.js` — за зразком `rareReserves.js`: `loadShopCatalog(force)`,
  `useShopCatalog()`, синхронні `shopItems(kind)`, `shopItem(key)`, `upgrades()`, `upgrade(key)`,
  `priceOf(key)`. Поки каталог не завантажено або при помилці — значення з `constants.js`
  (вони ж — джерело для seed), щоб редюсер і екрани працювали так само, як зараз.
- Перевести всіх споживачів констант з §1 на `shopCatalog.js`: `reducer.js`, `ShopDrawer.jsx`,
  `UpgradesPanel.jsx`, `MechsPanel.jsx`, `repair.js` (`KIT_PR`, `itemRefillPr`), `derive.js`
  (кап PR, якщо §0.3). Рядки магазину будувати з каталогу за `effect`, а не вручну.
- Редюсер: `SHOP_BUY`, `BUY_KITS`, `REFILL_ITEM`, `PR_FULL_REPAIR`, `INSURANCE_BUY/USE`,
  `UPGRADE_*` — ціни й тексти з каталогу; нова загальна дія для позицій без механіки
  (списання PR/М + запис у журнал операцій з відкатом), якщо §0.1а/в.
- `client/src/api.js`: `listShopCatalog()`, `gmSaveShopItem(item)`,
  `gmSetShopItemArchived(key, archived)`, `gmReorderShopItems(kind, keys)`.
- Порядок кроків: (1) `shopCatalog.js` з фолбеком на константи й переведення споживачів —
  без зміни поведінки, перевірка тестами; (2) міграції; (3) редактор.

## 4. Редактор (лише `isGm`)

Залежить від §0.4. Спільне для обох варіантів:

- Позиція магазину: назва, ціна PR, ціна М (лише ті валюти, які має вкладка: PRINTER — PR,
  SHOP — М, INSURANCE — обидві), опис (`desc` для полісів), механіка (лише для нових, з
  дозволеного переліку §0.1), `↑ ↓`, сховати / показати.
- Покращення: група, назва, ціна М, ціна PR, цитата (`quote`), ефект — список рядків,
  уточнення — список рядків, «потрібне покращення» (`requires`, вибір з наявних), `↑ ↓`,
  сховати / показати.
- Збереження — RPC, далі `loadShopCatalog(true)`; помилки — `Msg kind="err"`.
- Валідація як у `RareReserveEditor`: назва не порожня, ціни — цілі ≥ 0.

## 5. Написи (пропозиція — потребує підтвердження, §0.9)

`РЕДАГУВАННЯ`, `ЗМІНИТИ`, `+ ДОДАТИ ПОЗИЦІЮ`, `+ ДОДАТИ ПОКРАЩЕННЯ`, `НАЗВА`, `ЦІНА, PR`,
`ЦІНА, М`, `ОПИС`, `МЕХАНІКА`, `ГРУПА`, `ЦИТАТА`, `ЕФЕКТ`, `УТОЧНЕННЯ`, `+ РЯДОК`,
`ПОТРІБНЕ ПОКРАЩЕННЯ`, `СХОВАТИ`, `ПОКАЗАТИ`, `СКАСУВАТИ`, `ЗБЕРЕГТИ` / `ЗБЕРЕЖЕННЯ…`.
Назви механік у списку — після §0.1–0.2. Нічого понад це (жодних підказок під полями).

## 6. Перевірка перед комітом

- `node client/src/pilot/__actions.test.mjs`, `mechMerge.test.mjs`, `mechBonuses.test.mjs`,
  `slotImport.test.mjs`; `npm run build` і лінт у `client`.
- Крок (1) з §3: після переведення на каталог з фолбеком усі ціни й тексти в магазині,
  покращеннях, ремонті меха й журналі — як до зміни.
- Після seed: каталог з бази дає ті самі значення, що й константи (порівняти поля).
- Зміна ціни ГМом видна в магазині, вікнах підтвердження, журналі операцій і ремонті меха;
  відкат запису журналу повертає саме списану суму.
- Пілоти з уже придбаними `buffer` / `insure` / `insure2` / `parking` / `quantum` і з
  внесками в `deposits` — без змін.
- Не-ГМ: кнопок редагування немає, прямий виклик RPC падає з помилкою.
- Теми FERUM//VOX, KARRAKIN INTERSTELLAR, KARRAKIN ACADEMY (усі 10 домів, окремо Скла й
  Обіцянки), ширина 390px. Кольори — лише змінні.
