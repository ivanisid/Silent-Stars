# Pilot mechanics spec (extracted from the Claude Design prototype)

## Post-launch changes (post-implementation, not in the original prototype)

### Економіка Тіру 1: DC → PR (Printer Requisition)

Гомбрю-економіка перебудована під нові правила кампанії. Ця секція описує вже
реалізовану частину; те, чого правила не задають, перелічено як відкриті питання.

- **PR замінили DC і стали єдиним пулом пілота.** Раніше DC існували у двох місцях —
  `state.dcStore` (особистий склад, схований до покупки «Ресурсного буфера», кап 5/10)
  і `mechs[].dc` (нагорода за місію, що лягала на меха). Тепер це один лічильник
  `state.pr`, видимий завжди, кап `PR_CAP_BASE` = 100, з «Ресурсним буфером» —
  `PR_CAP_BUFFER` = 200. Поле `mechs[].dc` прибране разом з діями `SHIFT_MECH_DC`
  та `MECH_DC_TO_BUFFER`.
- **Стартовий запас** — `PR_START` = 30 у новоствореного пілота (`pilotDefaults.js`).
- **«Ресурсний буфер» більше не відкриває склад,** а лише піднімає кап. Його меню обміну
  (`bufServices`: 2 DC → ремкомплект / 3 заряди, 5 DC → скид overcharge, 10 DC → повний
  ремонт) прибране й замінене списком `PR_SERVICES`.
- **Витрата PR** (`PR_SERVICES`, дія `prSpend`, модалка `PrSpendModal`), за правилами —
  через downtime-дію Printer use:
  - 1 ремонтний комплект — 10 PR
  - поповнення всіх ремонтних комплектів — 50 PR
  - відновлення лімітних зарядів **однієї** системи — за її базовим запасом:
    1 заряд → 30 PR, 2 → 20 PR, 3 і більше → 10 PR (`limitedRefillPr`)
  - повний ремонт / передрук меха — 100 PR або 500 мани
- **Модалка ремонту за DC (`DcRepairModal`, дія `dcr`) видалена цілком** — вона розподіляла
  отримані за місію DC між ремонтами, а цього поняття більше немає: нагорода йде в пул PR.
- **Магазин за ману звужений** (`SHOP_DATA`): ремонтні позиції переїхали на PR, лишився
  повний ремонт/передрук за 500 мани. «3 Лімітні заряди» і «Заряд Core Power» у нових
  правилах не згадані взагалі — позначені `unspecified: true` і лишені зі старими цінами.
- **Нагорода за гру** (`gm_resolve_slot`, міграція `20260918_pr_economy.sql`): колонка
  `game_slots.reward_dc` перейменована на `reward_pr`, нарахування йде в пул пілота з
  урахуванням капу; надлишок понад кап згорає, що фіксується рядком у логу дій.
- **Міграція наявних даних** у тій самій міграції: `state.dcStore` → `state.pr` (1:1,
  обрізане по 100), `state.buf` → `state.prSpend`, `state.dcr` і `mechs[].dc` прибрані.

### Переведення старих балансів

Мана й прогрес міняються ролями: мана була валютою магазину й стає PR, а зіграні ігри
були прогресом до рівня й стають маною-XP.

**Ігри → мана.** Частка пройденого шляху між порогом поточного рівня й порогом
наступного, помножена на ціну цього рівня. Зіграна 1 гра з 3 потрібних дає 1/3 ціни:
7 ігор — це ЛЛ4 з порогами 6→9, тобто 1/3 від 1200 = **400 мани**. На ЛЛ12 прогресу
немає, мана 0. `state.games` не чіпається — лишається лічильником зіграних ігор.

**Мана → PR за курсом 200 мани = 10 PR**, плюс наявні DC, з обрізанням по капу 100.
Курс узятий з купівельної спроможності й сходиться на двох позиціях точно:

| Позиція | Стара ціна | За курсом | Нова ціна |
|---|---|---|---|
| Ремонтний комплект | 200 мани | 10 PR | 10 PR |
| Повний ремонт / передрук | 2000 мани | 100 PR | 100 PR |

**Нічого не згорає.** У PR іде стільки, скільки влазить під кап 100 разом із DC; уся
решта старої мани — і надлишок понад кап, і те, що не добрало до цілого PR — додається
до мани як XP. Тож `PR × 20 + мана` завжди дорівнює старому балансу.

**Стара й нова мана — різні валюти.** Це знімає уявну розбіжність: повний ремонт коштує
100 PR або 500 **нової** мани, і 500 ≠ 2000 не тому, що курси не сходяться, а тому що
нова мана — це XP, окремий ресурс зі своєю ціною.

Конверсія живе у двох місцях: міграція `20260919_convert_legacy_progress.sql` для бази
та `normalizePilotState()` для всього, що приходить повз неї — насамперед для відкатів
на записи аудиту зі старою формою. Обидві спрацьовують лише коли `state.pr` відсутній,
тож повторно не застосовуються.

### Що сталося зі старими записами аудиту

`pilot_audit_log` жодна міграція не чіпає — усі записи лишаються. Але їхні знімки мають
**форму стану до міграцій**, і це дає три наслідки:

- **Колонка PR порожня для старої історії.** У знімках є `dcStore`, а нова функція читає
  `pr`. Мана відображається нормально — її шлях не мінявся.
- **Операції, де змінювались лише DC, зникають зі списку** — новий фільтр порівнює `pr` з
  обох боків, а він скрізь порожній. Записи лишаються в таблиці, просто не показуються.
- **Відкат на старий запис ламав би профіль.** `revert_pilot_state` робить
  `update pilots set state = ...`, тобто замінює стан знімком **цілком**, без домішування
  дефолтів. У старій формі немає `ll`, `pr`, `prSpend`, `stressMax`, `downAndOut`,
  `reserves`, `reserveFreeBuy`, `creative`, `levelUp`, а `burdens` має іншу форму — і
  `ShopDrawer`, `BondMenu` та `DowntimePanel` падали б на читанні цих полів.

**Запобіжник:** `normalizePilotState()` у `pilotDefaults.js`, через яку проходить кожен
завантажений стан (`__INIT__` у `PilotProfilePage`). Вона накладає збережене на поточні
дефолти й переносить застаріле: `dcStore` → `pr` (обрізане капом), рівень із кількості
ігор за старою таблицею порогів, burden-и зі слотів `{type, filled}` у `{size, healed}`
з відкиданням порожніх, зняття `mechs[].dc`, видалення `dcStore`/`buf`/`dcr`/`projects`.

Міграції роблять те саме в базі; нормалізатор — страховка на боці клієнта для всього, що
приходить повз них, насамперед для відкатів.

### Журнал операцій: два логи злиті в один

Було дві панелі над **тим самим** серверним `pilot_audit_log`, з майже однаковою
розміткою й однаковим відкатом:

| | `ChangeLogPanel` | `GmAuditPanel` |
|---|---|---|
| RPC | `pilot_change_log` | `gm_pilot_resource_log` |
| Кому | власнику (і ГМ) | лише ГМ, згорнута золота панель |
| Додатково | — | автор змін, тип дії, ознака очищення журналу |
| Рядки | лише `action = 'update'` | ще й створення/видалення пілота |

Стало одне: RPC `pilot_operations_log` і компонент `OperationsLogPanel`. Гравець бачить
свої операції з валютами й відкочує їх, ГМ — те саме в чужих чарниках. Доступ вирішує
сервер (`p.user_id = auth.uid() or private.is_gm()`), а не сторінка; проп `own` впливає
лише на те, чи показувати нік автора — у своєму чарнику це завжди ти.

- **Виправлено поле ресурсу.** Обидві старі функції читали `state->>'dcStore'`, якого
  після переходу на PR (`20260918_pr_economy.sql`) не існує — колонка завжди була
  порожня. Тепер читається `state->>'pr'`, колонки звуться `pr_old`/`pr_new`.
- **Аудит більше не прихований від гравця.** Очистити його гравець як не міг, так і не
  може — журнал лежить на сервері, — але тепер бачить, включно з позначкою «журнал дій
  очищено». Це наслідок злиття, а не окреме рішення.
- **Міграція** `20260918g_merge_operations_log.sql` створює нову функцію і прибирає
  `pilot_change_log` та `gm_pilot_resource_log`.

### Downtime за новими правилами

**Передмісійний даунтайм прибраний із чарника** разом із `MISSION_DOWNTIME_DATA`: ці
кидки відбуваються за столом, і панель лише дублювала їх. Сам перелік дій (Scrounge and
Barter, Gather information, Get connected) з тригерами й таблицями наслідків лишився в
історії git — комміт перед видаленням.

Кнопка «НОВА МІСІЯ» жила в шапці тієї панелі й скидала не лише місійний заряд, а й
безкоштовну покупку мех-резерву. Тому вона переїхала у вкладку RESERVES магазину, поруч
із лічильником цієї покупки.

> **Статус інтерфейсу.** Панель **«ЧАС ПРОСТОЮ» схована з чарника цілком** — так само, як
> ангар: у `PilotProfilePage` закоментовані імпорт `DowntimePanel`, імпорт
> `WEEKLY_DOWNTIME_DATA` і блок рендера. Компонент, дані й усі екшени редюсера лишились
> на місці, стан пілотів не чіпався.
>
> Разом із карткою з чарника пішли дві речі, що жили всередині неї:
> - **трекер Get Creative** — нові проєкти почати ніяк; ті, що вже в роботі, лежать
>   у `state.creative` і повернуться разом із панеллю;
> - **опції Get rest** — автоматичне лікування стресу, burden-а й ХП. Ручні шляхи
>   лишились: сегменти лікування в самому burden-і та шкала стресу клікабельні.
>
> Тижневі заряди (`state.weeklyCharges`) більше ніде не показуються й не скидаються.

**Щотижневі дії** (1 заряд на тиждень) перебудовані з тір-гейтом через поле `minTier`:

| Дія | Тір | Що робить |
|---|---|---|
| Printer use | 1 | відсилає до панелі PR; сама витрата — там |
| Get Creative | 1 | лічильник на стільки секцій, скільки в резерву рангів |
| Get rest | 1 | три опції, див. нижче |
| Buy some time | 2 | секції на глобальні лічильники |
| Go diving | 2 | 2Д20 за зовнішніми таблицями gain/loss |
| Get focused | 2 | новий skill trigger або унікальна навичка |
| Power at a cost | 2 | екстраординарна перевага з високою ціною |

Заблокована дія показується в списку, але не розкривається — поруч стоїть «З ТІРУ 2».

