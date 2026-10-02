// Ролі в Discord: LANCER — кожному, хто прив'язав апку; LLn — за найвищим LL серед
// активних пілотів. Ролі з такими назвами бот знаходить на сервері, а яких немає — створює.
//
// Працює від Discord ID: щоразу заново дивиться, кому він прив'язаний зараз, тож
// будь-яка кількість запитів у будь-якому порядку дає той самий результат.

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { discordFetch } from './discord.ts';

const LANCER = 'LANCER';
const LL_ROLE = /^LL\d+$/;

let guildId: string | null = null;

// Сервер беремо з каналу оголошень — окремий секрет під це не потрібен.
async function getGuildId() {
  if (guildId) return guildId;
  const res = await discordFetch(`/channels/${Deno.env.get('DISCORD_CHANNEL_ID')}`);
  if (!res.ok) throw new Error(`Discord channel ${res.status}: ${await res.text()}`);
  guildId = (await res.json()).guild_id as string;
  return guildId;
}

type Role = { id: string; name: string };

async function ensureRole(guild: string, roles: Role[], name: string) {
  const found = roles.find((r) => r.name === name);
  if (found) return found.id;
  const res = await discordFetch(`/guilds/${guild}/roles`, {
    method: 'POST',
    body: JSON.stringify({ name, mentionable: false, hoist: false }),
  });
  if (!res.ok) throw new Error(`Discord create role ${name} ${res.status}: ${await res.text()}`);
  const role = await res.json();
  roles.push(role); // щоб наступний гравець у цьому ж запуску не створив дубль
  return role.id as string;
}

async function setRole(guild: string, member: string, roleId: string, on: boolean) {
  const res = await discordFetch(`/guilds/${guild}/members/${member}/roles/${roleId}`, { method: on ? 'PUT' : 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Discord role ${on ? 'add' : 'remove'} ${res.status}: ${await res.text()}`);
}

// Які ролі має мати цей Discord-акаунт зараз.
async function wantedRoles(db: SupabaseClient, discordId: string) {
  const { data: link } = await db.from('discord_links').select('user_id').eq('discord_user_id', discordId).maybeSingle();
  if (!link) return { linked: false, ll: null as number | null };
  const { data: pilots, error } = await db.from('pilots').select('state').eq('user_id', link.user_id);
  if (error) throw new Error(error.message);
  const lls = (pilots || [])
    .filter((p) => p.state?.status !== 'archive')
    .map((p) => Number(p.state?.ll ?? 2))
    .filter((n) => Number.isFinite(n));
  return { linked: true, ll: lls.length ? Math.max(...lls) : null };
}

export async function syncRoles(db: SupabaseClient, discordIds: string[]) {
  const guild = await getGuildId();
  const rolesRes = await discordFetch(`/guilds/${guild}/roles`);
  if (!rolesRes.ok) throw new Error(`Discord roles ${rolesRes.status}: ${await rolesRes.text()}`);
  const roles: Role[] = await rolesRes.json();

  const done: Record<string, string> = {};
  for (const discordId of [...new Set(discordIds)]) {
    const memberRes = await discordFetch(`/guilds/${guild}/members/${discordId}`);
    if (memberRes.status === 404) { done[discordId] = 'not-in-server'; continue; }
    if (!memberRes.ok) throw new Error(`Discord member ${memberRes.status}: ${await memberRes.text()}`);
    const has = new Set<string>((await memberRes.json()).roles);

    const { linked, ll } = await wantedRoles(db, discordId);
    const want = new Set<string>();
    if (linked) {
      want.add(await ensureRole(guild, roles, LANCER));
      if (ll != null) want.add(await ensureRole(guild, roles, `LL${ll}`));
    }

    // Керуємо лише своїми ролями (LANCER і LLn), решту ролей гравця не чіпаємо.
    const managed = roles.filter((r) => r.name === LANCER || LL_ROLE.test(r.name)).map((r) => r.id);
    for (const id of managed) {
      if (want.has(id) && !has.has(id)) await setRole(guild, discordId, id, true);
      if (!want.has(id) && has.has(id)) await setRole(guild, discordId, id, false);
    }
    done[discordId] = linked ? `LANCER${ll != null ? ` + LL${ll}` : ''}` : 'removed';
  }
  return done;
}
