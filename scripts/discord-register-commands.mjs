// Реєструє слеш-команди бота на сервері. Запускати один раз (і після змін списку нижче):
//
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/discord-register-commands.mjs
//
// Команди серверні (guild), а не глобальні — так вони з'являються одразу, а не за годину.
//
// Простіше: без ПК — тригер у базі (див. docs/discord-setup.md):
//   select private.discord_post_event('{"mode":"register_commands"}'::jsonb);

import { readFileSync } from 'node:fs';

const { DISCORD_APP_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_APP_ID || !DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Потрібні змінні середовища DISCORD_APP_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID.');
  process.exit(1);
}

// Список команд — supabase/functions/_shared/commands.json: його ж реєструє discord-sync
// (mode = 'register_commands') прямо з Supabase, без цього скрипта й токена на ПК.
const commands = JSON.parse(readFileSync(new URL('../supabase/functions/_shared/commands.json', import.meta.url), 'utf8'));

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
