// Календар гравців у Discord: хто в який день хоче грати (play_availability) і які дні вже
// мають гру (game_slots), на два тижні вперед за київським часом. Спільне для
// discord-interactions (/calendar, меню відміток) і discord-sync (закріплене повідомлення).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { clip, discordFetch } from './discord.ts';

export const CAL_DAYS = 14;
const WD = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const kyivDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d);

// Сьогодні й наступні дні за київським часом — як YYYY-MM-DD.
export function calendarDays() {
  const [y, m, d] = kyivDay(new Date()).split('-').map(Number);
  return Array.from({ length: CAL_DAYS }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

export const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
};

export type CalendarData = {
  days: string[];
  players: Map<string, string[]>; // день → ніки охочих
  games: Map<string, Array<{ title: string; status: string; seats: number; signups: number }>>;
};

export async function loadCalendar(db: SupabaseClient): Promise<CalendarData> {
  const days = calendarDays();
  const from = days[0];
  const to = days[days.length - 1];

  // play_availability.user_id посилається на auth.users, тож ніки — окремим запитом.
  const { data: rows, error } = await db.from('play_availability')
    .select('day, user_id, discord_name, created_at')
    .gte('day', from).lte('day', to).order('created_at');
  if (error) throw new Error(error.message);
  const ids = [...new Set((rows || []).map((r: any) => r.user_id).filter(Boolean))];
  const { data: profs } = ids.length
    ? await db.from('profiles').select('id, nick').in('id', ids)
    : { data: [] as any[] };
  const nick = new Map((profs || []).map((p: any) => [p.id, p.nick]));
  const players = new Map<string, string[]>();
  for (const r of (rows || []) as any[]) {
    const list = players.get(r.day) ?? [];
    list.push(nick.get(r.user_id) || r.discord_name || 'Discord');
    players.set(r.day, list);
  }

  // Ігри в діапазоні: межі з запасом на добу, день — за київським часом.
  const { data: slots, error: e2 } = await db.from('game_slots')
    .select('id, title, status, seats, game_at, game_signups(count)')
    .neq('status', 'cancelled')
    .gte('game_at', new Date(Date.parse(`${from}T00:00:00Z`) - 86400e3).toISOString())
    .lte('game_at', new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86400e3).toISOString());
  if (e2) throw new Error(e2.message);
  const games = new Map<string, any[]>();
  for (const s of (slots || []) as any[]) {
    const day = kyivDay(new Date(s.game_at));
    if (!days.includes(day)) continue;
    const list = games.get(day) ?? [];
    list.push({ title: s.title || 'Гра', status: s.status, seats: s.seats, signups: s.game_signups?.[0]?.count ?? 0 });
    games.set(day, list);
  }
  return { days, players, games };
}

const STATUS_MARK: Record<string, string> = { open: 'набір', approved: 'склад є', closed: 'зіграно' };

function dayLine(cal: CalendarData, d: string, mine?: Set<string>) {
  const names = cal.players.get(d) || [];
  const games = cal.games.get(d) || [];
  const mark = mine ? (mine.has(d) ? '✅' : '▫️') : games.length ? '🎮' : '▫️';
  let line = `${mark} **${dayLabel(d)}** · ${names.length}`;
  if (names.length) line += ` — ${names.join(', ')}`;
  for (const g of games) {
    line += `\n  ▮ гра: ${g.title} (${STATUS_MARK[g.status] || g.status}, ${g.signups}/${g.seats})`;
  }
  return line;
}

// Особисте (ефемерне) — з галочками своїх днів і меню для відміток.
export function renderPersonal(cal: CalendarData, mine: Set<string>) {
  const content = clip(
    '📅 **Календар гравців** — хто хоче грати в найближчі 2 тижні; ▮ — уже є гра.\n' +
      'Оберіть у меню свої дні (обране замінить попередні відмітки). Те саме — на сторінці «Запис на гру» в апці.\n\n' +
      cal.days.map((d) => dayLine(cal, d, mine)).join('\n'),
    1900,
  );
  const components = [{
    type: 1,
    components: [{
      type: 3,
      custom_id: 'cal',
      placeholder: 'Мої дні, коли хочу грати',
      min_values: 0,
      max_values: cal.days.length,
      options: cal.days.map((d) => ({
        label: dayLabel(d),
        value: d,
        default: mine.has(d),
        description: cal.games.get(d)?.length ? `є гра: ${cal.games.get(d)!.map((g) => g.title).join(', ')}`.slice(0, 100) : undefined,
      })),
    }],
  }];
  return { content, components };
}

// Спільне закріплене повідомлення в каналі — без особистих галочок; кнопка відкриває особисте.
export function renderPublic(cal: CalendarData) {
  const appUrl = Deno.env.get('APP_URL');
  const buttons: any[] = [{ type: 2, style: 1, label: 'Відмітити мої дні', emoji: { name: '📅' }, custom_id: 'calo' }];
  if (appUrl) buttons.push({ type: 2, style: 5, label: 'Календар в апці', url: `${appUrl.replace(/\/$/, '')}/board` });
  return {
    content: '',
    embeds: [{
      title: '📅 Календар гравців — 2 тижні',
      description: clip(cal.days.map((d) => dayLine(cal, d)).join('\n'), 4000),
      color: 0x5865f2,
      footer: { text: 'Число — скільки хочуть грати · 🎮 / ▮ — день, на який уже є гра · оновлюється само' },
    }],
    components: [{ type: 1, components: buttons }],
    allowed_mentions: { parse: [] },
  };
}

// Оновити закріплене повідомлення (якщо його публікували). post = { channelId } — опублікувати
// заново в цьому каналі (старе прибирається) і закріпити. onlyIfStale — лише якщо змінився день
// (планувальник: вікно 2 тижнів зсувається щодня, навіть без нових відміток).
export async function syncCalendar(db: SupabaseClient, opts: { post?: { channelId: string }; onlyIfStale?: boolean } = {}) {
  const { data: row } = await db.from('discord_calendar_message').select('*').eq('id', 1).maybeSingle();
  const today = calendarDays()[0];
  if (!opts.post) {
    if (!row) return 'none';
    if (opts.onlyIfStale && row.rendered_day === today) return 'fresh';
  }
  const payload = renderPublic(await loadCalendar(db));

  if (!opts.post) {
    const res = await discordFetch(`/channels/${row.channel_id}/messages/${row.message_id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      // Повідомлення видалили вручну — забуваємо; перепублікує ГМ командою /calendar.
      await db.from('discord_calendar_message').delete().eq('id', 1);
      return 'gone';
    }
    if (!res.ok) throw new Error(`Discord PATCH ${res.status}: ${await res.text()}`);
    await db.from('discord_calendar_message').update({ rendered_day: today }).eq('id', 1);
    return 'updated';
  }

  if (row) await discordFetch(`/channels/${row.channel_id}/messages/${row.message_id}`, { method: 'DELETE' });
  const res = await discordFetch(`/channels/${opts.post.channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Discord POST ${res.status}: ${await res.text()}`);
  const posted = await res.json();
  // Закріпити; без права «Закріплювати повідомлення» повідомлення лишається просто в каналі.
  const pin = await discordFetch(`/channels/${opts.post.channelId}/pins/${posted.id}`, { method: 'PUT' });
  await db.from('discord_calendar_message').upsert({
    id: 1, channel_id: opts.post.channelId, message_id: posted.id, rendered_day: today,
  });
  return pin.ok ? 'posted' : 'posted-unpinned';
}
