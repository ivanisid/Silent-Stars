// Сповіщення в Discord окремими повідомленнями (з пінгом), на відміну від оголошення,
// яке лише тихо перемальовується. Відповідаємо на оголошення гри, щоб усе про одну
// гру трималося поруч.

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { clip, discordFetch, loadSlotView, SlotView } from './discord.ts';

type Signup = SlotView['signups'][number];

const who = (g: Signup) => (g.discordId ? `<@${g.discordId}>` : `**${g.nick}**`);
const pilotList = (list: Signup[]) => list.map((g) => `${who(g)} (${g.callsign})`).join(', ');
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const titleOf = (slot: any) => `«${slot.title || 'гра'}»`;

async function post(db: SupabaseClient, slotId: string, content: string, mention: Array<string | undefined>) {
  const { data: msg } = await db.from('discord_slot_messages').select('*').eq('slot_id', slotId).maybeSingle();
  const channelId = msg?.channel_id || Deno.env.get('DISCORD_CHANNEL_ID');
  const body: Record<string, unknown> = {
    content: clip(content, 2000),
    // Пінгуємо лише тих, кого стосується, а не @everyone чи ролі.
    allowed_mentions: { users: [...new Set(mention.filter(Boolean))].slice(0, 100) },
  };
  if (msg) body.message_reference = { message_id: msg.message_id, fail_if_not_exists: false };
  const res = await discordFetch(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Discord POST ${res.status}: ${await res.text()}`);
}

// Зміна статусу гри: склад затверджено / гру зіграно / скасовано.
export async function notifyStatus(db: SupabaseClient, slotId: string, event: string) {
  const view = await loadSlotView(db, slotId);
  if (!view) return 'no-slot';
  const { slot, signups } = view;
  const going = signups.filter((g) => g.approved === true);
  const notGoing = signups.filter((g) => g.approved === false);

  if (event === 'approved') {
    const lines = [`📋 Склад на ${titleOf(slot)} затверджено.`];
    lines.push(going.length ? `**Летять:** ${pilotList(going)}` : '_Ніхто не пройшов у склад._');
    if (slot.game_at) lines.push(`Старт <t:${unix(slot.game_at)}:F> (<t:${unix(slot.game_at)}:R>).`);
    if (notGoing.length) {
      // +3 нараховує gm_approve_roster лише за контест (охочих більше, ніж місць).
      const bonus = signups.length > slot.seats ? ' — +3 до пріоритету наступного разу' : '';
      lines.push(`**Цього разу ні:** ${pilotList(notGoing)}${bonus}`);
    }
    await post(db, slotId, lines.join('\n'), signups.map((g) => g.discordId));
    return 'notified';
  }

  if (event === 'closed') {
    if (!going.length) return 'nobody';
    const reward = [
      slot.reward_mana > 0 ? `${slot.reward_mana} М` : '',
      slot.reward_pr > 0 ? `${slot.reward_pr} PR` : '',
    ].filter(Boolean).join(' · ');
    await post(
      db, slotId,
      `🏁 ${titleOf(slot)} зіграно! ${reward ? `Нараховано: **${reward}**` : 'Гру зараховано'} — ${pilotList(going)}`,
      going.map((g) => g.discordId),
    );
    return 'notified';
  }

  if (event === 'cancelled') {
    if (!signups.length) return 'nobody';
    await post(db, slotId, `❌ ${titleOf(slot)} скасовано. ${signups.map(who).join(', ')}`, signups.map((g) => g.discordId));
    return 'notified';
  }

  return 'ignored';
}

// Позначка «це нагадування вже відправлено». Вставка — це і є захоплення: якщо два
// запуски планувальника зійдуться, другий отримає конфлікт і нічого не надішле.
async function claim(db: SupabaseClient, slotId: string, kind: string) {
  const { error } = await db.from('discord_reminders').insert({ slot_id: slotId, kind });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(error.message);
}

// Запускається планувальником кожні 10 хвилин.
export async function remind(db: SupabaseClient) {
  const now = Date.now();
  const { data: slots, error } = await db.from('game_slots').select('id, status')
    .in('status', ['open', 'approved'])
    .gt('game_at', new Date(now).toISOString())
    .lte('game_at', new Date(now + 24 * 3600e3).toISOString());
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const { id } of slots || []) {
    const view = await loadSlotView(db, id);
    if (!view) continue;
    const { slot, signups } = view;
    const t = unix(slot.game_at);
    const left = new Date(slot.game_at).getTime() - now;

    if (slot.status === 'open') {
      // Гра вже за добу, а склад досі не затверджено — нагадуємо ГМу.
      if (await claim(db, id, 'gm_pending')) {
        const gm = slot.gmDiscordId ? `<@${slot.gmDiscordId}>` : `**${slot.gmNick}**`;
        await post(db, id,
          `⚠️ ${gm}, ${titleOf(slot)} <t:${t}:R>, а склад ще не затверджено. Записано: ${signups.length}/${slot.seats}.`,
          [slot.gmDiscordId]);
        sent++;
      }
      continue;
    }

    const going = signups.filter((g) => g.approved === true);
    if (!going.length) continue;

    if (left <= 3600e3) {
      if (await claim(db, id, '1h')) {
        await claim(db, id, '24h'); // запізніле «за добу» після «за годину» ні до чого
        await post(db, id, `🚀 ${titleOf(slot)} стартує <t:${t}:R>! ${pilotList(going)}`, going.map((g) => g.discordId));
        sent++;
      }
    } else if (await claim(db, id, '24h')) {
      await post(db, id,
        `⏰ Нагадування: ${titleOf(slot)} — <t:${t}:F> (<t:${t}:R>). ${pilotList(going)}`,
        going.map((g) => g.discordId));
      sent++;
    }
  }
  return sent;
}
