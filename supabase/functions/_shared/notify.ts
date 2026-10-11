// Сповіщення в Discord окремими повідомленнями (з пінгом), на відміну від оголошення,
// яке лише тихо перемальовується. Відповідаємо на оголошення гри, щоб усе про одну
// гру трималося поруч.

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { clip, discordFetch, loadSlotView, SlotView } from './discord.ts';

type Signup = SlotView['signups'][number];

const who = (g: Signup) => (g.discordId ? `<@${g.discordId}>` : `**${g.nick}**`);
const pilotList = (list: Signup[]) => list.map((g) => (g.callsign ? `${who(g)} (${g.callsign})` : who(g))).join(', ');
const withPilot = (g: Signup) => (g.callsign ? `${who(g)} (${g.callsign})` : who(g));
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

// Події гри, про які варто пінгувати: місце звільнено, гру скасовано. Затвердження складу
// й завершення гри окремого повідомлення не мають — це видно в самому оголошенні (✅ / ❌,
// статус), а пінг усім лише засмічував канал.
export async function notifyStatus(db: SupabaseClient, slotId: string, event: string, extra: Record<string, any> = {}) {
  const view = await loadSlotView(db, slotId);
  if (!view) return 'no-slot';
  const { slot, signups } = view;

  // Гравець зі складу звільнив місце (release_seat приймає лише затверджених); на нього автоматично зайшов наступний у черзі (або ніхто).
  if (event === 'released') {
    // Запис без акаунта не має user_id, тож шукаємо за id запису (user_id — для подій старого формату).
    const gone = signups.find((g) => (extra.released_signup ? g.id === extra.released_signup : g.userId === extra.released_user));
    const inn = signups.find((g) => (extra.promoted_signup ? g.id === extra.promoted_signup : g.userId === extra.promoted_user));
    const gm = slot.gmDiscordId ? `<@${slot.gmDiscordId}>` : `**${slot.gmNick}**`;
    const lines = [`↩️ ${gone ? withPilot(gone) : 'Гравець'} звільнив місце в ${titleOf(slot)}.`];
    lines.push(inn
      ? `На його місце в склад заходить ${withPilot(inn)} — якщо не зможеш, теж тисни «Звільнити місце». ${gm}, склад змінився.`
      : `${gm}, у резерві нікого немає — місце вільне.`);
    // Склад змінився — ГМ має знати завжди, навіть коли заміна з резерву зайшла сама.
    await post(db, slotId, lines.join('\n'), [inn?.discordId, slot.gmDiscordId]);
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

// Запускається планувальником кожні 10 хвилин. Одне нагадування складу — за 2 години до гри
// (раніше було два: за добу й за годину).
const REMIND_BEFORE_MS = 2 * 3600e3;

export async function remind(db: SupabaseClient) {
  const now = Date.now();
  // Лише затверджені склади: відкритий у дедлайн (чи час гри) затверджує планувальник
  // (private.auto_approve_rosters), тож ГМу «склад ще не затверджено» більше не шлеться.
  const { data: slots, error } = await db.from('game_slots').select('id, status')
    .eq('status', 'approved')
    .gt('game_at', new Date(now).toISOString())
    .lte('game_at', new Date(now + REMIND_BEFORE_MS).toISOString());
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const { id } of slots || []) {
    const view = await loadSlotView(db, id);
    if (!view) continue;
    const { slot, signups } = view;
    const going = signups.filter((g) => g.approved === true);
    if (!going.length) continue;
    if (!(await claim(db, id, '2h'))) continue;
    const t = unix(slot.game_at);
    await post(db, id, `🚀 ${titleOf(slot)} стартує <t:${t}:R> (<t:${t}:t>). ${pilotList(going)}`, going.map((g) => g.discordId));
    sent++;
  }
  return sent;
}

// Гру заплановано (або перенесено) на день, який гравці відмітили в календарі: пінгуємо
// тих, хто відмітив і ще не записаний. Discord знаємо для прив'язаних акаунтів і для тих,
// хто відмічався з Discord без прив'язки. Один раз на гру й день (discord_reminders).
export async function notifyCalendarMatch(db: SupabaseClient, slotId: string) {
  const view = await loadSlotView(db, slotId);
  if (!view?.slot.game_at || view.slot.status !== 'open') return 'skip';
  const { slot, signups } = view;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date(slot.game_at));
  if (!(await claim(db, slotId, `cal:${day}`))) return 'already';

  const { data: marks, error } = await db.from('play_availability').select('user_id, discord_user_id').eq('day', day);
  if (error) throw new Error(error.message);
  const userIds = [...new Set((marks || []).map((m: any) => m.user_id).filter(Boolean))];
  const { data: links } = userIds.length
    ? await db.from('discord_links').select('user_id, discord_user_id').in('user_id', userIds)
    : { data: [] as any[] };
  const byUser = new Map((links || []).map((l: any) => [l.user_id, l.discord_user_id]));
  const signed = new Set(signups.flatMap((g) => [g.userId, g.discordId]).filter(Boolean));
  const ids = [...new Set((marks || [])
    .filter((m: any) => !signed.has(m.user_id) && !signed.has(m.discord_user_id))
    .map((m: any) => (m.user_id ? byUser.get(m.user_id) : m.discord_user_id))
    .filter(Boolean))] as string[];
  if (!ids.length) return 'nobody';

  const t = unix(slot.game_at);
  await post(db, slotId,
    `📅 ${titleOf(slot)} заплановано на <t:${t}:F> — день, який ви відмітили в календарі: ` +
      `${ids.map((id) => `<@${id}>`).join(' ')}. Записатись — кнопка під оголошенням.`,
    ids);
  return 'notified';
}
