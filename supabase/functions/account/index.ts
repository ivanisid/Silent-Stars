// Зміна даних входу самим гравцем: нік і пароль.
//
// Вхід у апку — нік + пароль, де нік хешується в адресу на вигаданому домені (див.
// register/index.ts і nickToEmail у client/src/api.js). Тож зміна ніку — це зміна email
// в Auth, а її без підтвердження листом може зробити лише admin API. Профілі гравці теж
// не можуть змінювати самі (RLS лише на читання). Тому — ця функція з service-role.
//
// Розгортається з verify_jwt = true: запит несе токен сесії гравця, і змінюється лише
// його власний акаунт.
//
// POST { action: 'nick', nick }
//   Новий нік: profiles.nick і user_metadata.nick. Якщо в акаунта є пароль (вхід за ніком),
//   міняється й адреса — інакше старий нік лишився б логіном. Нік не може збігатися з
//   чужим (без урахування регістру).
// POST { action: 'password', current?, password }
//   Новий пароль. Якщо пароль уже був — потрібен поточний. Акаунт, створений через
//   Discord, пароля не має: тут він його отримує, і адреса стає адресою його ніку, тож
//   далі можна входити й за ніком.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type User } from "jsr:@supabase/supabase-js@2";

const EMAIL_DOMAIN = "ferumvox-pilots.app";
const NICK_MAX = 40;
const PASSWORD_MIN = 6;
// bcrypt, яким Auth хешує паролі, бере лише перші 72 байти — довший пароль тихо
// обрізався б, тож відмовляємо явно.
const PASSWORD_MAX_BYTES = 72;

// Мусить збігатися з client/src/api.js і register/index.ts.
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

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Акаунт входить за ніком (і має пароль), якщо його адреса — на нашому домені: так
// створює register, і так стає після першого пароля акаунта з Discord. Акаунт лише з
// Discord має адресу Discord і пароля не має.
const hasPassword = (u: User) => (u.email || "").toLowerCase().endsWith(`@${EMAIL_DOMAIN}`);

function checkPassword(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `Пароль закороткий (мін. ${PASSWORD_MIN} символів).`;
  if (new TextEncoder().encode(p).length > PASSWORD_MAX_BYTES) return "Пароль задовгий (макс. 72 байти).";
  return null;
}

// Нік зайнятий іншим акаунтом — за профілем (без регістру) або за адресою входу.
async function nickTaken(nick: string, selfId: string): Promise<boolean> {
  const { data, error } = await admin.from("profiles").select("id, nick").neq("id", selfId);
  if (error) throw new Error(error.message);
  const low = nick.toLowerCase();
  return (data || []).some((p) => (p.nick || "").trim().toLowerCase() === low);
}

const isTakenError = (msg: string) => /already been registered|already exists|duplicate/i.test(msg);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return json({ error: "Сесія недійсна — увійдіть знову." }, 401);
  const user = auth.user;

  let body: { action?: string; nick?: string; current?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некоректний запит." }, 400);
  }

  const { data: profile } = await admin.from("profiles").select("nick").eq("id", user.id).single();
  const curNick = (profile?.nick || user.user_metadata?.nick || "").trim();

  if (body.action === "nick") {
    const nick = (body.nick || "").trim();
    if (!nick) return json({ error: "Введіть нікнейм." }, 400);
    if (nick.length > NICK_MAX) return json({ error: `Нікнейм задовгий (макс. ${NICK_MAX} символів).` }, 400);
    // Нічого не змінилось — лише якщо й логін уже відповідає ніку (у старих акаунтів
    // профіль і логін іноді розходяться).
    if (nick === curNick && (!hasPassword(user) || (await nickToEmail(nick)) === user.email)) return json({ ok: true, nick });
    if (await nickTaken(nick, user.id)) return json({ error: `Нікнейм «${nick}» уже зайнятий.` }, 409);

    const attrs: Record<string, unknown> = { user_metadata: { ...(user.user_metadata || {}), nick } };
    // Логін — це адреса з ніку; без пароля акаунт входить лише через Discord, і адресу
    // не чіпаємо, поки не з'явиться пароль.
    if (hasPassword(user)) {
      const email = await nickToEmail(nick);
      if (email !== user.email) {
        attrs.email = email;
        attrs.email_confirm = true;
      }
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, attrs);
    if (error) {
      if (isTakenError(error.message || "")) return json({ error: `Нікнейм «${nick}» уже зайнятий.` }, 409);
      return json({ error: error.message }, 400);
    }
    const { error: pErr } = await admin.from("profiles").update({ nick }).eq("id", user.id);
    if (pErr) return json({ error: pErr.message }, 500);
    return json({ ok: true, nick, login: hasPassword(user) });
  }

  if (body.action === "password") {
    const password = body.password || "";
    const bad = checkPassword(password);
    if (bad) return json({ error: bad }, 400);

    const attrs: Record<string, unknown> = { password };
    if (hasPassword(user)) {
      // Поточний пароль перевіряємо окремим входом: лише admin API міняє пароль без
      // повторної автентифікації, тож без цієї перевірки вистачило б відкритої сесії.
      const current = body.current || "";
      if (!current) return json({ error: "Введіть поточний пароль." }, 400);
      const probe = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
      const { error: signErr } = await probe.auth.signInWithPassword({ email: user.email!, password: current });
      if (signErr) return json({ error: "Поточний пароль невірний." }, 403);
      await probe.auth.signOut({ scope: "local" });
    } else {
      // Перший пароль акаунта з Discord: вхід за ніком потребує адреси з ніку.
      if (!curNick) return json({ error: "Спершу задайте нікнейм." }, 400);
      attrs.email = await nickToEmail(curNick);
      attrs.email_confirm = true;
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, attrs);
    if (error) {
      if (isTakenError(error.message || "")) {
        return json({ error: `За ніком «${curNick}» уже входить інший акаунт. Спершу змініть нікнейм.` }, 409);
      }
      return json({ error: error.message }, 400);
    }
    return json({ ok: true, nick: curNick });
  }

  return json({ error: "Невідома дія." }, 400);
});
