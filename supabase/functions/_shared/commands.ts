// Реєстрація слеш-команд бота на сервері — з самої Supabase (токен бота вже в секретах),
// без скрипта на ПК. Список — commands.json (його ж читає scripts/discord-register-commands.mjs).
// Запуск: discord-sync з mode = 'register_commands' (у SQL-редакторі —
//   select private.discord_post_event('{"mode":"register_commands"}'::jsonb);).

import commands from './commands.json' with { type: 'json' };
import { discordFetch } from './discord.ts';
import { getGuildId } from './roles.ts';

export async function registerCommands() {
  // ID застосунку — з токена бота, сервер — з каналу оголошень: окремих секретів не треба.
  const app = await discordFetch('/oauth2/applications/@me');
  if (!app.ok) throw new Error(`Discord application ${app.status}: ${await app.text()}`);
  const appId = (await app.json()).id as string;
  const guild = await getGuildId();
  const res = await discordFetch(`/applications/${appId}/guilds/${guild}/commands`, {
    method: 'PUT',
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Discord commands ${res.status}: ${await res.text()}`);
  return ((await res.json()) as Array<{ name: string }>).map((c) => `/${c.name}`);
}
