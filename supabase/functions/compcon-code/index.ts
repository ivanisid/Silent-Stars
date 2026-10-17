// Пілот COMP/CON за share code — для кнопки «СИНХРОНІЗУВАТИ З COMP/CON» у профілі пілота
// (docs/compcon-link-spec.md, §0 п. 7). API COMP/CON приймає запити з браузера лише з
// compcon.app, тож апка ходить через цю функцію. Вхід у COMP/CON не потрібен: за кодом
// видно версію, яку гравець опублікував у COMP/CON.
//
// POST { code }
//   → { updated, name, data } — `updated` (мс) — версія для порівняння з прийнятою в апці;
//     data — файл пілота з хмари (v3, без обгортки експорту).
//   Коду немає в COMP/CON → 404 { error }.
//
// Адреси й ключ — як у системі Lancer (src/module/util/compcon.ts); їх можна змінити
// секретами CC_API_BASE, CC_API_KEY, CC_CDN без нового коду.
//
// Розгортається з verify_jwt = true: викликати може лише залогінений гравець апки.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const API_BASE = (Deno.env.get("CC_API_BASE") || "https://api.compcon.app").replace(/\/+$/, "");
const API_KEY = Deno.env.get("CC_API_KEY") || "fcFvjjrnQy2hypelJQi4X9dRI55r5KuI4bC07Maf";
const CDN = (Deno.env.get("CC_CDN") || "https://ds69h3g1zxwgy.cloudfront.net").replace(/\/+$/, "");

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

const CODE = /^[A-Z0-9]{12}$/;

async function byCode(code: string) {
  const url = `${API_BASE}/v3/code?codes=${encodeURIComponent(JSON.stringify([code]))}&scope=items`;
  const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) throw new Error(`COMP/CON відповів ${res.status}`);
  const list = await res.json();
  const entry = Array.isArray(list) ? list.find((e) => e?.code === code) ?? list[0] : null;
  if (!entry?.uri) return null;
  const file = await fetch(`${CDN}/${entry.uri}?cb=${Date.now()}`, { cache: "no-store" });
  if (!file.ok) throw new Error(`Файл пілота в COMP/CON недоступний (${file.status})`);
  const data = await file.json();
  if (data?.itemType !== "pilot" || !Array.isArray(data?.mechs)) throw new Error("За цим кодом у COMP/CON не пілот.");
  return { updated: Number(entry.updated) || Number(data?.save?.lastModified) || 0, name: String(entry.name || data.name || ""), data };
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
  if (!CODE.test(code)) return json({ error: "Share code — 12 латинських літер і цифр." }, 400);

  try {
    const r = await byCode(code);
    if (!r) return json({ error: "Такого коду в COMP/CON немає." }, 404);
    return json(r);
  } catch (err) {
    console.error("compcon-code", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
