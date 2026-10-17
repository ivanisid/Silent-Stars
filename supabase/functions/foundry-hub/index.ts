// Хаб SILENT STARS у Foundry з боку гравця (docs/compcon-link-spec.md §3.4, §7.3). Модуль
// входить в апку ніком і паролем гравця (Supabase Auth) і ходить сюди з його сесією — без
// ключа синхронізації ГМа. Гравець бачить і змінює лише своїх пілотів.
//
//   POST { action: 'pull' }
//     → { pilots: [...] } — пілоти гравця в тій самій формі, що й pull у foundry-sync.
//
//   POST { action: 'profile', pilotId, mechId }
//     → { data } — файл COMP/CON меха свого пілота (для створення й оновлення актора).
//
//   POST { action: 'links', world, links: [{ pilotId, mechId, actor, build? }] }
//     Зв'язки мехів своїх пілотів у цьому світі Foundry — замінює лише їхні рядки.
//     → { ok: true, count }
//
// Розгортається з verify_jwt = true: викликати може лише залогінений гравець апки.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadProfile, loadPull, saveLinks, toSyncPilots } from '../_shared/foundryPilots.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// Модуль ходить сюди з браузера гравця (інший origin — сервер Foundry).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function ownPilotIds(userId: string) {
  const { data, error } = await db.from('pilots').select('id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data || []).map((p: any) => p.id as string);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  if (authErr || !auth?.user) return json({ error: 'Сесія апки завершилась — увійдіть ще раз.' }, 401);
  const userId = auth.user.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Очікувався JSON' }, 400);
  }

  try {
    if (body.action === 'pull') return json({ pilots: toSyncPilots(await loadPull(db, userId)) });
    if (body.action === 'profile') {
      const pilotId = String(body.pilotId || '');
      if (!(await ownPilotIds(userId)).includes(pilotId)) return json({ error: 'Це не ваш пілот.' }, 403);
      const r = await loadProfile(db, pilotId, String(body.mechId || ''));
      return json(r, r.error ? 404 : 200);
    }
    if (body.action === 'links') {
      const list = Array.isArray(body.links) ? body.links.slice(0, 200) : [];
      const r = await saveLinks(db, String(body.world || '').slice(0, 200), list, await ownPilotIds(userId));
      return json(r, r.error ? 400 : 200);
    }
    return json({ error: `Невідома дія: ${body.action}` }, 400);
  } catch (err) {
    console.error('foundry-hub', err);
    return json({ error: String(err) }, 500);
  }
});
