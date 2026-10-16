# Сторінка правил — завдання для Claude Code

Перед початком: прочитати `CLAUDE.md`, `docs/overview.md`. Макети — Design-артефакт
«Silent Stars — сторінка правил» (https://claude.ai/artifact/CXfb9vsmxFLXsxYxX9a5mm):
затверджено варіант **A** (рядок «A · Одна сторінка, три стилі») і ГМ-редактор **блоками**
(артборди «ГМ · режим редагування сторінки», «ГМ · розділ блоками», «ГМ · розділ блоками, картки»).
Варіанти B, C і «текст з розміткою» — відхилені, не реалізовувати.

Джерело тексту правил — `docs/rules-source.md` (вивантаження Google Doc «Silent stars правила»).

## 0. Що треба уточнити в користувача до коміту

- `desc` для пункту меню «ПРАВИЛА» в `NAV_ITEMS` (у інших пунктів це рядок на кшталт
  «Довідник: звичайні та рідкісні») — не вигадувати.
- Чи підходить `code: 'RUL'` для таб-бару телефона.

## 1. Принцип: одна розмітка — три стилі

Сторінку збирати **лише** з `PageShell`, `PageHeader`, `Panel` (`client/src/components/kit.jsx`).
Вони вже малюють FERUM//VOX (і решту тем COMP/CON), KARRAKIN INTERSTELLAR (SVG-рамка `Panel`,
хребет `PageShell`) і KARRAKIN ACADEMY (CSS поверх `ss-*`). Ніяких перевірок `theme ===` на
сторінці правил.

Новий вміст панелей — один набір класів `ss-prose` (див. §4), стилізований:
- базово в `client/src/styles/theme.css` — лише через змінні теми;
- в `skin-karrakin-interstellar.css` і `skin-karrakin-academy.css` — короткий блок
  перевизначень (шрифти Cinzel / Forum / Cormorant Garamond, лінії). Кольори — тільки змінні.

## 2. Дані

### Модель розділу

```js
{
  id: 'uuid',
  title: 'ЕКОНОМІКА ТА ПРОГРЕСІЯ',
  sort: 1,
  blocks: [
    { type: 'paragraph', text: 'Гравці мають дві основні валюти' },
    { type: 'cards', items: [
      { title: 'МАНА', text: '…' },
      { title: 'PRINTER REQUISITION · PR', text: '… до максимум **100 PR**.' },
    ] },
    { type: 'table', rows: [ { name: 'Ремонтний комплект', value: '10 PR' } ] },
    { type: 'quote', text: '…' },
  ],
}
```

Чотири типи блоків: `paragraph`, `table` (рядки «назва / значення»), `cards`
(«заголовок / текст»), `quote`. У тексті єдина розмітка — `**…**` (виділення, рендериться як
`<strong>`). Жодного HTML з бази в `dangerouslySetInnerHTML`: парсити `**` вручну на React-вузли.

### Міграція `supabase/migrations/<дата>_rules.sql`

За зразком наявних (коментар зверху + блок `Rollback`):

- таблиця `public.rule_sections (id uuid pk default gen_random_uuid(), title text not null,
  sort integer not null, blocks jsonb not null default '[]', updated_at timestamptz default now(),
  updated_by uuid references auth.users)`;
- RLS увімкнено; `select` — будь-який автентифікований користувач; прямих insert/update/delete
  політик немає;
- запис лише через `security definer` RPC з перевіркою `private.is_gm()` (як
  `gm_save_rare_reserve` у `20261006b_rare_reserve_price.sql`):
  - `gm_save_rule_section(p_id uuid, p_title text, p_blocks jsonb) returns uuid` — створює
    (p_id null → sort = max+1) або оновлює; валідує, що `blocks` — масив, а кожен `type`
    з чотирьох дозволених;
  - `gm_delete_rule_section(p_id uuid)`;
  - `gm_reorder_rule_sections(p_ids uuid[])` — переписує `sort` за порядком масиву.
- помилки RPC — українською, як у наявних функціях.

Міграцію застосовувати через Supabase MCP лише після підтвердження користувача.

### Наповнення

Окремий seed-скрипт або друга міграція, що вставляє розділи з `docs/rules-source.md`
**дослівно** (текст не переписувати й не скорочувати; англомовні цитати правил Lancer лишити
англійською). Ціни й пороги, що в документі записані списком (додатковий ремонт, пороги LL,
пакети страхового фонду), — блоками `table`; «Мана / PR» — блоком `cards`; художні цитати
гільдії — `quote`. Розбиття на розділи — за заголовками документа; якщо розбиття неоднозначне,
показати користувачу план розділів до вставки.

### API (`client/src/api.js`)

`listRuleSections()`, `saveRuleSection(id, title, blocks)`, `deleteRuleSection(id)`,
`reorderRuleSections(ids)` — за стилем наявних методів (`supabase.from(...)` / `supabase.rpc(...)`).