**Get rest** — три опції, кожна витрачає тижневий заряд; кубики задані правилами точно,
тож кидає додаток:
- **Get a Damn Drink** (`REST_DRINK`) — знімає `floor(стрес/2) + 1Д4`, не нижче нуля.
- **Get aid** (`REST_AID`) — лікує 1Д4 сегментів обраного burden-а; заповнений зникає.
- **Get medical help** (`REST_MEDICAL`) — повертає максимальне ХП і знімає down and out.

**Get Creative** (`state.creative`) замінив систему проєктів. Один проєкт за раз, черги
немає. Щотижнева дія витрачається на початок (`START_CREATIVE`); далі перед кожною місією
кидається Д20 (`ROLL_CREATIVE`), який заповнює секції за результатом: **1–9 → 1 секція,
10–19 → 2, 20+ → 3**. Секцій у лічильнику стільки, скільки в резерву рангів. Заповнений
лічильник віддає резерв (`CLAIM_CREATIVE`) з `gamesLeft` = null — такий резерв не згорає
після місії. Секції можна поправити вручну, проєкт — скасувати.

Вибір обмежений **мех-резервами**: правила в цьому місці кажуть «оберіть бажаний мех
резерв», хоча в іншому абзаці та сама дія описана без обмеження категорії.

**Прибрана система проєктів.** `state.projects`, `projectDraft`, `ProjectsPanel`,
`PROJECT_STAGE_LABELS`, `nextProjectStatus` і дія «Прогрес проекту» видалені: у переліку
щотижневих дій нових правил їх немає, а їхнє місце зайняв трекер Get Creative. Старі
проєкти міграцією не конвертуються — прив'язати їх до резерву нема як; їхні назви
лишаються в `actionLog`.

#### Відкриті питання по downtime

- **Як саме отримується down and out.** Правила кажуть лише, що його знімає Get medical
  help і що стан «забирає наступну щотижневу downtime дію». Автоматичного списання заряду
  не закладено — інакше пілот не міг би використати саме Get medical help.
- **Чи прив'язаний кидок Get Creative до якогось заряду.** Щотижнева дія витрачається
  на початок проєкту; сам кидок перед місією нічим не обмежений, бо правила його ні з
  чим не пов'язують.

### Страховка від «німих кнопок»

Двічі траплялося, що блок `case`-ів зникав із редюсера разом із сусідньою секцією, яку
вирізали навмисно (обидва рази — комміт `1e092e5`, де прибирали систему проєктів).
Збірка при цьому не падає: компонент просто диспатчить у порожнечу, і кнопка мовчки не
працює. Так втратилися витрата PR на ремонт, лічильник PR, транзакції мани й покупка
покращень ангару — разом 12 екшенів.

`client/src/pilot/__actions.test.mjs` звіряє два переліки: що диспатчать компоненти і що
обробляє редюсер. Запуск — `node client/src/pilot/__actions.test.mjs`; ненульовий код
виходу, якщо знайдено «сироту». Окремо виводить обробники, яких не диспатчить жоден
компонент — це не помилка, лише до відома.

### Резерви й вкладки магазину

- **Каталог резервів** (`client/src/pilot/reserves.js`) перенесений з таблиці «Резерви»:
  **56 позицій** у трьох рангах і чотирьох категоріях (мех, тактичні, для пілота,
  ресурсні). Тексти лишені мовою оригіналу таблиці.

  | Ранг | Ціна | Позицій | Купівля |
  |---|---|---|---|
  | 1 | 10 PR | 33 |
  | 2 | 20 PR | 12 |
  | 3 | 40 PR | 11 |

- **Ранг визначає тільки ціну.** Обмежень на покупку немає: будь-який резерв будь-якої
  категорії купується, поки вистачає PR. Чи потрібна на це downtime-дія — питання правил
  за столом, і додаток за цим не стежить. Те саме для ремонту за PR.

  Раніше тут було правило «один мех-резерв на місію без дії» з лічильником
  `state.reserveFreeBuy` і двома кнопками («ПРИДБАТИ БЕЗ ДІЇ» / «З ДІЄЮ»). Прибране
  разом із полем — міграція `20260921_drop_reserve_free_buy.sql`.

- **Термін дії.** Куплений резерв згорає після місії (`gamesLeft` = 1). Резерв із переліку
  «Адаптованих запчастин» із цим покращенням ангару живе 2 гри (рівень 1) або 3 (рівень 2)
  — `reserveGamesLeft()`. Резерв, отриманий за Get Creative, має `gamesLeft` = null і не
  згорає взагалі. Дія `BURN_MISSION_RESERVES` зменшує лічильники й прибирає вичерпані.
- **Магазин розділений на три вкладки** (`ShopDrawer`), ширина шухляди 360 → 400:

  | Вкладка | Валюта | Вміст |
  |---|---|---|
  | PRINTER | PR | `PR_SERVICES` — додатковий ремонт |
  | RESERVES | PR | каталог резервів з фільтрами й тим, що на руках |
  | LUXURY | мана | `SHOP_DATA` |

  Вкладка PRINTER показує список, який раніше жив на панелі `PrPanel`; тепер панель
  лишає собі лічильник і кнопки переходу в магазин (`OPEN_SHOP_TAB`), щоб витратити PR
  можна було тільки в одному місці.

- **Luxury shop** містить рівно три позиції: повний ремонт / передрук меха за 500,
  Заряд Core Power за 250 і пачку `PR_PACK_SIZE` = 10 PR за 200 мани. Ціна пачки —
  той самий курс, за яким стара мана переводилась у PR (20 мани за 1 PR), тож купівля
  PR за ману й конверсія старих балансів не розходяться. Купівля біля капу нараховує
  лише те, що влазить, і пише про це в лог; на капі блокується, не списуючи ману.
  «3 Лімітні заряди» прибрані — у нових правилах їх немає.

- **Стан магазину спрощено:** `alloc`, `picked` і `qty` прибрані з `state.shop` разом із
  діями `SHOP_ALLOC_SHIFT`, `SET_SHOP_PICK`, `SHOP_QTY_SHIFT` і хелпером `AllocRows` —
  усе, що їх вимагало, переїхало на PR. Позиції мають прапорець `needsMech`: пачка PR
  іде пілоту, решта застосовується до обраного меха. Міграція `20260919b_shop_state.sql`.
- **Міграція** `20260918e_reserves.sql` додає `state.reserves` і `state.shop.tab`.

#### Розбіжності в таблиці резервів

- **`Reinforcements` записаний двічі** серед тактичних резервів рангу 3, з тим самим
  текстом. У каталог узятий один раз, тому 56 позицій, а не 57.
- **`Up-Armoring` позначений зірочкою**, решта п'ять «адаптованих запчастин» — ні, хоча
  всі шість перелічені в описі покращення ангару. Що означає зірочка — незрозуміло.
- **Ліміт зберігання описаний двічі по-різному:** покращення ангару «Місце на складі»
  каже про 3 невитрачені резерви, а Get Creative — про кількість, що дорівнює поточному
  тіру. Жоден ліміт поки не примусовий.
- **Яка саме downtime-дія витрачається на покупку — не сказано.** Printer use прив'язаний
  у тексті до списку додаткового ремонту й передруку меха, не до резервів, тоді як
  передмісійні downtime-дії описані саме як пошук резервів. Тому покупка «з дією» нічого
  не списує з жодного лічильника.
- **Чи діє ще обмеження за рангом.** Первісне формулювання називало «ранг 1 або ранг 2»,
  уточнене — «мех-резерв, максимум 1 штука», без згадки рангу. Реалізовано за уточненим:
  мех-резерв будь-якого рангу, включно з третім, береться без дії.
- **Екзотичне спорядження** сталого переліку не має — вкладка «ЗА МАНУ» містить лише те,
  що вціліло зі старого магазину, і підказку, що позицію й ціну називає ГМ.

### Бонди: ідеали, XP і сили

> **Статус інтерфейсу.** Від секції бонду в чарнику лишився **тільки лічильник XP**.
> Ідеали (плитки, поля вводу й кнопка `SCORE_IDEALS`), поле архетипу, власні сили та
> veteran/master прибрані з розмітки: гравцеві достатньо стресу, burden-ів і XP, а решта
> живе в COMP/CON. Стан `state.bond` і всі екшени редюсера **не чіпані** — гард
> `__actions.test.mjs` показує їх як 10 обробників без диспатчу
> (`SET_ARCHETYPE`, `SET_BOND_FIELD`, `SET_BOND_NEW_POWER`, `TOGGLE_IDEAL`, `SCORE_IDEALS`,
> `CONFIRM_BOND_CHOICE`, `CLAIM_BOND_POWER`, `RESET_DEFERRED_XP`, `ADD_POWER`,
> `REMOVE_POWER`). Повернути будь-що з цього — питання розмітки, не даних.
>
> Наслідок: XP тепер відмічається вручну кліком по шкалі, бо нараховувала його кнопка
> зарахування ідеалів. Сили теж ведуться поза додатком. Опис нижче описує механіку, яка
> лишилась у редюсері.

- **Ідеали.** Три major ideals: перший свій у кожного бонду (`bond.majorIdealFirst`,
  вводиться текстом), два інші однакові для всіх і лежать у `SHARED_MAJOR_IDEALS`.
  Плюс один minor ideal — особиста ціль на гру (`bond.minorIdeal`).
- **Відмітки за гру** (`bond.marked`) знімаються дією `SCORE_IDEALS`, яка нараховує
  по 1 XP за кожен виконаний ідеал. **Поки бонд не обрано, рахуються лише два спільні
  major ideals** — перший належить бонду, якого ще немає, а minor ideal обирається зі
  списку бонду.
- **Сила за 8 XP** (`CLAIM_BOND_POWER`) вимагає обраного бонду й назви сили. XP не
  обрізається на 8: надлишок переходить на наступну силу.
- **Відкладений бонд.** Доки бонд не зафіксовано, 8 XP не дають силу — лічильник
  скидається (`RESET_DEFERRED_XP`), і кожен скид рахується в `bond.deferredResets`.
- **Вибір бонду дає `BOND_POWERS_ON_CHOOSE` = 2 сили плюс по одній за кожен скид**,
  зроблений до вибору. Нараховується дією `CONFIRM_BOND_CHOICE` — вибір фіксується
  окремим прапорцем `bond.confirmed`, а не наявністю тексту в полі архетипу, щоб сили
  не нараховувались на кожне натискання клавіші й не нараховувались двічі. Нараховані,
  але ще не названі сили лежать у `bond.powersOwed`; `CLAIM_BOND_POWER` витрачає спершу
  їх і лише потім XP.
