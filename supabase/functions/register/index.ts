// Реєстрація за ніком і паролем. До цього коміту коду в репозиторії не було; це версія
// v18 з сервера плюс перевірка довжини пароля зверху (bcrypt бере лише 72 байти, а
// помилку Auth про задовгий пароль функція видавала як «закороткий»).
//
// Supabase Auth вимагає email, тож нік хешується в ASCII-адресу на вигаданому домені
// (див. nickToEmail у client/src/api.js — мусить збігатися). Пошта не надсилається:
// акаунт створюється вже підтвердженим через admin API.
// Розгортається з verify_jwt = true (клієнт шле anon-ключ).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Fake but format-valid domain used to let pilots log in with just a nickname+password.
// No mail is ever sent here — accounts are created pre-confirmed via the admin API below.
const EMAIL_DOMAIN = "ferumvox-pilots.app";

// Must match client/src/api.js's nickToEmail exactly: Supabase requires an ASCII-only email
// local part, so a non-Latin nickname (e.g. Cyrillic) fails raw — hash it instead.
async function nickToEmail(nick: string): Promise<string> {
  const norm = nick.trim().toLowerCase();
  const bytes = new TextEncoder().encode(norm);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex}@${EMAIL_DOMAIN}`;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { nick?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некоректний запит." }, 400);
  }

  const nick = (body.nick || "").trim();
  const password = body.password || "";

  if (!nick) return json({ error: "Введіть нікнейм" }, 400);
  if (password.length < 6) {
    return json({ error: "Пароль закороткий (мін. 6 символів)" }, 400);
  }
  if (new TextEncoder().encode(password).length > 72) {
    return json({ error: "Пароль задовгий (макс. 72 байти)" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const email = await nickToEmail(nick);

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nick },
  });

  if (error) {
    const msg = error.message || "";
    if (/already been registered|already exists/i.test(msg)) {
      return json({ error: "Такий нікнейм вже зареєстровано." }, 409);
    }
    if (/password/i.test(msg)) {
      return json({ error: `Пароль не прийнято: ${msg}` }, 400);
    }
    return json({ error: msg }, 400);
  }

  return json({ ok: true, nick }, 201);
});
