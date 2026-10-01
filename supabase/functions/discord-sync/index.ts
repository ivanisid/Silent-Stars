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

  if (!secret) {
    const { data, error } = await db.rpc('discord_sync_secret');
    if (error || !data) return new Response('Secret unavailable', { status: 500 });
    secret = data as string;
  }
  if (req.headers.get('x-sync-secret') !== secret) return new Response('Forbidden', { status: 403 });

  const { slot_id, post, event, mode } = await req.json().catch(() => ({}));

  try {
    if (mode === 'remind') return Response.json({ reminded: await remind(db) });

    if (typeof slot_id !== 'string') return new Response('slot_id required', { status: 400 });
    const result = await syncSlot(db, slot_id, post === true);
    const notified = typeof event === 'string' ? await notifyStatus(db, slot_id, event) : undefined;
    return Response.json({ result, notified });
  } catch (err) {
    console.error('discord-sync', slot_id ?? mode, err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