- **Veteran power** розблоковується від `BOND_POWERS_FOR_VETERAN` = 2 власних сил
  (разом із правом узяти одну силу з чужого бонду), **master power** — від
  `BOND_POWERS_FOR_MASTER` = 5. Поля заблоковані, доки поріг не досягнуто.
- **Міграція** `20260918d_bonds.sql` додає нові поля, зберігаючи наявні archetype, xp
  і powers.

#### Чому переліків бондів тут немає

Архетипи, тексти ідеалів і назви bond powers **свідомо не зберігаються в додатку** — вони
живуть у COMP/CON, а описи в правилах були довідкою для гравця. Тому архетип, перший major
ideal, minor ideal і назви сил вводяться текстом: додаток веде облік (які ідеали виконано,
скільки XP, скільки сил належить), а не каталог.

Виняток — `SHARED_MAJOR_IDEALS`: два спільні для всіх бондів major ideals зашиті, бо саме
вони визначають, що рахується, поки бонд ще не обрано. Це механіка, а не перелік.

### Стрес і burden-и

- **Стрес — це шкода, яку пілот бере на себе, а не ресурс, який витрачають.** Обидві дії
  з правил його *додають*: `TAKE_STRESS` з amount 1 (допомога іншому персонажу, +1
  ACCURACY до його кидка, наслідки діляться) і amount 2 (push — перекид, що робить кидок
  ризикованим; ризикований стає героїчним, героїчний перекинути не можна).
- **Ліміт стресу** живе в `state.stressMax` (базово 8) і редагується, бо окремі bond
  powers його змінюють.
- **Перевищення ліміту дає burden.** `TAKE_STRESS` понад ліміт підрізає стрес до ліміту
  й створює burden; у лог пишеться, що пілот не діє далі в сцені.
- **Burden-и більше не існують наперед.** Було: масив рівно з трьох слотів, кожному
  гравець сам обирав тип (`minor4`/`middle6`/`major8`). Стало: `state.burdens` — порожній
  список, куди burden-и додаються, а розмір визначається порядковим номером серед
  невилікуваних (`nextBurdenSize`): 4, 6, 8 сегментів. Вилікуваний звільняє місце, тож
  наступний знову починається з меншого.
- **Сегменти — це прогрес лікування.** Коли заповнені всі, burden зникає сам. Окремий
  чотирисегментний трек `heal` зі старої моделі прибраний — у правилах він відповідника
  не має.
- **Четвертий burden означає смерть, і додаток її не оформлює сам.** Ні `ADD_BURDEN`, ні
  переповнення стресом не створять четвертий: замість цього пишеться попередження в лог,
  а в UI горить банер. Рішення за гравцем і ГМ — правил клонування ще не реалізовано.
- **`state.downAndOut`** — стан, який знімає downtime-дія Get medical help і який забирає
  наступну щотижневу дію. Поки що перемикається вручну: правила кажуть, як його зняти,
  але не кажуть, як саме він отримується.
- **Виправлена колізія ідентифікаторів.** `id: Date.now()` давав однаковий id двом
  елементам, створеним в одну мілісекунду, і видалення одного прибирало обидва. Додано
  `newId()` (`logic.js`), який тримається часової мітки, але гарантує унікальність;
  застосовано до burden-ів, мехів і скіл-тригерів.
- **Міграція** `20260918c_stress_burdens.sql` переносить заповнені слоти в справжні
  burden-и (type → size, filled → healed) і відкидає порожні.

### Рівень ліцензії купується за ману

- **LL більше не виводиться з кількості ігор.** Раніше `computeLL(state.games)` рахував
  рівень за таблицею порогів `GAMES_TABLE`; і функція, і таблиця видалені. Тепер рівень
  зберігається в `state.ll` (новий пілот — LL2), а `state.games` лишається просто
  лічильником зіграних ігор і на рівень не впливає.
- **Підвищення — явна покупка, а не автоматичне спрацювання.** Накопичення мани нічого не
  запускає: у хедері з'являється кнопка «ПІДВИЩИТИ ЛЛ — N М», активна лише коли мани
  вистачає. Вона відкриває `LevelUpModal`, і саме підтвердження списує ману
  (`CONFIRM_LEVEL_UP`). Підвищення завжди на один рівень, надлишок мани лишається
  на балансі.
- **Смуга прогресу в хедері** показує накопичену ману відносно ціни наступного рівня,
  а не зіграні ігри.
- **Повний ремонт при підвищенні** застосовується до одного обраного меха. Пілот з одним
  мехом отримує його автоматично, з кількома — обирає; без мехів підвищення проходить
  без ремонту.
- **Платні перерозподіли:** повний перерозподіл усіх талантів коштує
  `REDISTRIBUTE_TALENTS_COST` = 50 мани, усіх ліцензій — `REDISTRIBUTE_LICENSES_COST` = 100.
  Обидва додаються до ціни підвищення: LL2→LL3 з двома допками — 1150 мани.
- **Чого додаток не робить:** таланти, ліцензії, мех-скіли й core bonuses не зберігаються
  в стані пілота — вони живуть у COMP/CON. Модалка фіксує витрату й перелічує отримані
  права, а сам перерозподіл гравець робить у себе. Обмеження «перші два рівні ліцензії
  поточного фрейма — лише через передрук» показується як попередження, перевірити його
  за даними неможливо.
- **Кнопка «+ ЗАПИСАТИ ГРУ» прибрана** разом із дією `INC_GAME`. Лічильник зіграних ігор
  веде сервер, коли ГМ закриває слот (`gm_resolve_slot`); кнопка лишалася з часів, коли
  з кількості ігор виводився рівень. Саме значення `state.games` і його показ у хедері
  лишаються.
- **Ручне виправлення ЛЛ** (`SAVE_LL_EDIT`) ману не списує — це інструмент звірки.
  Раніше воно виставляло кількість ігор на поріг рівня, тепер пише рівень напряму.
- **Імпорти** переносять рівень напряму в `state.ll` замість підбору кількості ігор:
  COMP/CON — з `d.level`, лог пригод — з `player_level`.
- **Міграція** `20260918b_mana_levels.sql` проставляє `ll` наявним пілотам за старою
  таблицею порогів, щоб нікого не відкинуло на LL2, і додає рівень у відповідь
  `board_list` — клієнт більше не може порахувати його з `games`.

#### Уточнення правил (відповіді на розбіжності в тексті)

- **Тіри:** Тір 1 — LL2–LL5, Тір 2 — LL6–LL10, Тір 3 — **LL11–LL12**. У вихідному тексті
  Тір 3 було підписано як LL10–LL12, що перекривалося з Тіром 2; правильний діапазон —
  LL11–LL12 (`llTier` у `logic.js`).
- **Get Creative** кидається **перед місією**, не в кінці гри. Текст містив обидва
  варіанти; чинний — передмісійний.
- **Два типи клона:** *флеш-клон* зберігає пам'ять оригінала, *звичайний* — ні. Саме тому
  в тексті правил трапляються два протилежні описи того, що клон втрачає: вони стосуються
  різних типів. Звичайний клон втрачає зв'язки, проекти, репутацію, унікальні вміння та
  скіл-тригери; флеш-клон зберігає пам'ять, вміння, репутацію та зв'язки і кидає Д20 по
  таблиці квірків.

- **Пороги мани виводяться формулою, а не задані списком** (`manaLevelCost` у `logic.js`).
  Перше підвищення коштує `MANA_BASE_COST` = 1000, кожне наступне дорожче попереднього на
  крок свого тіру, і крок береться за тіром рівня, **з якого** іде підвищення — тому перехід
  між тірами дорожчає ще за поточним тіром, а не за новим. Кроки: Тір 1 — 100, Тір 2 — 200,
  Тір 3 — 500.

  | Перехід | Тір, з якого йде | Крок | Ціна | Накопичено від LL2 |
  |---|---|---|---|---|
  | LL2→LL3 | 1 | — | 1000 | 1000 |
  | LL3→LL4 | 1 | +100 | 1100 | 2100 |
  | LL4→LL5 | 1 | +100 | 1200 | 3300 |
  | LL5→LL6 | 1 | +100 | 1300 | 4600 |
  | LL6→LL7 | 2 | +200 | 1500 | 6100 |
  | LL7→LL8 | 2 | +200 | 1700 | 7800 |
  | LL8→LL9 | 2 | +200 | 1900 | 9700 |
  | LL9→LL10 | 2 | +200 | 2100 | 11 800 |
  | LL10→LL11 | 2 | +200 | 2300 | 14 100 |
  | LL11→LL12 | 3 | +500 | 2800 | 16 900 |

  Повний шлях LL2 → LL12 коштує 16 900 мани: Тір 1 — 4600, Тір 2 — 9500, Тір 3 — 2800.

  Конвертованих балансів ця зміна не зачепила: на момент конверсії жоден пілот з LL5 і вище
  не мав часткового прогресу (усі стояли рівно на порозі), тож їхня мана прийшла тільки зі
  старого залишку, який від формули ціни не залежить.

#### Відкриті питання (правилами не задані)

- Чи однакові для обох типів клона борг 3000 мани, «−3 рівні, не нижче LL2» і пласка
  ціна 1000 мани за рівень під час добору.
- Get Creative: скільки секцій дає кидок (успіх 1 / крит 2 **чи** 1–9 → 1, 10–19 → 2,
  20+ → 3) і яке обмеження діє — один проект одночасно **чи** сховище резервів за тіром.
- **Покращення ангару цілком** — панель схована з чарника до того, як будуть задані нові
  правила. Компонент `HangarPanel`, `HangarConfirmModal`, `HANGAR_DATA` і чотири екшени
  редюсера лишились на місці; у `PilotProfilePage` закоментовані тільки імпорт і рядок
  рендера. Стан пілотів не чіпався, тож уже куплені покращення вціліли.

  Наслідок, який треба врахувати, коли писатимуться нові правила: **кап PR 200 дає лише
  «Ресурсний буфер»** (`derive.js`, `prCap`). Поки панель схована, купити його неможливо,
  тож кап 200 мають тільки ті, хто встиг купити раніше — на момент приховування це 1 пілот
  із 35. Решта сидить на капі 100.

  Ціна самого буфера так і лишилась незаданою: решта покращень Тіру 2 має ціну в мані + PR,
  у буфера її не вказано; `prices` лишений старий (1000).
