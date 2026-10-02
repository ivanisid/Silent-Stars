// Перемальовує оголошення гри в Discord і шле сповіщення. Викликається:
//   * тригером discord_notify (через pg_net) на кожну зміну game_slots / game_signups —
//     неважливо, з апки чи з Discord; при зміні статусу гри приходить ще й event;
//   * планувальником pg_cron кожні 10 хвилин з mode = 'remind' — нагадування перед грою.
// Розгортається з verify_jwt = false; натомість перевіряє x-sync-secret із vault.

import { adminClient, syncSlot } from '../_shared/discord.ts';
import { notifyStatus, remind } from '../_shared/notify.ts';

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

  const { slot_id, post, event, mode } = await req.json().catch(() => ({}));

  if (mode === 'remind') {
    try {
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
  const notified = typeof event === 'string' ? await attempt('notify', () => notifyStatus(db, slot_id, event)) : undefined;
  return Response.json({ result, notified, errors }, { status: errors.length ? 500 : 200 });
});
