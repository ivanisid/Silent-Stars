// Спільне для discord-interactions і discord-sync: клієнт Supabase з service role,
// виклики Discord REST API і рендер оголошення гри з поточного стану бази.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const DISCORD_API = 'https://discord.com/api/v10';

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

// Discord ріже частоту правок одного каналу; при 429 чекаємо скільки скажуть і пробуємо ще раз.
export async function discordFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN')}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  let res = await doFetch();
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const wait = Math.min(Number(body.retry_after ?? 1), 10) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    res = await doFetch();
  }
  return res;
}

// Дзеркало client/src/difficulty.js — лише підписи для оголошення.
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Легка · рек. LL2–3',
  'easy+': 'Легка+ · рек. LL4–5',
  'easy++': 'Легка++ · рек. LL6–7',
  mid: 'Середня · рек. LL7–8',
  'mid+': 'Середня+ · рек. LL8–9',
  'mid++': 'Середня++ · рек. LL9–10',
  hard: 'Важка · рек. LL10–11',
  'hard+': 'Важка+ · рек. LL11',
  'hard++': 'Важка++ · рек. LL12',
};

const STATUS: Record<string, { text: string; color: number }> = {
  open: { text: 'НАБІР ВІДКРИТО', color: 0x3ba55d },
  approved: { text: 'СКЛАД ЗАТВЕРДЖЕНО', color: 0xd4a72c },
  closed: { text: 'ГРУ ЗІГРАНО', color: 0x747f8d },
  cancelled: { text: 'СКАСОВАНО', color: 0xed4245 },
};

