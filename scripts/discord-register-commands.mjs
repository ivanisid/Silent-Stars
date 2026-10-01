// Реєструє слеш-команди бота на сервері. Запускати один раз (і після змін списку нижче):
//
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/discord-register-commands.mjs
//
// Команди серверні (guild), а не глобальні — так вони з'являються одразу, а не за годину.

const { DISCORD_APP_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_APP_ID || !DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Потрібні змінні середовища DISCORD_APP_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID.');
  process.exit(1);
}

const STRING = 3;
const INTEGER = 4;

const commands = [
  {
    name: 'link',
    description: "Прив'язати Discord до акаунта в апці",
    options: [{ type: STRING, name: 'code', description: "Код зі сторінки «Запис на гру» в апці", required: true }],
  },
  {
    name: 'game',
    description: 'Створити гру (лише ГМ)',
    options: [
      { type: STRING, name: 'title', description: 'Назва місії', required: true, max_length: 200 },
      { type: STRING, name: 'date', description: 'Коли: ДД.ММ.РРРР ГГ:ХХ (Київ), напр. 12.10.2026 19:00', required: true },
      { type: INTEGER, name: 'seats', description: 'Місць (за замовчуванням 4)', min_value: 1, max_value: 20 },
      { type: STRING, name: 'description', description: 'Опис / брифінг', max_length: 2000 },
      { type: STRING, name: 'deadline', description: 'Кінець набору: ДД.ММ.РРРР ГГ:ХХ' },
    ],
  },
  {
    name: 'pilot',
    description: 'Показати картку свого пілота в каналі',
    options: [
      { type: STRING, name: 'callsign', description: 'Позивний (якщо пілотів кілька)', autocomplete: true },
    ],
  },
  {
    name: 'board',
    description: 'Опублікувати в каналі всі активні ігри, яких там ще немає (лише ГМ)',
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${DISCORD_GUILD_ID}/commands`,
  {
    method: 'PUT',
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  },
);
if (res.ok) {
  console.log('Зареєстровано:', (await res.json()).map((c) => `/${c.name}`).join(', '));
} else {
  console.error(res.status, await res.text());
  if (res.status === 401) console.error("Токен невірний: скопіюйте свіжий з Developer Portal → Bot → Reset Token.");
  // exitCode, а не process.exit(): на Windows exit() посеред fetch валить Node з assertion.
  process.exitCode = 1;
}
