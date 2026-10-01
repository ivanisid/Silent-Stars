# Запис на гру через Discord

Записатися можна і в апці, і в Discord. Обидва шляхи пишуть у ті самі `game_signups`,
тож список гравців завжди однаковий:

- **Discord → апка:** кнопка під оголошенням → edge-функція `discord-interactions` →
  `discord_signup()` у базі. Дошка в апці оновлюється сама (Supabase Realtime).
- **Апка → Discord:** будь-яка зміна `game_slots` / `game_signups` → тригер `discord_notify`
  → edge-функція `discord-sync` → оголошення в Discord перемальовується з бази.

Гравець один раз прив'язує Discord: «Запис на гру» → **ПРИВ'ЯЗАТИ DISCORD** → у Discord `/link <код>`.

| Команда / кнопка | Хто | Що робить |
|---|---|---|
| `/link <код>` | усі | прив'язує Discord до акаунта апки |
| `/game title date [seats] [description] [deadline]` | ГМ | створює гру (дата `ДД.ММ.РРРР ГГ:ХХ`, Київ) |
| `/pilot [callsign]` | усі | публікує в каналі картку свого пілота (LL, ігри, мана, PR, мехи) |
| `/board` | ГМ | публікує в каналі активні ігри, яких там ще немає |
| **Записатись** | усі | вибір пілота (і меха, якщо їх кілька) → запис |
| **Відписатись** | усі | поки набір відкритий |

Нагороду й складність ГМ задає в апці. Гра, створена в апці, сама публікується в канал.

**Пріоритет.** Під час запису (і в апці, і в Discord) одразу кидається d20 + бонус за програні
контести — це пріоритет, за яким ранжується список. Кидок прив'язаний до пари «гра + гравець»
(`game_signup_rolls`), тож вийти й записатися знову не перекидає його.

**Бонус** (`profiles.contest_bonus`) рахує `gm_approve_roster`:
- хто потрапив у склад — бонус обнуляється (і в контесті, і коли місць вистачило всім);
- контест (гравців більше, ніж місць), не потрапив — бонус зберігається і росте на +3;
- гравців ≤ місць, але ГМ когось не взяв — його бонус не змінюється.

Бонус **+9 на момент запису = гарантоване місце**: d20 не кидається, а затвердження складу
включає гравця завжди, навіть якщо ГМ його не відмітив.

**Сповіщення** (відповіддю на оголошення, з пінгом лише тих, кого стосується):
- склад затверджено — хто летить, хто ні (і +3 до пріоритету, якщо був контест);
- гру зіграно — нагорода учасникам; гру скасовано — усім записаним;
- нагадування за добу й за годину до старту (pg_cron `discord-reminders`, кожні 10 хв);
- ГМу — якщо до гри менше доби, а склад ще не затверджено.

## Налаштування (один раз)

1. **Створити бота.** <https://discord.com/developers/applications> → *New Application*.
   - *General Information*: скопіюйте **Application ID** і **Public Key**.
   - *Bot*: *Reset Token* → скопіюйте **токен**. Privileged intents не потрібні.
2. **Додати на сервер.** *OAuth2 → URL Generator*: scopes `bot` + `applications.commands`,
   permissions *View Channel*, *Send Messages*, *Embed Links*, *Read Message History*.
   Відкрийте згенероване посилання й оберіть сервер.
3. **ID каналу й сервера.** У Discord: *Налаштування → Додатково → Режим розробника*. Потім
   правий клік на канал оголошень → *Копіювати ID*, і так само на сервер.
4. **Секрети Supabase** (*Project Settings → Edge Functions → Secrets*):
   `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`,
   і `APP_URL` (адреса апки, напр. `https://….vercel.app`; потрібна для кнопки «Відкрити в апці»).
5. **Interactions Endpoint.** У Developer Portal → *General Information* → *Interactions Endpoint URL*:
   `https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/discord-interactions` → *Save*
   (Discord одразу перевіряє підпис, тож функція й `DISCORD_PUBLIC_KEY` вже мають бути на місці).
6. **Слеш-команди:**
   ```bash
   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/discord-register-commands.mjs
   ```
7. ГМ прив'язує свій Discord і запускає `/board`, щоб опублікувати вже наявні ігри.

## Розгортання

- Міграція: `supabase/migrations/20261002_discord_signup.sql` (вмикає `pg_net`, додає таблиці
  прив'язки, тригери і додає `game_slots`/`game_signups` у Realtime).
- Обидві функції розгортаються з `verify_jwt = false`: `discord-interactions` перевіряє підпис
  Discord (Ed25519), `discord-sync` перевіряє секрет із vault, який передає тригер.