## 3. Сторінка `/rules`

- `client/src/pages/RulesPage.jsx`; маршрут у `client/src/App.jsx` під `RequireAuth`.
- Пункт у `NAV_ITEMS` (`client/src/components/NavDrawer.jsx`): `label: 'ПРАВИЛА'`, `to: '/rules'`,
  іконка — сторінка з рядками (`M5 3h11l3 3v15H5zM9 9h7M9 13h7M9 17h4`), `desc` і `code` — з §0.
- `PageHeader section="SILENT STARS" title="ПРАВИЛА"`.
- Компонування (макет A): flex-рядок з `flex-wrap: wrap`; ліворуч стовпець панелей
  (`flex: 999 1 560px; min-width: 0`), **праворуч** — зміст розділів
  (`flex: 1 1 220px; max-width: 260px`, `position: sticky`, `align-self: flex-start`).
  Ліва сторона зайнята основною рейкою навігації, тому зміст саме праворуч.
- Клік по пункту змісту — прокрутка до панелі (`id` панелі = id розділу); активний пункт
  підсвічується за прокруткою (IntersectionObserver).
- Один розділ = один `Panel` з `title`.
- Телефон (≤640px): зміст переноситься під панелі через `flex-wrap` (не sticky); перевірити,
  що нічого не виходить за ширину, таблиці не ламаються.

## 4. Рендер блоків (`ss-prose`)

Компонент `RuleBlocks({ blocks })`, обгортка `<div className="ss-prose">`:

- `paragraph` → `<p>`;
- `table` → `<table>`: ліва колонка — назва, права — значення справа, `white-space: nowrap`,
  тонкі лінії між рядками (`--rule`);
- `cards` → сітка `repeat(2, minmax(0, 1fr))` (на телефоні — 1 колонка); картка: заголовок
  акцентним кольором (`--accent`), під ним текст; фон `--panel-inset`;
- `quote` → курсивний блок (в ACADEMY — Cormorant Garamond, як примітки);
- `**…**` → `<strong>` кольором `--text-bright`.

## 5. ГМ-редагування (лише `isGm` з `useAuth()`)

За артбордами «ГМ · …»:

- У правій частині `PageHeader` — кнопка-перемикач `РЕДАГУВАННЯ` (`btn-gm`). Режим живе лише
  в стані сторінки.
- У режимі редагування:
  - у шапці кожної панелі (`right` у `Panel`): `↑`, `↓`, `ЗМІНИТИ` (`btn-ghost sm`),
    `ВИДАЛИТИ` (`btn-danger sm`, через `useConfirm` / `ConfirmDialog`);
  - між панелями й під змістом — `+ ДОДАТИ РОЗДІЛ` (`btn-gm`).
- `ЗМІНИТИ` перетворює панель на редактор (`Panel tone="gm"`):
  - поле `НАЗВА РОЗДІЛУ`;
  - список блоків; у кожного шапка з типом (`АБЗАЦ` / `ТАБЛИЦЯ` / `КАРТКИ` / `ЦИТАТА`) і `↑ ↓ ✕`;
  - `АБЗАЦ`, `ЦИТАТА` — `textarea`;
  - `ТАБЛИЦЯ` — рядки з двох `input` (`НАЗВА`, `ЦІНА`) і `✕`, під ними `+ РЯДОК`;
  - `КАРТКИ` — сітка карток, у кожної `← → ✕`, `input` заголовка і `textarea` тексту;
    під сіткою `+ КАРТКА`;
  - під блоками: `+ АБЗАЦ`, `+ ТАБЛИЦЯ`, `+ КАРТКИ`, `+ ЦИТАТА`;
  - внизу `СКАСУВАТИ` (`btn-ghost`) і `ЗБЕРЕГТИ` (`btn-gm`, під час запиту `ЗБЕРЕЖЕННЯ…`).
- Помилки збереження — `Msg kind="err"`.
- Редагується один розділ за раз; незбережені зміни при `СКАСУВАТИ` відкидаються.

Написи вище — повний список нового тексту інтерфейсу. Нічого понад них не додавати
(жодних підказок, пояснень під полями, плейсхолдерів-інструкцій) — див. `CLAUDE.md`.

## 6. Перевірка перед комітом

- `npm run build` і лінт (`client/eslint.config.js`) — чисто.
- Запустити апку й переглянути `/rules` у темах FERUM//VOX, KARRAKIN INTERSTELLAR і
  KARRAKIN ACADEMY; у карракінських — **усі 10 домів**, окремо світлі (Скла, Обіцянки):
  читабельність тексту, таблиць і карток; Cinzel-капітель не менше 10px.
- Перевірити ширину телефона (390px).
- Від імені не-ГМа: кнопки `РЕДАГУВАННЯ` немає, прямий виклик `gm_save_rule_section` падає з
  помилкою.
- Ніяких захардкоджених hex у компонентах і CSS-блоках — лише змінні.
