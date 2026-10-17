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
// Розгортається з verify_jwt = true: викликати може лише залогінений гравець апки.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { byCode, SHARE_CODE } from "../_shared/compconCloud.ts";

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

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Очікувався JSON" }, 400);
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
