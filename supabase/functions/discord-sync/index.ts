// Перемальовує оголошення гри в Discord. Викликається тригером discord_notify
// (через pg_net) на кожну зміну game_slots / game_signups — неважливо, з апки чи з Discord.
// Розгортається з verify_jwt = false; натомість перевіряє x-sync-secret із vault.

import { adminClient, syncSlot } from '../_shared/discord.ts';

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

  const { slot_id, post } = await req.json().catch(() => ({}));
  if (typeof slot_id !== 'string') return new Response('slot_id required', { status: 400 });

  try {
    const result = await syncSlot(db, slot_id, post === true);
    return Response.json({ result });
  } catch (err) {
    console.error('discord-sync', slot_id, err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
