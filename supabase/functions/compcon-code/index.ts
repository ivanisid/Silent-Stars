// Пілот COMP/CON за share code — для кнопки «СИНХРОНІЗУВАТИ З COMP/CON» у профілі пілота
// (docs/compcon-link-spec.md, §0 п. 7). API COMP/CON приймає запити з браузера лише з
// compcon.app, тож апка ходить через цю функцію. Вхід у COMP/CON не потрібен: за кодом
// видно версію, яку гравець опублікував у COMP/CON.
//
// POST { code }
//   → { updated, name, data } — `updated` (мс) — версія для порівняння з прийнятою в апці;
//     data — файл пілота з хмари (v3, без обгортки експорту).
//   Коду немає в COMP/CON → 404 { error }. Запити до COMP/CON — _shared/compconCloud.ts.
//
// POST { action: 'art', pilotId }
//   → { added, errors } — арти з хмари COMP/CON (посилання у файлах pilot_compcon цього пілота)
//     туди, де в апці арту ще немає (_shared/compconArt.ts). Апка кличе це після прийняття
//     версії; лише власник пілота або ГМ.
//
// Розгортається з verify_jwt = true: викликати може лише залогінений гравець апки.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { byCode, SHARE_CODE } from "../_shared/compconCloud.ts";
import { importCloudArt } from "../_shared/compconArt.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function cloudArt(req: Request, pilotId: string) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json({ error: "Потрібен вхід." }, 401);
  const [{ data: pilot }, { data: me }] = await Promise.all([
    db.from("pilots").select("user_id").eq("id", pilotId).maybeSingle(),
    db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!pilot) return json({ error: "Пілота не знайдено." }, 404);
  if (pilot.user_id !== auth.user.id && me?.role !== "gm") return json({ error: "Це не ваш пілот." }, 403);
  const { data: rows, error } = await db.from("pilot_compcon").select("mech_id, data").eq("pilot_id", pilotId);
  if (error) throw new Error(error.message);
  return json(await importCloudArt(db, pilotId, (rows || []).map((r) => ({ mechId: String(r.mech_id), data: r.data }))));
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { code?: unknown; action?: unknown; pilotId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Очікувався JSON" }, 400);
  }
  if (body.action === "art") {
    try {
      return await cloudArt(req, String(body.pilotId ?? ""));
    } catch (err) {
      console.error("compcon-code art", err);
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!SHARE_CODE.test(code)) return json({ error: "Share code — 12 латинських літер і цифр." }, 400);

  try {
    const r = await byCode(code);
    if (!r) return json({ error: "Такого коду в COMP/CON немає." }, 404);
    return json(r);
  } catch (err) {
    console.error("compcon-code", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