- Доля позицій **«3 Лімітні заряди»** і **«Заряд Core Power»** — ні в мані, ні в PR.
- **Скид Overcharge** за ресурс — був 5 DC, серед чотирьох PR-опцій відсутній.

- **Pilot-profile sync tools** (`client/src/pilot/components/SyncTools.jsx`, rendered at the top
  of the profile page): two buttons for updating an *already open* pilot from an external file,
  as opposed to the pilot-select screen's import (which creates/merges a whole new pilot).
  - **«ОНОВИТИ РІВЕНЬ/МАНУ З CSV»** — parses an Adventure-League-style character log CSV export
    (`client/src/pilot/csvImport.js`, `parseAdventureLeagueCsv`/`summarizeAdventureLeagueLog`).
    The export stacks three tables in one file with no section markers: character-info, a
    log-entry table (`CharacterLogEntry`/`PurchaseLogEntry`/`TradeLogEntry` rows sharing one
    17-column schema — `type,adventure_title,session_num,date_played,session_length_hours,
    player_level,xp_gained,gp_gained,downtime_gained,renown_gained,num_secret_missions,
    location_played,dm_name,dm_dci_number,notes,date_dmed,campaign_id`), and a `MAGIC ITEM` table
    interleaved via its own row-type tag (different 7-column schema, skipped entirely). Only
    `gp_gained` (→ mana) and `player_level` (→ games/LL, same `GAMES_TABLE` snap as COMP/CON
    import) are used, per explicit request — everything else in the log (xp/downtime/renown) is
    ignored. `IMPORT_ADVENTURE_LOG` **replaces** `mana.balance` with the summed total (not an
    incremental add — the CSV is the full ledger each time) and `mana.history` with the last 4
    non-zero entries; `games` is only touched if `player_level` was non-empty on at least one row
    (many real exports leave it blank — level tracked via freeform notes instead — in which case
    games/LL is left alone rather than guessed).
  - **«ОНОВИТИ МЕХА З COMP/CON JSON»** — same COMP/CON "Save Pilot" parser as the pilot-select
    import, but applies `mergeMechsByName` directly to the currently-open pilot's `mechs`
    (`MERGE_COMPCON_MECHS` action) without any name-matching — you're already looking at the
    target pilot. Everything else on the pilot is untouched, same as the pilot-select merge path.
- **Publicity/visibility mask removed entirely** — no `state.publicity`, no `PublicityPanel`,
  no `TOGGLE_MASK`/`APPLY_PRESET` actions.
- **Downtime split into two independently-gated tabs**, each with its own 1-charge pool:
  - **«ДАУНТАЙМ»** (`state.downtimeCharges`, 1/mission): Збір інформації, Знайти контакт, Бартер
    (`MISSION_DOWNTIME_DATA` in `client/src/pilot/constants.js`).
  - **«ЧАС ПРОСТОЮ»** (`state.weeklyCharges`, new field, 1/week): Випустити пару, Сфокусуватись,
    Ціна за силу, Прогрес проекту (`WEEKLY_DOWNTIME_DATA`). `USE_FOCUS` now spends a weekly charge
    instead of a mission charge.
- **Projects gained a `stage` field (1–3)**, defaulting to 1 on creation: 1 = "Одноразовий
  резерв", 2 = "Резерв раз на гру", 3 = "Повноцінний предмет" (`PROJECT_STAGE_LABELS`). Stage is
  shown as pips + label on the project card, but only advances via the new `ADVANCE_PROJECT`
  action (in the "Прогрес проекту" weekly downtime entry) — it consumes one weekly charge and caps
  at stage 3.
- **COMP/CON pilot import** (`client/src/pilot/compconImport.js`, wired into the "ІМПОРТУВАТИ З
  COMP/CON" button on the pilot-select screen): parses a "Save Pilot" JSON export
  (`EXPORT_TYPE: "Save Pilot"`) from the Lancer TTRPG companion app COMP/CON. Only fields with a
  direct equivalent transfer: name/callsign/background, pilot level → games/LL (snapped to
  `GAMES_TABLE`), pilot HP, bond (archetype/xp/powers/stress), and mechs (name, core power, and
  any `tg_limited`-tagged weapons/systems scanned out of the active loadout into the trackable
  Limited list — non-Limited equipment is intentionally *not* imported anywhere). Mech HP/repair
  cap are **not** just `frameData.stats.hp`/`repcap` — those are only the frame's base values;
  COMP/CON's export doesn't persist the already-summed runtime totals, so the importer applies the
  Lancer core-rule HASE formula itself: `HP = frameHP + pilotGrit + 2×Hull`,
  `RepairCap = frameRepcap + floor(Hull÷2)` (`d.mechSkills[0]` is Hull, `d.stats.max.grit` is
  pilot Grit — confirmed against lancer.wiki.gg). COMP/CON's ~24 fixed named pilot skills (0–6
  rank each) are mapped one-for-one into this app's homebrew Skill Triggers, rank clamped directly
  into our 1–3 level scale (rank 1→1, 2→2, 3+→3 — **not** halved, per user feedback that halving
  under-represented the trained rank), stopping once the import would exceed this pilot's own
  `skillCapMax` so the sheet stays internally consistent. Talents, licenses, history/notes/quirks, and everything
  else homebrew-specific — mana, DC store, hangar upgrades, projects, contacts, publicity — have
  no COMP/CON source (or are intentionally skipped) and are left at their normal empty default,
  including `narrative` (deliberately not auto-populated from the import). COMP/CON doesn't
  persist current damage/HP-loss in the export (frame stats are recomputed client-side at
  runtime), so imported mechs/pilot HP always come in at full health regardless of the source
  character's actual battle state.
  - **Same-callsign merge**: if an imported pilot's `callsign` matches an already-existing pilot
    on the account (case-insensitive), the import doesn't create a duplicate — it only merges the
    imported mech(s) into that pilot's `mechs` array (`mergeMechsByName` in `compconImport.js`,
    matched by mech name, replacing an existing mech's stats in place or appending a new one) and
    logs the merge. Everything else on the existing pilot (mana, bond, skill triggers, name, etc.)
    is left untouched — this exists because some campaigns keep multiple mech "slots" per
    character by saving separate COMP/CON pilots per build (same callsign held constant, `name`
    varied per mech — simpler to manage from Foundry), so re-importing another such file is meant
    to just add that mech, not overwrite the character's live campaign data. Matching moved from
    `name` to `callsign` for this reason (was name-based initially, flipped per user feedback).
