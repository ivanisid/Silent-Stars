// Перемальовує оголошення гри в Discord і шле сповіщення. Викликається:
//   * тригером discord_notify (через pg_net) на кожну зміну game_slots / game_signups —
//     неважливо, з апки чи з Discord; при зміні статусу гри приходить ще й event;
//   * планувальником pg_cron кожні 10 хвилин з mode = 'remind' — нагадування перед грою;
//   * тригерами на discord_links / pilots з mode = 'roles' — ролі LANCER і LLn;
//   * тригером на play_availability з mode = 'calendar' — закріплений календар гравців
//     (його ж оновлюють зміни ігор і, раз на добу, планувальник — вікно 2 тижнів зсувається);
//   * вручну з mode = 'register_commands' — зареєструвати слеш-команди бота (_shared/commands.ts).
// Розгортається з verify_jwt = false; натомість перевіряє x-sync-secret із vault.

import { adminClient, syncSlot } from '../_shared/discord.ts';
import { notifyCalendarMatch, notifyStatus, remind } from '../_shared/notify.ts';
import { syncRoles } from '../_shared/roles.ts';
import { syncCalendar } from '../_shared/calendar.ts';
import { registerCommands } from '../_shared/commands.ts';

const db = adminClient();
let secret: string | null = null;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // На холодному старті перше читання секрету інколи падає. pg_net запит не повторює,
  // тож без цього губилася б сама подія — зокрема сповіщення про затвердження складу.
  for (let attempt = 1; !secret && attempt <= 4; attempt++) {
    const { data, error } = await db.rpc('discord_sync_secret');
    if (data) secret = data as string;
    else {
      console.error('discord-sync: secret read failed, attempt', attempt, error?.message);
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  if (!secret) return new Response('Secret unavailable', { status: 500 });
  if (req.headers.get('x-sync-secret') !== secret) return new Response('Forbidden', { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { slot_id, post, event, mode } = body;

  // Ролі LANCER / LLn. 'roles_all' — разовий прохід по всіх прив'язаних (після запуску фічі).
  if (mode === 'roles' || mode === 'roles_all') {
    try {
      let ids: string[] = Array.isArray(body.discord_ids) ? body.discord_ids : [];
      if (mode === 'roles_all') {
        const { data } = await db.from('discord_links').select('discord_user_id');
        ids = (data || []).map((l) => l.discord_user_id);
      }
      return Response.json({ roles: await syncRoles(db, ids) });
    } catch (err) {
      console.error('discord-sync roles', err);
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  if (mode === 'register_commands') {
    try {
      return Response.json({ registered: await registerCommands() });
    } catch (err) {
      console.error('discord-sync register_commands', err);
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  if (mode === 'calendar') {
    try {
      return Response.json({ calendar: await syncCalendar(db) });
    } catch (err) {
      console.error('discord-sync calendar', err);
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  if (mode === 'remind') {
    try {
      // Новий день — зсунути вікно закріпленого календаря; збій тут не скасовує нагадувань.
      await syncCalendar(db, { onlyIfStale: true }).catch((err) => console.error('discord-sync calendar', err));
      return Response.json({ reminded: await remind(db) });
    } catch (err) {
      console.error('discord-sync remind', err);
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  if (typeof slot_id !== 'string') return new Response('slot_id required', { status: 400 });

  // Оновлення оголошення і сповіщення незалежні: збій одного не має скасовувати інше.
  const errors: string[] = [];
  const attempt = async (label: string, fn: () => Promise<string>) => {
    try {
      return await fn();
    } catch (err) {
      console.error('discord-sync', label, slot_id, err);
      errors.push(`${label}: ${err}`);
      return undefined;
    }
  };
  const result = await attempt('sync', () => syncSlot(db, slot_id, post === true));
  // Ігри видно в закріпленому календарі — створення, перенесення, скасування, запис.
  await attempt('calendar', () => syncCalendar(db));
  const notified = typeof event === 'string' ? await attempt('notify', () => notifyStatus(db, slot_id, event, body)) : undefined;
  // У гри з'явилась дата — тим, хто відмітив цей день у календарі.
  if (body.scheduled === true) await attempt('calendar-match', () => notifyCalendarMatch(db, slot_id));
  return Response.json({ result, notified, errors }, { status: errors.length ? 500 : 200 });
});