function ts(iso: string | null) {
  if (!iso) return null;
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  // Discord сам покаже час у часовому поясі кожного гравця.
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export type SlotView = {
  slot: Record<string, any>;
  signups: Array<Record<string, any>>;
};

// Стан слота для оголошення — те саме, що board_list віддає апці.
export async function loadSlotView(db: SupabaseClient, slotId: string): Promise<SlotView | null> {
  const { data: slot, error } = await db.from('game_slots').select('*').eq('id', slotId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!slot) return null;

  const { data: rows, error: e2 } = await db
    .from('game_signups')
    .select('id, user_id, pilot_id, mech_id, mech_name, roll, roll_bonus, approved, created_at, pilots(callsign, name, state)')
    .eq('slot_id', slotId)
    .order('created_at');
  if (e2) throw new Error(e2.message);

  const userIds = [...new Set([slot.created_by, ...(rows || []).map((r) => r.user_id)])];
  const [{ data: profiles }, { data: links }] = await Promise.all([
    db.from('profiles').select('id, nick').in('id', userIds),
    db.from('discord_links').select('user_id, discord_user_id').in('user_id', userIds),
  ]);
  const nick = new Map((profiles || []).map((p) => [p.id, p.nick]));
  const discord = new Map((links || []).map((l) => [l.user_id, l.discord_user_id]));

  const signups = (rows || []).map((r: any) => {
    const mechs = r.pilots?.state?.mechs || [];
    const mech = mechs.find((m: any) => m.id === r.mech_id)?.name || r.mech_name;
    return {
      callsign: r.pilots?.callsign || '—',
      pilotName: r.pilots?.name || '',
      ll: r.pilots?.state?.ll,
      mech,
      nick: nick.get(r.user_id) || '',
      discordId: discord.get(r.user_id),
      roll: r.roll,
      rollBonus: r.roll_bonus,
      approved: r.approved,
    };
  });

  return { slot: { ...slot, gmNick: nick.get(slot.created_by) || '', gmDiscordId: discord.get(slot.created_by) }, signups };
}

export function renderSlotMessage({ slot, signups }: SlotView) {
  const st = STATUS[slot.status] || STATUS.open;
  const isOpen = slot.status === 'open';
  const settled = slot.status === 'approved' || slot.status === 'closed';
  const contest = signups.length > slot.seats;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  const when = ts(slot.game_at);
  if (when) fields.push({ name: 'Коли', value: when });
  const deadline = ts(slot.signup_deadline);
  if (deadline && isOpen) fields.push({ name: 'Набір до', value: deadline });
  fields.push({
    name: 'Місця',
    value: `${signups.length}/${slot.seats}` + (contest && isOpen ? ' · більше охочих, ніж місць — кидок d20' : ''),
    inline: true,
  });
  if (slot.difficulty && DIFFICULTY_LABELS[slot.difficulty]) {
    fields.push({ name: 'Складність', value: DIFFICULTY_LABELS[slot.difficulty], inline: true });
  }
  if (slot.reward_mana > 0 || slot.reward_pr > 0) {
    const parts = [];
    if (slot.reward_mana > 0) parts.push(`${slot.reward_mana} М`);
    if (slot.reward_pr > 0) parts.push(`${slot.reward_pr} PR`);
    fields.push({ name: 'Нагорода', value: parts.join(' · '), inline: true });
  }
  fields.push({
    name: 'ГМ',
    value: slot.gmDiscordId ? `<@${slot.gmDiscordId}>` : slot.gmNick || '—',
    inline: true,
  });

  const lines = signups.map((g, i) => {
    let mark = '';
    if (settled) mark = g.approved ? '✅ ' : '❌ ';
    const who = g.discordId ? `<@${g.discordId}>` : g.nick;
    let line = `${mark}${i + 1}. **${g.callsign}**`;
    if (g.ll) line += ` · LL${g.ll}`;
    if (g.mech) line += ` · ▮ ${g.mech}`;
    line += ` — ${who}`;
    if (g.roll != null) line += ` · 🎲 ${g.roll}${g.rollBonus ? `+${g.rollBonus}` : ''}`;
    return line;
  });
  fields.push({ name: 'Пілоти', value: clip(lines.join('\n') || '_Поки ніхто не записався._', 1024) });

  const appUrl = Deno.env.get('APP_URL');
  const buttons: any[] = [
    { type: 2, style: 3, label: 'Записатись', custom_id: `su:${slot.id}`, disabled: !isOpen },
    { type: 2, style: 2, label: 'Відписатись', custom_id: `wd:${slot.id}`, disabled: !isOpen },
  ];
  if (contest && isOpen) {
    buttons.push({ type: 2, style: 1, label: 'Кидок участі', emoji: { name: '🎲' }, custom_id: `rl:${slot.id}` });
  }
  if (appUrl) buttons.push({ type: 2, style: 5, label: 'Відкрити в апці', url: `${appUrl.replace(/\/$/, '')}/board` });

  return {
    content: '',
    embeds: [
      {
        title: clip(slot.title || 'Гра', 256),
        description: slot.description ? clip(slot.description, 2000) : undefined,
        color: st.color,
        fields,
        footer: { text: st.text },
      },
    ],
    components: [{ type: 1, components: buttons }],
    allowed_mentions: { parse: [] }, // згадки лише для відображення, без пінгів на кожну правку
  };
}

// Опублікувати (якщо дозволено) або оновити оголошення слота; прибрати, якщо слота вже немає.
export async function syncSlot(db: SupabaseClient, slotId: string, allowPost: boolean) {
  const { data: msg } = await db.from('discord_slot_messages').select('*').eq('slot_id', slotId).maybeSingle();
  const view = await loadSlotView(db, slotId);

  if (!view) {
    if (msg) {
      await discordFetch(`/channels/${msg.channel_id}/messages/${msg.message_id}`, { method: 'DELETE' });
      await db.from('discord_slot_messages').delete().eq('slot_id', slotId);
    }
    return 'deleted';
  }

  const payload = renderSlotMessage(view);

  if (msg) {
    const res = await discordFetch(`/channels/${msg.channel_id}/messages/${msg.message_id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (res.ok) return 'updated';
    if (res.status !== 404) throw new Error(`Discord PATCH ${res.status}: ${await res.text()}`);
    // Повідомлення видалили вручну — забуваємо його; перепублікує лише явний запит.
    await db.from('discord_slot_messages').delete().eq('slot_id', slotId);
    if (!allowPost) return 'gone';
  } else if (!allowPost) {
    return 'skipped';
  }

  const channelId = Deno.env.get('DISCORD_CHANNEL_ID')!;
  const res = await discordFetch(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Discord POST ${res.status}: ${await res.text()}`);
  const posted = await res.json();
  await db.from('discord_slot_messages').upsert({ slot_id: slotId, channel_id: channelId, message_id: posted.id });
  return 'posted';
}