- **Migrated off the local Express/JSON backend onto Supabase** (project `ferum-vox-pilot-tracker`,
  `dmqkxxedabawnhznzlmx`, org `IVAN-SILENT`, region `eu-north-1`) — the React client now talks
  directly to Supabase Postgres + Auth via `@supabase/supabase-js` (`client/src/supabaseClient.js`),
  with Row Level Security (`auth.uid() = user_id`) enforcing per-account data isolation instead of
  the old Express ownership checks. `server/` is gone entirely.
  - Two tables: `public.profiles` (id/nick, 1:1 with `auth.users`) and `public.pilots`
    (id/user_id/name/callsign/background/state jsonb/timestamps), both RLS-enabled. A
    `handle_new_user` trigger on `auth.users` populates `profiles` from signup metadata; a
    `set_updated_at` trigger keeps `pilots.updated_at` fresh.
  - Nickname-only login is preserved by deriving a synthetic, never-emailed address
    (`{nick}@ferumvox-pilots.app`) and creating accounts **pre-confirmed** via a small Edge
    Function (`supabase/functions/register`, uses the service-role key server-side only) instead
    of the normal `signUp()` flow — this avoids needing "Confirm email" enabled (which would
    require clicking a link sent to an address that doesn't really exist) or exposing the
    service-role key to the browser. `client/src/api.js` calls this function via
    `supabase.functions.invoke('register', ...)`; login itself is a normal
    `supabase.auth.signInWithPassword()`.
  - `client/src/pilot/pilotDefaults.js` is the browser-side port of the old
    `server/pilotDefaults.js` factory (used by `api.createPilot`).
  - Frontend is meant to be statically hosted (Vercel — see `client/vercel.json` for the SPA
    rewrite); `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` must be set wherever it's deployed
    (`client/.env.example`).

Source: `Профіль пілота.dc.html` (1603 lines) + `support.js` runtime, from the claude.ai/design
project `Профіль персонажа COMP/CON`. This is the implementation source of truth for
`client/src/pilot/*`. Deliberate deviations from this raw spec are documented in the plan
(`docs/plan-deviations.md` / see project history) — new pilots get empty defaults instead of the
demo seed data below, three feature groups (Downtime, Contacts, Publicity) get real UI since they
existed in logic only, and a couple of dead-code paths are cleaned up or wired.

## 0. Runtime/execution model (from `support_source.js`)

- **`DCLogic`** (aliased `StreamableLogic`) is the base class every `Component` extends. It provides:
  - `this.props` (from `data-props` on the script tag / parent-supplied props).
  - `this.state` — a plain object, initialized by the `state = {...}` class-field.
  - `setState(update, cb)` — accepts either a partial object or an updater function `(prevState) => partial`; **shallow-merges** the patch into `this.state` (one level deep only — nested objects must be manually spread, which the code does everywhere, e.g. `{ ...s.mana, balance: ... }`). Triggers a re-render via a pub/sub on the host wrapper.
  - `forceUpdate()`.
  - Lifecycle no-ops: `componentDidMount`, `componentDidUpdate(prevProps)`, `componentWillUnmount`.
  - `renderVals()` — must return a flat object; this object is merged **over** `props` and becomes the `vals` the HTML template's `{{ }}` expressions resolve against. This is the *only* bridge between logic and template — nothing in `state` is visible to the template unless `renderVals()` re-exposes it.
- **`{{ expr }}` bindings**: a tiny expression resolver (`resolve`/`resolvePath` in `expr.ts`). Supports: parenthesized wraps, top-level `==`/`===`/`!=`/`!==`, leading `!`, literals `true/false/null/undefined`, numbers, quoted strings, and dotted/bracketed path lookups (`a.b`, `a[0]`, `a[expr]`) against the `vals` object. No arithmetic, no ternaries, no function calls — all such logic must live in `renderVals()`/action methods, pre-computed into plain values or style strings.
- **`sc-for list="{{ path }}" as="item"`**: iterates an array from `vals`; each item is exposed as `item` (plus `$index`) merged into a child scope. `hint-placeholder-count` is only a skeleton-loading hint (streaming UI), irrelevant to steady-state rendering — **the actual array length drives the real count**, which is important because at least one place (mech reactor-stress segments) has a hint count that doesn't match the true rendered count (see §5).
- **`sc-if value="{{ path }}"`**: renders children iff the resolved value is truthy. `hint-placeholder-val` is likewise only a streaming hint.
- **No built-in persistence**: `support_source.js` has zero references to `localStorage`/`sessionStorage`/any storage API. All state lives only in the React component instance's memory; a page reload fully resets to the `state = {...}` defaults. Any persistence in a reimplementation must be added from scratch.
- Component instantiation reads three declared props via `data-props` JSON: `initialResourceMode` (enum `full|hp`, default `full`), `showNarrative` (boolean, default `true`), `defaultPublicityMask` (enum `reveal|standard|minimal`, default `standard`).

---

## 1. Full state shape (`state = {...}`, plus class fields used as constants)

```
name: string = "РІМ-9"
games: number = 14                          // total games played
status: 'active' | 'archive' = 'active'
resourceMode: 'full' | 'hp' = this.props.initialResourceMode || 'full'

hangar: {
  owned: { [upgradeKey: string]: number }   // level count per upgrade, default {}
  confirm: string | null = null             // upgrade key pending purchase-confirm modal
  error: string = ''
  open: boolean = false                     // accordion expanded state
}

dcStore: number = 0                          // "Особистий склад" banked DC (Deployment Credits)

shop: {
  open: boolean = false                      // side-drawer shop panel open
  item: string | null = null                 // key of item in modal
  mechId: number | null = null
  alloc: { [limitedIdx: number]: number } = {}
  picked: number | null = null               // chosen limited-system index (refillone)
  qty: number (added ad hoc, default 1)      // purchase quantity (repair1 only)
  error: string = ''
}

dcr: {                                       // "Ремонт за DC" modal
  open: boolean = false
  mechId: number | null = null
  total: string = ''                         // DC received this mission (raw input string)
  kits: number = 0
  packs: number = 0
  alloc: { [limitedIdx: number]: number } = {}
  allRefill: boolean = false
  error: string = ''
}

buf: {                                       // "Особистий склад" DC→resource exchange modal
  item: string | null = null
  mechId: number | null = null
  alloc: { [limitedIdx: number]: number } = {}
  error: string = ''
}

mana: {
  balance: number = 320
  txOpen: boolean = false
  txType: 'deposit' | 'withdraw' | 'transfer' = 'deposit'
  amount: string = ''
  comment: string = ''
  target: string = ''
  error: string = ''
  history: Array<{ label: string }> = [
    { label: '+150 · Оплата за контракт (гра 12)' },
    { label: '−40 · Ремонт спорядження (гра 13)' }
  ]
}

stress: number = 3                            // filled segments, 0-8

burdens: Array<{ type: 'minor4'|'middle6'|'major8', filled: number, heal: number, name: string }> = [
  { type: 'minor4',  filled: 2, heal: 0, name: '' },
  { type: 'middle6', filled: 0, heal: 0, name: '' },
  { type: 'major8',  filled: 0, heal: 0, name: '' }
]

bond: {
  archetype: string = 'Емісар'
  xp: number = 5                              // 0-8
  powers: string[] = ['Переадресація', 'Незламність']
  newPower: string = ''
}

hp: { current: number = 6, max: number = 8 }  // pilot HP, used only in "hp" resourceMode

downtime: {
  open: string | null = null                  // key of expanded accordion action
  modifiers: { [actionKey: string]: number } = {}  // chosen roll modifier, one of 0/2/4/6
  rolls: { [actionKey: string]: { die: number, total: number, tier: string } } = {}
}

downtimeCharges: { max: number = 1, used: number = 0 }

skillTriggers: Array<{ id: number, name: string, desc: string, level: 1|2|3 }> = [
  { id: 1, name: 'Get some vheare quicly', desc: '+2 до влучання по оглушених цілях', level: 1 },
  { id: 2, name: 'Читання поля', desc: '+4 на перевірку тактичної обстановки', level: 2 }
]
skillCapBonus: number = 0                     // extra cap granted by "Сфокусуватись"
skillDraft: { name: string = '', desc: string = '', level: 1|2|3 = 1 }

contacts: Array<{ name, circle, help, debt, relationship: 'bad'|'neutral'|'good' }> = [
  { name: "Веста Кроу", circle: 'Синдикат «Ажур»', help: 'Контрабанда, підроблені документи', debt: 'Винен 200 мани', relationship: 'good' },
  { name: 'Штаб-лейтенант Орн', circle: 'Флот Гарнізону', help: 'Дозволи на політ, розвіддані', debt: 'Без боргу', relationship: 'neutral' }
]
contactDraft: { name: '', circle: '', help: '', debt: '' }

projects: Array<{ name, note, status: 'активний'|'призупинено'|'завершено' }> = [
  { name: 'Реконструкція доку 7', note: 'Потрібні деталі реактора', status: 'активний' }
]
projectDraft: { name: '', note: '' }

publicity: object = this.defaultMask(this.props.defaultPublicityMask || 'standard')
                                              // { mana, stress, dp, contacts, mechs, narrative: boolean }

mechs: Array<Mech> = [
  { id: 1, name: 'ЕВЕРЕСТ', hpCurrent: 9, hpMax: 12, repairCurrent: 3, repairMax: 5,
    structureFilled: 0, reactorFilled: 1, corePower: true, overcharge: 0,
    limited: [
      { name: 'Важка гармата', current: 2, max: 2, destroyed: false },
      { name: 'Димова завіса', current: 1, max: 1, destroyed: false }
    ]
  }
]
mechDraft: { name: '', hpMax: '', repairMax: '' }

llEdit: { open: boolean = false, ll: string = '', games: string = '' }  // note: `games` field is DEAD — see §5
mechEditId: number | null = null
mechEdit: { hpMax: string = '', repairMax: string = '' }
limitedDraft: { [mechId: number]: { name: string, max: string } } = {}

actionLog: Array<{ ts: string, msg: string }> = []   // capped at 300, newest first

narrative: string = "Народжений у нижніх кварталах орбітальної станції, навчався пілотуванню в приватній гвардії, доки контракт не привів його до вільних систем."
```

**Class-field constants** (not in `state`, fixed):
- `CHARGES_MAX = 1` — shared single-use pool for both "roll downtime action" and "Сфокусуватись" (Focus).
- `OC_STEPS = ['+1', '+1D3', '+1D6', '+1D6+4']` — 4-stage Overcharge ladder per mech.
- `BLUE='#5fb3ff'`, `EMPTY_SEG='#0c1826'`, `SEG_BORDER='#2a4a70'`, `RED='#e2755f'` — module-level color constants used throughout style-string generation.

---

## 2. Derived/computed values (`renderVals()`)

### License Level (LL) / progression
- `gamesTable()` = `[0,3,6,9,12,16,20,24,29,34,39,44]` — cumulative games-played thresholds.
- `computeLL(games)`: start `ll = 2`; for each index `i` in the table where `games >= table[i]`, set `ll = i + 2`; final `ll = min(ll, 12)`. (I.e., LL = 2 + number of thresholds passed, capped at 12; table has 12 entries so it can compute up to 13 internally before the cap clamps it to 12.)
- `llTier(ll)`: `'0'` if `ll<=1`; `'1'` if `ll<=5`; `'2'` if `ll<=8`; else `'3'`. Shown as "ТІР {{ tierLabel }}".
- `prevGames = table[ll-2] || 0`; `nextGames = ll<12 ? table[ll-1] : null`.
- LL progress bar `pct = nextGames ? min(100, round((games-prevGames)/(nextGames-prevGames)*100)) : 100` → rendered as `llBarStyle` width.
- `llNextLabel` = `"(nextGames-games) ігор до ЛЛ (ll+1)"`, or `"МАКСИМАЛЬНИЙ ЛЛ"` if at cap.
- Status badge color/label: green-ish (`#123423`/`#6fd99a`/`#2f6b46`) if `active`, red-ish (`#331b1b`/`#e2755f`/`#5a2f2f`) if `archive`.

### Downtime charges
- `chargesMax = CHARGES_MAX (1)`, `chargesUsed = min(max, downtimeCharges.used)`, `chargesRemaining = max-used`.
- `chargesView`: array of length `chargesMax`, each `{fill, stroke}` = green (`#3ddc84`) if index < remaining, else transparent/gray.

### Skill Triggers
- `skillCapMax()` = `6 + max(0, ll-2) + skillCapBonus`.
- `skillCapUsed()` = sum of all `skillTriggers[].level`.
- `skillTriggersView`: each trigger gets `bonus = level*2` (displayed as "+{{bonus}}"), plus wired `incLevel`/`decLevel`/`onRemove` handlers and a shared button style.
- `skillDraftLevelOptions`: buttons for levels 1/2/3 labeled `+2/+4/+6`, highlighted if `skillDraft.level` matches.
- `focusUsedUp = chargesUsed >= chargesMax`; `focusButtonStyle` dims when used up.

### Downtime actions accordion (`downtimeActions`)
For each entry in `downtimeData()` (see §4 for full content), computes:
- `open` (is this key expanded), `arrow` ('−'/'+').
- `curMod` = chosen modifier (0/2/4/6, default 0).
- `roll` = stored result if any; `tierColor` green `#6fd99a` (20+), yellow `#e2c25f` (10–19), red `#e2755f` (1–9), else neutral `#c3d3e6`.
- `modOptions`: buttons for `[0,2,4,6]`, highlighted if selected.
- `rollBtnStyle`: active style if `chargesRemaining>0`, else disabled-looking.
- `result` string: `"Д20(die) +mod = total → tier"`.

### Mana panel
- `manaHistory` = `mana.history` (already capped to 4 entries by the mutators).
- `txTypeOptions`: 3 buttons (deposit/withdraw/transfer) highlighted by `mana.txType`.
- `showTargetField` = `txType === 'transfer'`.

### Hangar upgrades (`hangarUpgrades`)
For each item in `hangarData()`:
- `owned` = `hangar.owned[key] || 0`; `max` = `prices.length`; `done = owned>=max`; `buyable = !done`.
- `buyLabel` = `"ПРИДБАТИ" + (max>1 ? " РІВ. "+(owned+1) : "") + " — " + prices[min(owned,max-1)] + " М"`.
- `pips`: array of length `max`, green-filled up to `owned`.
- `levels`: for multi-level items, per-level `{label: "РІВЕНЬ N" (+ "· ПРИДБАНО" if owned), price, text, accent/labelColor}` (green if purchased, else default blue-gray).

### DC-repair modal (dcr)
- `dcrMechOptions`, `dcrShowAlloc = packs>0 && mechId set`.
- `dcrAllocLeft = 3*packs - sum(alloc)`.
- `dcrAllocRows`: only computed if a mech is selected and `packs>0`; one row per `limited` item with `current/max/count` and inc/dec handlers.
- `dcrSpent = dcrSpentOf(dcr)` (see §3 formula), `dcrLeft = max(0, total - spent)`.
- `dcrLeftNote`: `" → у буфер (Особистий склад)"` if `hangar.owned.buffer>=1`, else `" (згорить без Ресурсного буфера)"`.

### Shop modal / drawer
- `shopItems` = `shopData()` with `buy` handlers wired.
- `shopMechOptions`, `shopNeedAlloc = item==='charges3' && mechId set`, `shopAllocLeft = 3 - sum(alloc)`.
- `shopNeedPick = item==='refillone' && mechId set`; `shopPickRows` lists mech's limited systems to choose from.
- `shopNeedQty = item==='repair1'`; `shopQty` clamped via `shopQtyShift`.
- `shopTotalPrice = shopPrice(shop)`; `shopAfter = balance - shopTotalPrice`.

### DC store (Особистий склад)
- `dcStoreVisible = hangar.owned.buffer>=1`.
- `dcStoreCap = hangar.owned.buffer>=2 ? 10 : 5`.
- `dcStorePips`: array of length `dcStoreCap`, filled up to `dcStore` count (blue fill).
- `dcStoreLvl2Note`: `" · 10 DC — повний ремонт"` if buffer level ≥2, else empty.
- `bufServices` = `bufServices()` (see §4) with `buy` handlers and a style dimmed (opacity 0.55) if `dcStore < svc.cost`.

### Buffer exchange modal (buf)
- `bufMechOptions`, `bufNeedAlloc = item==='charges' && mechId set`, `bufAllocLeft = 3 - sum(alloc)`.
- `bufAfter = dcStore - selectedService.cost`.

### Hangar-purchase confirmation modal
- `hangarConfirmText` = `"Придбати «title»" + (multi-level? " — рівень N" : "") + " за PRICE мани?"`.
- `hangarConfirmAfter` = `balance - price` for the pending item at its next level.

### Stress / Burdens / Bond
- `stressSegs = buildSegs(stress, 8, 26, setStress)` — 8 toggle segments, 26px, blue when filled.
- `burdensView`: per burden — `typeOptions` (see §5, effectively **always empty array** — dead/unused), `typeLabel` (Ukrainian label per type), `segs = buildSegs(filled, burdenSize(type), 20, ...)` (segment count = 4/6/8 depending on type), `healSegs = buildSegs(heal, 4, 16, ...)` (always exactly 4 heal-progress segments regardless of burden size).
- `bondXpSegs = buildSegs(xp, 8, 22, setBondXp)`; `bondPending = xp>=8` (shows a badge only — **no automatic consequence**, XP is never spent/reset by any method).
- `bondPowers`: mapped with remove handlers.

### HP mode
- `hpBarStyle` width % = `round(current/max*100)`.

### Contacts / Projects / Publicity (computed but **not wired into any template markup** — see §5)
- `contactsView`: per contact, `relLabel`/color from `contactRelMap` (`good`=green, `neutral`=yellow, `bad`=red), `cycleRelationship`, `onRemove`.
- `projectsView`: per project, `statusStyle` from `projStatusMap` (`активний`=green, `призупинено`=yellow, `завершено`=blue-gray), `cycleStatus`, `onRemove`.
- `maskEntries`: one entry per publicity key (`mana/stress/dp/contacts/mechs/narrative`), label = Ukrainian name + `" · ВИДИМО"`/`" · СХОВАНО"`, toggle handler, green style if visible else muted.

### Mechs (`mechsView`)
Per mech, in addition to raw fields:
- `hpBtnStyle` (shared 34px button style).
- `coreLabel`/`coreStyle`: "ЗАРЯДЖЕНО" (green) if `corePower` true, else "ВИТРАЧЕНО" (red).
- `ocLabel = OC_STEPS[min(overcharge,3)]`; `ocPrevStyle`/`ocNextStyle` dim at the ends; `ocDots`: 4 dots, filled blue cumulatively up to current overcharge index (`i <= overcharge`).
- `structureSegs = buildSegs(structureFilled, 4, 20, ...)` — always **4** segments (template hint says `hint-placeholder-count="4"`, matches).
- `reactorSegs = buildSegs(reactorFilled, 4, 18, ...)` — always **4** segments, but the template's `sc-for` on `mech.reactorSegs` uses `hint-placeholder-count="8"` (mismatched hint; real rendered count is still 4 — see §5).
- `editing = mechEditId===m.id`; `editLabel` "ЗАКРИТИ"/"РЕДАГУВАТИ"; `editHp`/`editRepair` populated only while editing that mech.
- `limitedView`: per limited item — `rowStyle`, `nameStyle` (strikethrough+gray if destroyed), `destroyLabel`/`destroyStyle` ("ЗНИЩЕНО" red / "ЦІЛЕ" neутral), inc/dec/toggleDestroyed/onRemove.
- `limitedDraftName`/`limitedDraftMax` sourced from `state.limitedDraft[mechId]`.

### Misc
- `logEntries = actionLog`, `logCount`, `logEmpty = actionLog.length===0`.
- `showNarrative = props.showNarrative !== false`.

---

## 3. Every action method — exact logic/formulas

### Header / status / LL
- `toggleStatus()`: flips `status` between `active`/`archive`; logs.
- `incGame()`: `games += 1`; logs old→new.
- `toggleLlEdit()`: opens/closes the LL-edit panel; on open, prefills `llEdit.ll = String(computeLL(games))`.
- `saveLlEdit()`: `ll = clamp(parseInt(llEdit.ll) || 2, 2, 12)`; sets `games = gamesTable()[ll-2]` (snaps games count to the exact threshold for that LL); logs; closes panel. **`llEdit.games` is never read** — dead field (see §5).

### Segment toggle helper (shared by stress/burdens/bond XP/mech structure/reactor)
- `toggleFilled(cur, idx)`: returns `idx` if `cur === idx+1` (i.e., clicking the currently-topmost filled segment un-fills it), else returns `idx+1` (fills up through the clicked segment). This is the classic "click-to-set-level, click-top-again-to-reduce-by-one" segment-track behavior.
- `buildSegs(filled, count, size, onClick)`: builds `count` segment descriptors with `segStyle` (2px border, `size`×`size` px, blue fill if `i<filled` else empty) and per-segment `onClick(i)`.

### DC repair modal (`dcr`)
- `dcrSpentOf(d) = (d.kits||0) + 2*(d.packs||0) + (d.allRefill ? 2 : 0)` — **kits cost 1 DC each, packs cost 2 DC each (each pack = 3 limited charges), "refill all" costs a flat 2 DC**.
- `dcrShift(field, dir)`: `next = max(0, current[field]+dir)`. Per-unit cost: `kits`→1, `packs`→2. If increasing (`dir>0`) and `dcrSpentOf+cost > total`, the change is **rejected** (no state change). Additionally for `kits` increases, rejects if `mech.repairCurrent + next > mech.repairMax` (can't buy more repair kits than the mech's cap allows). Decreasing `packs` resets `alloc = {}` (charge allocation cleared when packs reduced).
- `dcrAllocShift(idx, dir)`: per-limited-item charge allocation. Increasing is rejected if total allocated ≥ `3*packs` or if `mech.limited[idx].current + cur >= mech.limited[idx].max`. Floors at 0.
- `dcrToggleAllRefill()`: turning on is rejected (error set) if `dcrSpentOf(d)+2 > total`.
- `dcrConfirm()`: validation chain — `total>0` else error "Вкажіть кількість DC."; `spent>0` else "Оберіть хоча б один обмін."; mech must be selected else "Оберіть меха."; `spent<=total` else "Витрачено більше, ніж є DC." On success:
  - `leftover = total - spent`.
  - Mech gets: `repairCurrent = min(repairMax, repairCurrent+kits)`; `limited[i].current = min(max, current + alloc[i]||0)`; if `allRefill`, **additionally** `+1` to every limited item's current (capped).
  - `dcStore`: if `hangar.owned.buffer>=1`, `dcStore = min(cap, dcStore + leftover)` where `cap = owned.buffer>=2 ? 10 : 5`; otherwise leftover is discarded (no buffer = no banking).
  - Logs a detailed message including per-part breakdown and leftover fate.
  - Resets the whole `dcr` sub-state to defaults.

### Buffer exchange (`buf` — spends banked DC from `dcStore`)
- `bufServices()` (see §4 for full pricing) — the 4th item (`fullrepair`, 10 DC) only appears if `hangar.owned.buffer>=2`.
- `bufAllocShift(idx, dir)`: total allocated capped at 3, per-item capped at that limited system's max.
- `bufConfirm()`: validates mech selected, `svc.cost <= dcStore`, and for `charges` requires `sum(alloc)>0`. Effects by key:
  - `kit`: `repairCurrent = min(repairMax, repairCurrent+1)`.
  - `charges`: distribute `alloc` into `limited[].current` (capped per item).
  - `ocreset`: `overcharge = 0`.
  - `fullrepair`: full mech reset (hp/repair to max, structure/reactor/overcharge to 0, corePower=true, all limited restored to max & undestroyed).
  - `dcStore -= svc.cost`. Logs message with DC before→after.

### Shop (mana-priced purchases; `shop`)
- `shopData()` — see §4 for prices.
- `shopQtyShift(dir)`: `cap = mech ? max(1, repairMax-repairCurrent) : 10`; `qty = clamp(qty+dir, 1, cap)`.
- `shopPrice(sh)`: for `repair1`, `price * qty`; all other items, flat `price`.
- `shopAllocShift(idx, dir)`: same 3-charge total cap / per-item max cap pattern as buf/dcr.
- `shopConfirm()`: validations —
  - mech selected;
  - for `repair1`: `free = repairMax-repairCurrent` must be `>0` ("Рем. комплекти вже на капі.") and `qty<=free` ("Більше капу: вільно лише N.");
  - `totalPrice <= mana.balance` else "Недостатньо мани.";
  - for `charges3`: `sum(alloc)>0` else "Розподіліть хоча б один заряд.";
  - for `refillone`: `picked !== null` else "Оберіть зброю або систему."
  - Effects by key: `repair1`→`repairCurrent=min(repairMax, repairCurrent+qty)`; `charges3`→distribute alloc; `repairfull`→`repairCurrent=repairMax`; `refillone`→set `limited[picked].current=max`; `core`→`corePower=true`; `fullrepair`→full mech reset (same shape as buf's fullrepair).
  - `mana.balance -= totalPrice`; history entry pushed (kept to 4 most recent via `.slice(0,4)` after unshift... actually built as `[newEntry, ...history].slice(0,4)`, i.e. **only the 4 most recent transactions are ever retained** in mana history, regardless of source).

### Hangar upgrades
- `openHangarConfirm(key)` / `closeHangarConfirm()`: manage `hangar.confirm`.
- `confirmHangarBuy()`: `owned = hangar.owned[key]||0`; if `owned >= item.prices.length`, silently closes (already maxed). `price = item.prices[owned]`. If `price > balance`, sets error "Недостатньо мани." (modal stays open). Else: `hangar.owned[key] = owned+1`; `mana.balance -= price`; logs; pushes mana history (capped to 4); closes confirm modal.

### Mana transactions
- `submitTx()`: `amt = parseFloat(amount)`; if falsy or `<=0`, error "Вкажи додатну кількість."
  - `deposit`: `balance += amt`; label `"+amt[ · comment]"`.
  - `withdraw`: if `amt>balance`, error "Недостатньо мани — баланс не може бути менше 0."; else `balance -= amt`; label `"−amt[ · comment]"`.
  - `transfer`: if `amt>balance`, error "Недостатньо мани для переказу."; else `balance -= amt`; label `"→ target(or 'пілот'): amt[ · comment]"`. **No actual routing to another pilot occurs** — purely local balance decrement + log label; this is a single-player prototype with no backend/multi-user state.
  - On success: resets `txOpen/amount/comment/target/error`, pushes history (capped to 4).

### Stress / Burdens / Bond
- `setStress(idx)`: `toggleFilled(stress, idx)`; logs old→new.
- `burdenSize(type)`: `minor4`→4, `middle6`→6, `major8`→8. `burdenLabel(type)`: `'МІНОРНИЙ · 4'` / `'МІДЛ · 6'` / `'МЕЙДЖОР · 8'`.
- `setBurdenName/Seg/Heal(bi, ...)`: mutate `burdens[bi]`; Seg/Heal variants log via `toggleFilled`.
- `setBurdenType(bi, type)`: sets type and resets `filled=0` (no logging) — **method exists but is unreachable from the UI** since the only place that would list type-switch buttons (`typeOptions`) is built from `[].map(...)`, always an empty array (see §5).
- `setArchetype`, `setBondNewPower`: plain text field setters.
- `setBondXp(idx)`: `toggleFilled(bond.xp, idx)`; logs. No threshold consequence — reaching 8 only flips the `bondPending` badge in the view, nothing is auto-consumed.
- `addPower()`: trims `newPower`; no-op if empty; appends to `powers`, clears draft; logs. **Not gated by XP** — you can add powers regardless of `xp` value.
- `removePower(idx)`: splices by index; logs.

### HP mode
- `incHp`/`decHp`: clamp to `[0, max]`; only log if a change actually occurs (guarded by pre-check, though the state update itself is separately clamped again defensively).

### Downtime
- `toggleDowntime(key)`: opens/closes accordion (only one at a time — `open` is a single key, not a set).
- `setDowntimeMod(key, mod)`: stores chosen modifier (no validation — any number could technically be stored, though UI only offers 0/2/4/6).
- `consumeDowntimeCharge()`: `used = min(max, used+1)`.
- `resetCharges()`: `used=0` (presumably a "new mission" reset button; not wired to any template button in the original — build a button for it in the new Downtime panel).
- `rollDowntime(key)`: no-op if `chargesUsed>=chargesMax`. Else: `die = 1 + floor(random()*20)` (1–20); `mod = modifiers[key]||0`; `total = die+mod`; `tier = total>=20 ? '20+' : total>=10 ? '10–19' : '1–9'`; stores in `downtime.rolls[key]`; consumes a charge.
- `useFocus()`: no-op if charges exhausted; else consumes a charge and `skillCapBonus += 1` (permanently raises the skill-trigger point cap by 1 per use — this is the mechanical link between "Сфокусуватись" downtime action and Skill Triggers).

### Skill triggers
- `setSkillDraftField(field, e)`: text setter for `name`/`desc`. `setSkillDraftLevel(level)`: sets draft level (1/2/3).
- `addSkillTrigger()`: no-op if `name` blank. Rejected (silently, no error UI) if `skillCapUsed() + draft.level > skillCapMax()`. Else creates `{id: Date.now(), name, desc, level}`, appends, resets draft; logs with `"+"+(level*2)`.
- `removeSkillTrigger(id)`: filters out by id; logs.
- `changeSkillLevel(id, delta)`: `next = level+delta`; rejected (no state change) if `next<1 || next>3` or if `used - level + next > cap`; else updates; logs.

### Contacts
- `setContactDraftField(field, e)`. `addContact()`: no-op if name blank; `debt` defaults to `'Без боргу'` if empty; `relationship` always starts `'neutral'`; logs; resets draft.
- `removeContact(idx)`: splices; logs.
- `cycleRelationship(idx)`: rotates `['bad','neutral','good']` forward (wrapping); logs with Ukrainian label (`bad`→ПОГАНО, `neutral`→НЕЙТРАЛЬНО, `good`→ГАРНО).

### Projects
- `setProjectDraftField`, `addProject()` (no-op if name blank; default `status: 'активний'`; logs; resets draft), `removeProject(idx)` (logs), `cycleProjectStatus(idx)` (rotates `['активний','призупинено','завершено']`; logs).

### Publicity mask
- `defaultMask(preset)`:
  - `'reveal'` → `{mana:true, stress:true, dp:true, contacts:true, mechs:true, narrative:true}` (everything visible).
  - `'minimal'` → `{mana:false, stress:false, dp:false, contacts:false, mechs:true, narrative:false}` (only mechs visible).
  - default/`'standard'` → `{mana:false, stress:true, dp:false, contacts:false, mechs:true, narrative:false}`.
- `toggleMask(key)`: flips one boolean; logs `"Публічність: LABEL → сховано/видимо"`.
- `applyPreset(preset)`: replaces the whole `publicity` object with `defaultMask(preset)`; logs `"застосовано пресет «preset»"`.

### Mechs
- `addMechDraftField`, `addMech()`: no-op if name blank; `hpMax = parseInt(draft.hpMax)||10`, `repairMax = parseInt(draft.repairMax)||5`; new mech `id=Date.now()`, `hpCurrent=hpMax`, `repairCurrent=repairMax`, `structureFilled=0`, `reactorFilled=0`, `corePower=true`, `overcharge=0`, `limited=[]`; logs; resets draft.
- `mechById(id)`, `removeMech(id)` (logs), `mechField(id, field, updater)` (generic per-mech mutate-by-id helper; `field` param is actually unused/ignored inside — `updater(m)` receives the whole mech and returns the replacement).
- `incMechHp`/`decMechHp`: clamp `[0, hpMax]`, log only on real change.
- `incMechRepair`/`decMechRepair`: clamp `[0, repairMax]`, log only on real change.
- `toggleMechCore(id)`: flips `corePower`; logs "заряджено"/"витрачено".
- `shiftMechOvercharge(id, dir)`: `overcharge = clamp(overcharge+dir, 0, OC_STEPS.length-1)` (0–3); logs old/new step label if changed.
- `fullRepairMech(id)`: resets hp/repair to max, structure/reactor/overcharge to 0, corePower=true, all limited items restored to max & undestroyed; logs.
- `setMechStructure(id, idx)` / `setMechReactor(id, idx)`: `toggleFilled` on the respective counter; logs.
- `setLimitedDraft(id, field, e)`: per-mech draft for adding a new limited system, keyed by mech id in `state.limitedDraft`.
- `addLimited(id)`: no-op if draft name blank; `max = parseInt(draft.max)||1`; appends `{name, current:max, max, destroyed:false}` to that mech's `limited`; logs; clears that mech's draft.
- `limLog(id, idx, fn)`: helper — looks up mech+limited item, invokes `fn(mech, limitedItem)` if both exist (used to build log messages before mutating).
- `removeLimited`, `incLimited`/`decLimited` (clamped to `[0,max]`, logs only on real change), `toggleLimitedDestroyed` (flips boolean; logs "знищена"/"відновлена").
- Mech inline edit: `toggleEdit` (in `mechsView`, inlined in `renderVals`) sets `mechEditId` and prefills `mechEdit` from current `hpMax`/`repairMax` (as strings) when opening, clears (`null`) when closing (toggle). `setEditHp`/`setEditRepair` update the draft strings. `saveEdit()`: `hpMax = max(1, parseInt(draft.hpMax)||m.hpMax)`, `repairMax = max(0, parseInt(draft.repairMax)||m.repairMax)`; logs old→new for both; applies, **also clamping current values down** if they now exceed the new max (`hpCurrent=min(hpCurrent,hpMax)`, `repairCurrent=min(repairCurrent,repairMax)`); closes edit mode.

### Narrative & log
- `setNarrative(e)`: plain textarea setter, no logging (narrative edits are not journaled).
- `logAction(msg)`: timestamp format `DD.MM.YYYY HH:MM:SS` (24h clock, all fields zero-padded via `String(n).padStart(2,'0')`), prepends `{ts, msg}` to `actionLog`, keeps only the newest 300 entries.
- `clearLog()`: empties `actionLog`.
- `stopProp(e)`: calls `e.stopPropagation()` — used on all modal inner-content divs so clicking inside a modal doesn't trigger the backdrop's close-on-click handler.

---

## 4. Hardcoded content lists (verbatim game content)

### `gamesTable()`
`[0, 3, 6, 9, 12, 16, 20, 24, 29, 34, 39, 44]`

### `OC_STEPS`
`['+1', '+1D3', '+1D6', '+1D6+4']`

### `hangarData()` (6 upgrades)
1. **`parking`** — «Місце стоянки» — prices `[2500]` (single level)
   Desc: `Додає другий слот для парковки меха.\nОбидва мехи розділяють наявні у персонажа ліцензії, але таланти та мех-стати можуть бути змінені.\nОбидва мехи ремонтуються окремо.\nДозволяє відразу зібрати нового меха.`
2. **`nonspace`** — «Оренда нонспейсу» — prices `[3000]`
   Desc: `Дозволяє розширити місце стоянки до трьох слотів.`
3. **`quantum`** — «Квантове ліцензування» — prices `[2500, 2500]`, desc `''`, levelTexts:
   - L1: `Дозволяє переобрати ліцензії для меха в слоті стоянки та зробити повний ремонт.`
   - L2: `Дозволяє переобрати ліцензії для меха в слоті нонспейсу та зробити повний ремонт.`
4. **`buffer`** — «Ресурсний буфер» — prices `[1000, 1000]`, desc `''`, levelTexts:
   - L1: `Перед місією гравець може попросити гільдію покласти частину DC на особистий склад.\nDC можуть накопичуватись на складі до 5 одиниць.\nІнші гравці можуть передавати DC після виконання місій гравцям групи до їх буферу — за наявності цього апгрейду та місця в ньому.\nОбмін накопичених DC:\n2 DC — 1 ремкомплект чи 3 лімітні заряди\n5 DC — скид OVERCHARGE до першого рівня`
   - L2: `Збільшує ліміт накопичення DC до 10 шт.\nДодає послугу:\n10 DC — повний ремонт`
5. **`storage`** — «Місце на складі» — prices `[1000]`
   Desc: `Дозволяє зберігати невитрачені резерви на наступні місії, до 3 одиниць одночасно.`
6. **`parts`** — «Адаптовані запчастини» — prices `[1500, 2000]`
   Desc: `Дозволяє довше використовувати цінні резерви з переліку:\n1. Oba Liquidmetal Cloak\n2. Up-Armoring\n3. Leg Enhancement\n4. Weathering\n5. Rented gear\n6. Boosted servos`
   LevelTexts:
   - L1: `Резерви з переліку будуть активні два завдання поспіль.`
   - L2: `Резерви з переліку будуть активні три завдання поспіль.`

### `bufServices()` (DC → resource exchange; last item is buffer-lvl-2-gated)
```
{ key:'kit',        title:'1 Ремкомплект',                             cost:2 }
{ key:'charges',    title:'3 Лімітні заряди',                          cost:2 }
{ key:'ocreset',    title:'Скид OVERCHARGE до першого рівня',          cost:5 }
{ key:'fullrepair', title:'Повний ремонт (РІВЕНЬ 2)',                  cost:10 }   // only if hangar.owned.buffer >= 2
```

### `shopData()` (mana store)
```
{ key:'repair1',    title:'1 Ремонтний набір',                                                 price:200  }
{ key:'charges3',   title:'3 Лімітні заряди',                                                   price:300  }
{ key:'repairfull', title:'Повний кап рем. комплектів',                                         price:700  }
{ key:'refillone',  title:'Поповнення всіх лімітних зарядів однієї зброї/системи',               price:300  }
{ key:'core',       title:'Заряд Core Power',                                                   price:1000 }
{ key:'fullrepair', title:'Повний ремонт\n',                                                     price:2000 }
```

### `downtimeData()` (6 accordion entries — full Ukrainian text preserved)

1. **`info`** — «Збір інформації», `showRoll:true`
   trigger: `Д20 + Investigate / Hack or Fix / Get Hold of Something / Act Unseen or Unheard`
   note: `Розкрий пункт з дошки завдань (сили ворога · поле бою · контекст місії · резерв з таблиці) та отримай всю інформацію з його підпунктів.`
   tiers:
   - `1–9`: `Оберіть один варіант:\n· Інформація не повна — ГМ ховає 2 підпункти.\n· Ви залишаєте слід — пов'язана фракція дізнається про пошук; отримуєте 2 наслідки: −20 жетонів репутації та −1 DIFFICULTY при соціальних тригерах з цією фракцією на наступній місії.`
   - `10–19`: `Оберіть один варіант:\n· Інформація не повна — ГМ ховає 1 підпункт.\n· Ви залишаєте слід — фракція дізнається; оберіть 1 з двох наслідків: −20 жетонів репутації, або −1 DIFFICULTY при соціальних тригерах з цією фракцією.`
   - `20+`: `Оберіть один варіант:\n· Розкрийте один підпункт з іншого пункту інформації.\n· Оберіть іншу місію на дошці та розкрийте 2 будь-які підпункти інформації додатково.`

2. **`contact`** — «Знайти контакт», `showRoll:true`
   trigger: `Д20 + Charm / Word on the Streets / Pull Rank / Get a Hold of Something`
   note: `Дія завжди знаходить контакт — кидок визначає умови. Контакт заноситься у записник і спільний список ГМ (ім'я · коло · профіль допомоги · стан боргу). Повторно шукати вже знайомого контакта не можна — звернення до нього йде через купівлю резерву за ману.\n\nТаблиця послуг/боргів (1Д4 або на вибір ГМа): прикрити контакта чи його людину на місії · дістати й передати річ · наративна допомога (витратити свою наступну даунтайм-дію на контакта) або бойова допомога (затримка появи NPC на 1-2 ранди) · виконати завдання в інтересах контакта як додаткову ціль місії · свій варіант за столом.`
   tiers:
   - `1–9`: `Контакт жадібний або обережний. Оберіть один варіант:\n· Заплатити 400 мани до початку місії.\n· Послуга — контакт сам обирає умову, яка має бути виконана до того, як він допоможе.`
   - `10–19`: `Контакт згоден, але не задарма. Оберіть один варіант:\n· Заплатити 200 мани до початку місії.\n· Борг — контакт сам обирає умову, яка може бути виконана після допомоги.`
   - `20+`: `Контакт знайдений на симпатії — перша допомога безкоштовна. За бажанням: контакт може попросити послугу, за виконання якої його можна використати безкоштовно ще раз на наступних місіях.`

3. **`barter`** — «Бартер», `showRoll:true`
   trigger: `Д20 + Get a Hold of Something / Word on the Streets / Charm / Threaten`
   note: `Пошук мех- чи тактичних резервів (сумарний ранг ≤3, знайдені резерви можуть повторюватись) з таблиці Даунтайм-резервів чи магазину.\n\nПримітка: резерви, що дають рем-комплекти чи лімітні заряди, отримуються в кількості 2 штуки за 1 резерв.`
   tiers:
   - `1–9`: `Знахідка з підвохом. Оберіть один варіант:\n· Заплатити 100 мани за сумарну кількість тірів резервів.\n· Отримати лише 1 ранг-1 резерв.\n· Не отримати резерви зараз — по одному в кінці місії на вибір.`
   - `10–19`: `Торг відбувся. Оберіть один варіант:\n· Заплатити 75 мани за сумарну кількість тірів резервів.\n· Отримати лише 2 ранг-1 резерви або 1 ранг-2 резерв.\n· Отримати всі знайдені резерви наприкінці наступної місії.`
   - `20+`: `Ринок був щедрий — отримайте всі бажані резерви без додаткових умов.`

4. **`steam`** — «Випустити пару», `showRoll:true`
   trigger: `Д20 + Survive / Charm / Word on the Streets / Read a Situation / Stay Cool / Apply Fists to Faces`
   note: `Стрес очищується повністю незалежно від результату кидка — кидок лише визначає, чим обернулась ніч.` (in the new build: `rollDowntime('steam')` will also clear `state.stress` to 0, since the original text promises this but the original code never wired it — this is one of the "finish the feature" deviations.)
   tiers:
   - `1–9`: `Ніч вийшла з-під контролю. Кинь 1Д4:\n· Заплати 100 мани за гарний відпочинок.\n· На наступній місії візьми лише 1 пілотський гір.\n· Наступний кидок «Знайти контакт»: 20+ рахується як 10-19, а 10-19 як 1-9.\n· Втрать 15 жетонів фракції, де немає негативної репутації, на вибір.`
   - `10–19`: `Пригода з ціною. Оберіть один пункт з таблиці 1–9.`
   - `20+`: `Ніч вдалась. Кинь 1Д4:\n· Наступний кидок «Знайти контакт»: 1-9 рахується як 10-19, а 10-19 як 20+.\n· Розкрий 2 підпункти з дії «Збір інформації».\n· +2 XP бонду.`

5. **`price`** — «Ціна за силу», trigger: `Керування скіл-тригерами пілота`, note: `''`, tiers: `[]`, `isSkillPanel:true`, `showRoll:false` — a marker entry meant to embed/link the Skill Triggers UI inside the Downtime accordion (no independent roll).

6. **`focus`** — «Сфокусуватись», trigger: `''`, note: `''`, tiers: `[]`, `isFocusPanel:true`, `showRoll:false` — marker entry meant to embed the `useFocus`/charges UI inside the accordion.

### Footer invariants text (static, not state-driven)
`"НАСКРІЗНІ ІНВАРІАНТИ: Мана ≥ 0 · Бьорденів ≤ 3 · Стрес ≤ 8 · Bond XP ≤ 8 з переливом · один персонаж на одну місію"`

---

## 5. Stubbed / incomplete / inconsistent sections in the original — how the rebuild resolves them

1. **Two empty template containers** existed between "SKILL TRIGGERS"/"ПРОЄКТИ" and between "ПРОЄКТИ"/"ОСОБИСТИЙ АНГАР". Cross-referencing `renderVals()`, three fully-computed-but-unused feature groups exist: Downtime actions (incl. `price`/`focus` marker sub-panels), Contacts, and Publicity mask. **Resolution**: build real cards for all three in the rebuild — Downtime panel, Contacts panel, and a compact Publicity/visibility panel (placed near the header/settings area since it's account-level display config, not a gameplay resource).
2. **`llEdit.games` dead field** — never read by `saveLlEdit`. **Resolution**: dropped; only LL→games (the direction that was actually implemented) is kept.
3. **Burden type-switching dead code** — `setBurdenType` fully implemented, but `typeOptions` always built from `[].map(...)`. **Resolution**: wire a real 3-way type selector (`minor4`/`middle6`/`major8`) per burden card using the existing method.
4. **Mech reactor segment count mismatch** (hint said 8, `buildSegs` always built 4). **Resolution**: implement 4, matching the real formula.
5. **`resetCharges` had no call site.** **Resolution**: exposed as a "нова місія" reset button in the new Downtime panel, next to the charges indicator.
6. **Mana "transfer" has no receiving side** — single-profile prototype, purely local balance decrement + a free-text label. **Resolution**: kept as-is (local decrement + label) — there is no cross-pilot wallet routing in this app either, by design.
7. **Bond XP "overflow"** mentioned in the footer text is not implemented anywhere (`bondPending` is cosmetic only, `addPower` is not gated by XP). **Resolution**: kept as-is (cosmetic pending badge, ungated power-adding) — inventing a spend/overflow mechanic isn't specified precisely enough to guess safely; can be revisited later if the user wants it.
