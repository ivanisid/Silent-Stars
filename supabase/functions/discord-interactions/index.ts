// Interactions Endpoint Discord-бота: слеш-команди (/link, /game, /pilot, /board) і кнопки під
// оголошенням гри. Пише в ті ж game_signups / game_slots, що й апка, через discord_*
// функції в базі — оголошення потім оновлює тригер → discord-sync.
// Розгортається з verify_jwt = false: Discord підписує запити Ed25519, це і є автентифікація.

import { adminClient, clip, DISCORD_API, discordFetch, loadSlotView, syncSlot } from '../_shared/discord.ts';

const db = adminClient();

// ----- Перевірка підпису Discord -----

function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

let publicKey: CryptoKey | null = null;
async function verify(req: Request, body: string) {
  const sig = req.headers.get('X-Signature-Ed25519');
  const stamp = req.headers.get('X-Signature-Timestamp');
  if (!sig || !stamp) return false;
  publicKey ??= await crypto.subtle.importKey(
    'raw', hexToBytes(Deno.env.get('DISCORD_PUBLIC_KEY')!), { name: 'Ed25519' }, false, ['verify'],
  );
  return crypto.subtle.verify('Ed25519', publicKey, hexToBytes(sig), new TextEncoder().encode(stamp + body));
}

// ----- Відповіді -----

const EPHEMERAL = 64;
const reply = (content: string, extra: Record<string, unknown> = {}) =>
  Response.json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
// Оновити ефемерне повідомлення з меню вибору (крок «пілот → мех»).
const update = (content: string, components: unknown[] = []) =>
  Response.json({ type: 7, data: { content, components } });

function errText(err: unknown) {
  const msg = (err as { message?: string })?.message || String(err);
  return `⚠️ ${msg}`;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

// ----- Дати з /game: «ДД.ММ.РРРР ГГ:ХХ» або «ДД.ММ ГГ:ХХ», час київський -----

function kyivOffsetMs(utcMs: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Kyiv', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}

function parseKyivDate(input: string | undefined): string | null {
  if (!input) return null;
  const m = input.trim().match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s+(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`Не розібрав дату «${input}». Формат: ДД.ММ.РРРР ГГ:ХХ, напр. 12.10.2026 19:00`);
  const [, d, mo, y, h, mi] = m;
  const now = new Date();
  let year = y ? (y.length === 2 ? 2000 + +y : +y) : now.getUTCFullYear();
  const build = (yr: number) => {
    const naive = Date.UTC(yr, +mo - 1, +d, +h, +mi);
    return naive - kyivOffsetMs(naive);
  };
  let ms = build(year);
  // Без року — найближча така дата в майбутньому.
  if (!y && ms < now.getTime() - 86400000) ms = build(++year);
  return new Date(ms).toISOString();
}

// ----- Запис на гру -----

async function linkedUserId(discordId: string) {
  const { data } = await db.from('discord_links').select('user_id').eq('discord_user_id', discordId).maybeSingle();
  return data?.user_id as string | undefined;
}

const NOT_LINKED =
  'Ваш Discord ще не прив\'язаний до апки.\n' +
  '1. Відкрийте в апці сторінку **«Запис на гру»** і натисніть **«Прив\'язати Discord»**.\n' +
  '2. Введіть тут `/link <код>`.';

async function activePilots(userId: string) {
  const { data, error } = await db.from('pilots').select('id, name, callsign, state').eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).filter((p) => p.state?.status !== 'archive');
}

async function signup(discordId: string, slotId: string, pilot: any, mechId: string | null) {
  const s = await rpc('discord_signup', { p_discord_id: discordId, p_slot_id: slotId, p_pilot_id: pilot.id, p_mech_id: mechId });
  const mech = (pilot.state?.mechs || []).find((m: any) => m.id === mechId);
  const head = `✅ Записано: **${pilot.callsign}**${mech ? ` на ▮ ${mech.name}` : ''}. `;
  if (s.guaranteed) return head + `🛡 **Гарантоване місце** — бонус +${s.roll_bonus}, кидати не треба.`;
  const bonus = s.roll_bonus ? ` + бонус ${s.roll_bonus}` : '';
  return head + `Пріоритет **${s.roll + (s.roll_bonus || 0)}** (d20: ${s.roll}${bonus}).`;
}

function mechMenu(slotId: string, pilot: any) {
  const mechs = pilot.state?.mechs || [];
  return [{
    type: 1,
    components: [{
      type: 3,
      custom_id: `sm:${slotId}:${pilot.id}`,
      placeholder: 'Оберіть меха',
      options: mechs.slice(0, 25).map((m: any) => ({ label: (m.name || 'Мех').slice(0, 100), value: m.id })),
    }],
  }];
}

async function onComponent(i: any, discordId: string) {
  const [kind, slotId, pilotId] = (i.data.custom_id as string).split(':');

  if (kind === 'wd') {
    await rpc('discord_withdraw', { p_discord_id: discordId, p_slot_id: slotId });
    return reply('Ви відписалися від гри.');
  }

  if (kind === 'th' || kind === 'fp' || kind === 'tg') return onRosterTool(i, kind, discordId, slotId);

  if (kind === 'ap' || kind === 'ax' || kind === 'ad') return onApprove(i, kind, discordId, slotId);

  if (kind === 'rs') {
    const r = await rpc('discord_release_seat', { p_discord_id: discordId, p_slot_id: slotId });
    return reply(r.promoted
      ? '↩️ Місце звільнено — його вже отримав наступний у черзі.'
      : '↩️ Місце звільнено. У резерві нікого немає, ГМа повідомлено.');
  }

  // Кнопка зі старих оголошень, до того як кидок став автоматичним.
  if (kind === 'rl') return reply('Кидок тепер робиться автоматично під час запису — пріоритет видно в списку пілотів.');

  if (kind === 'su') {
    const uid = await linkedUserId(discordId);
    if (!uid) return reply(NOT_LINKED);
    const pilots = await activePilots(uid);
    if (pilots.length === 0) return reply('У вас немає активних пілотів. Створіть пілота в апці.');
    if (pilots.length === 1) {
      const mechs = pilots[0].state?.mechs || [];
      if (mechs.length <= 1) return reply(await signup(discordId, slotId, pilots[0], mechs[0]?.id ?? null));
      return reply(`Пілот **${pilots[0].callsign}**. Яким мехом?`, { components: mechMenu(slotId, pilots[0]) });
    }
    return reply('Яким пілотом записатися?', {
      components: [{
        type: 1,
        components: [{
          type: 3,
          custom_id: `sp:${slotId}`,
          placeholder: 'Оберіть пілота',
          options: pilots.slice(0, 25).map((p) => ({
            label: `${p.callsign} — ${p.name}`.slice(0, 100),
            value: p.id,
            description: `LL${p.state?.ll ?? '?'} · мехів: ${(p.state?.mechs || []).length}`,
          })),
        }],
      }],
    });
  }

  // Кроки меню: обрали пілота → (за потреби) меха → запис.
  if (kind === 'sp' || kind === 'sm') {
    const uid = await linkedUserId(discordId);
    if (!uid) return update(NOT_LINKED);
    const pid = kind === 'sp' ? i.data.values[0] : pilotId;
    const pilot = (await activePilots(uid)).find((p) => p.id === pid);
    if (!pilot) return update('Пілота не знайдено.');
    const mechs = pilot.state?.mechs || [];
    if (kind === 'sp' && mechs.length > 1) {
      return update(`Пілот **${pilot.callsign}**. Яким мехом?`, mechMenu(slotId, pilot));
    }
    const mechId = kind === 'sm' ? i.data.values[0] : mechs[0]?.id ?? null;
    try {
      return update(await signup(discordId, slotId, pilot, mechId));
    } catch (err) {
      return update(errText(err));
    }
  }

  return reply('Невідома дія.');
}

// ----- Затвердити склад -----
// Крок 1 (ap): ГМу — меню зі списком за пріоритетом; перші за кількістю місць і гарантовані
// вже відмічені. Крок 2 (ax): вибір надіслано — затверджуємо тими ж правилами, що й апка.

async function onApprove(i: any, kind: string, discordId: string, slotId: string) {
  const uid = await linkedUserId(discordId);
  if (!uid) return reply(NOT_LINKED);
  const view = await loadSlotView(db, slotId);
  if (!view) return reply('Гру не знайдено.');
  if (view.slot.created_by !== uid) return reply('Затвердити склад може лише ГМ, який веде цю гру.');

  // Запропонований склад: перші за пріоритетом на кількість місць (гарантовані — завжди).
  const suggested = view.signups.filter((g, n) => g.guaranteed || n < view.slot.seats).map((g) => g.id);

  if (kind === 'ax' || kind === 'ad') {
    try {
      const picked = kind === 'ax' ? i.data.values : suggested;
      await rpc('discord_approve_roster', { p_discord_id: discordId, p_slot_id: slotId, p_approved: picked });
      return update('✅ Склад затверджено — бот уже повідомив гравців у каналі.');
    } catch (err) {
      return update(errText(err));
    }
  }

  if (view.slot.status !== 'open') return reply('Склад уже затверджено.');
  const list = view.signups.slice(0, 25); // уже відсортовані: гарантовані, далі пріоритет
  if (!list.length) return reply('Ще ніхто не записався.');
  return reply(
    `Обери, хто летить (місць: **${view.slot.seats}**). Позначені перші за пріоритетом — зніми чи додай, ` +
    'і склад затвердиться, щойно закриєш меню. Або тисни кнопку, щоб узяти запропонований склад як є. ' +
    'Гарантовані місця увійдуть у склад у будь-якому разі.',
    {
      components: [{
        type: 1,
        components: [{
          type: 3,
          custom_id: `ax:${slotId}`,
          placeholder: 'Склад гри',
          min_values: 0,
          max_values: list.length,
          options: list.map((g, n) => ({
            label: `${g.callsign} — ${g.nick}`.slice(0, 100),
            value: g.id,
            description: g.guaranteed ? '🛡 гарантоване місце' : `пріоритет ${g.priority ?? '—'}`,
            default: g.guaranteed || n < view.slot.seats,
          })),
        }],
      }, {
        type: 1,
        components: [{ type: 2, style: 3, label: `Затвердити як запропоновано (${suggested.length})`, custom_id: `ad:${slotId}` }],
      }],
    },
  );
}

// ----- Зібрати склад: гілка, пост на дошці завдань, теги -----
// Лише для ГМа, який веде гру. Створене запам'ятовується в discord_slot_messages, тож
// повторне натискання веде до вже наявної гілки / поста, а не плодить копії.

const tagOf = (g: any) => (g.discordId ? `<@${g.discordId}>` : `**${g.nick}**`);

function briefing(slot: any, going: any[]) {
  const lines = [`📋 **«${slot.title || 'Гра'}»** — склад затверджено.`];
  if (slot.game_at) {
    const t = Math.floor(new Date(slot.game_at).getTime() / 1000);
    lines.push(`Старт <t:${t}:F> (<t:${t}:R>).`);
  }
  lines.push(`**Летять:** ${going.map((g) => `${tagOf(g)} (${g.callsign}${g.mech ? ` · ▮ ${g.mech}` : ''})`).join(', ')}`);
  return lines.join('\n');
}

async function onRosterTool(i: any, kind: string, discordId: string, slotId: string) {
  const uid = await linkedUserId(discordId);
  if (!uid) return reply(NOT_LINKED);
  const view = await loadSlotView(db, slotId);
  if (!view) return reply('Гру не знайдено.');
  if (view.slot.created_by !== uid) return reply('Це може лише ГМ, який веде цю гру.');
  const { slot } = view;
  const going = view.signups.filter((g) => g.approved === true);
  if (!going.length) return reply('У складі нікого немає.');
  const mention = { users: going.map((g) => g.discordId).filter(Boolean) };

  if (kind === 'tg') {
    const tags = going.map((g) => (g.discordId ? `<@${g.discordId}>` : `@${g.nick}`)).join(' ');
    const unlinked = going.filter((g) => !g.discordId).map((g) => g.nick);
    return reply(
      `Теги складу — скопіюй і встав куди треба:\n\`\`\`\n${tags}\n\`\`\`` +
      (unlinked.length ? `\nБез прив'язаного Discord (тегнути вручну): ${unlinked.join(', ')}` : ''),
    );
  }

  const { data: msg } = await db.from('discord_slot_messages').select('*').eq('slot_id', slotId).maybeSingle();

  if (kind === 'th') {
    if (!msg) return reply('Оголошення цієї гри немає в каналі — спершу /board.');
    if (msg.thread_id) return reply(`Гілка вже є: <#${msg.thread_id}>`);
    return deferred(i, async () => {
      // Гілка з самого оголошення: учасники бачать її прямо під ним.
      const res = await discordFetch(`/channels/${msg.channel_id}/messages/${msg.message_id}/threads`, {
        method: 'POST',
        body: JSON.stringify({ name: clip(`🧵 ${slot.title || 'Гра'}`, 100), auto_archive_duration: 10080 }),
      });
      if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
      const thread = await res.json();
      await db.from('discord_slot_messages').update({ thread_id: thread.id }).eq('slot_id', slotId);
      // Тег у гілці сам додає людину до неї.
      const post = await discordFetch(`/channels/${thread.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: clip(briefing(slot, going), 2000), allowed_mentions: mention }),
      });
      if (!post.ok) throw new Error(`Discord ${post.status}: ${await post.text()}`);
      return `🧵 Гілку створено: <#${thread.id}>`;
    });
  }

  if (kind === 'fp') {
    const forum = Deno.env.get('DISCORD_FORUM_ID');
    if (!forum) return reply('Дошку завдань не налаштовано (секрет DISCORD_FORUM_ID).');
    if (msg?.forum_thread_id) return reply(`Пост уже є: <#${msg.forum_thread_id}>`);
    return deferred(i, async () => {
      const desc = slot.description ? `\n\n${clip(slot.description, 1500)}` : '';
      const res = await discordFetch(`/channels/${forum}/threads`, {
        method: 'POST',
        body: JSON.stringify({
          name: clip(slot.title || 'Гра', 100),
          message: { content: clip(briefing(slot, going) + desc, 2000), allowed_mentions: mention },
        }),
      });
      if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
      const post = await res.json();
      if (msg) await db.from('discord_slot_messages').update({ forum_thread_id: post.id }).eq('slot_id', slotId);
      return `📌 Пост на дошці завдань створено: <#${post.id}>`;
    });
  }

  return reply('Невідома дія.');
}

// ----- Картка пілота (/pilot) -----
// Лише власні пілоти: чужих гравець не бачить і в апці (RLS), бот цього не обходить.
// Відповідь публічна — показати пілота в каналі і є суттю команди.

// Дзеркало llTier з client/src/pilot/logic.js.
const tierOf = (ll: number) => (ll <= 1 ? '0' : ll <= 5 ? '1' : ll <= 10 ? '2' : '3');

function pilotCard(p: any, owner: string) {
  const s = p.state || {};
  const ll = s.ll ?? 2;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Рівень', value: `LL${ll} · Тір ${tierOf(ll)}`, inline: true },
    { name: 'Ігор', value: String(s.games ?? 0), inline: true },
    { name: 'Мана', value: `${s.mana?.balance ?? 0} М`, inline: true },
    { name: 'PR', value: String(s.pr ?? 0), inline: true },
    { name: 'HP', value: `${s.hp?.current ?? '?'}/${s.hp?.max ?? '?'}`, inline: true },
    { name: 'Стрес', value: `${s.stress ?? 0}/${s.stressMax ?? 8}`, inline: true },
  ];
  if (s.bond?.archetype) fields.push({ name: 'Бонд', value: s.bond.archetype, inline: true });
  const mechs = (s.mechs || []).map((m: any) => {
    const frame = [m.frameSource, m.frame].filter(Boolean).join(' ');
    return `▮ **${m.name}**${frame ? ` — ${frame}` : ''} · HP ${m.hpCurrent ?? '?'}/${m.hpMax ?? '?'} · ремонт ${m.repairCurrent ?? '?'}/${m.repairMax ?? '?'}`;
  });
  fields.push({ name: 'Мехи', value: mechs.length ? mechs.join('\n').slice(0, 1024) : '_немає_' });
  return {
    title: `${p.callsign} — ${p.name}`.slice(0, 256),
    color: 0x5865f2,
    fields,
    footer: { text: `Пілот ${owner}` },
  };
}

async function onPilot(i: any, discordId: string, username: string) {
  const uid = await linkedUserId(discordId);
  if (!uid) return reply(NOT_LINKED);
  const pilots = await activePilots(uid);
  if (!pilots.length) return reply('У вас немає активних пілотів.');

  const wanted = (opt(i, 'callsign') as string | undefined)?.trim().toLowerCase();
  if (wanted) {
    const p = pilots.find((x) => x.id === wanted || x.callsign?.toLowerCase() === wanted);
    if (!p) return reply(`Пілота «${opt(i, 'callsign')}» серед ваших не знайдено.`);
    return Response.json({ type: 4, data: { embeds: [pilotCard(p, username)], allowed_mentions: { parse: [] } } });
  }
  if (pilots.length === 1) {
    return Response.json({ type: 4, data: { embeds: [pilotCard(pilots[0], username)], allowed_mentions: { parse: [] } } });
  }
  // Кілька пілотів і нічого не вказано — короткий перелік замість десятка карток.
  const list = pilots.map((p) => `**${p.callsign}** — ${p.name} · LL${p.state?.ll ?? 2} · ігор: ${p.state?.games ?? 0}`);
  return Response.json({
    type: 4,
    data: {
      embeds: [{
        title: `Пілоти ${username}`.slice(0, 256),
        color: 0x5865f2,
        description: list.join('\n').slice(0, 4000),
        footer: { text: 'Детальна картка: /pilot callsign' },
      }],
      allowed_mentions: { parse: [] },
    },
  });
}

// Підказки позивних під час набору /pilot.
async function onAutocomplete(i: any, discordId: string) {
  const uid = await linkedUserId(discordId);
  const typed = String(i.data.options?.find((o: any) => o.focused)?.value ?? '').toLowerCase();
  const pilots = uid ? await activePilots(uid) : [];
  const choices = pilots
    .filter((p) => `${p.callsign} ${p.name}`.toLowerCase().includes(typed))
    .slice(0, 25)
    .map((p) => ({ name: `${p.callsign} — ${p.name}`.slice(0, 100), value: p.id }));
  return Response.json({ type: 8, data: { choices } });
}

// ----- Слеш-команди -----

function opt(i: any, name: string) {
  return i.data.options?.find((o: any) => o.name === name)?.value;
}

// Відповідь «бот думає…», а роботу доробляємо у фоні й редагуємо її.
function deferred(i: any, work: () => Promise<string>) {
  const finish = async () => {
    let content: string;
    try {
      content = await work();
    } catch (err) {
      content = errText(err);
    }
    await fetch(`${DISCORD_API}/webhooks/${i.application_id}/${i.token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  };
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(finish());
  return Response.json({ type: 5, data: { flags: EPHEMERAL } });
}

async function onCommand(i: any, discordId: string, username: string) {
  switch (i.data.name) {
    case 'link': {
      const nick = await rpc('discord_link', { p_code: opt(i, 'code'), p_discord_id: discordId, p_username: username });
      return reply(`🔗 Discord прив'язано до акаунта **${nick}**. Тепер можна записуватися кнопками під оголошеннями.`);
    }

    case 'game': {
      const gameAt = parseKyivDate(opt(i, 'date'));
      const deadline = parseKyivDate(opt(i, 'deadline'));
      await rpc('discord_create_slot', {
        p_discord_id: discordId,
        p_title: opt(i, 'title'),
        p_description: opt(i, 'description') ?? '',
        p_game_at: gameAt,
        p_signup_deadline: deadline,
        p_seats: opt(i, 'seats') ?? 4,
      });
      return reply('✅ Гру створено — оголошення з\'явиться в каналі, і вона вже є на дошці в апці. Нагороду й складність можна задати в апці.');
    }

    case 'pilot':
      return onPilot(i, discordId, username);

    case 'board': {
      if (!(await rpc('discord_is_gm', { p_discord_id: discordId }))) return reply('Ця команда лише для ГМа.');
      return deferred(i, async () => {
        const { data: slots, error } = await db.from('game_slots').select('id').in('status', ['open', 'approved'])
          .order('game_at', { ascending: true, nullsFirst: false });
        if (error) throw new Error(error.message);
        let posted = 0;
        for (const s of slots || []) {
          if ((await syncSlot(db, s.id, true)) === 'posted') posted++;
        }
        return posted ? `Опубліковано оголошень: ${posted}.` : 'Усі активні ігри вже є в каналі.';
      });
    }
  }
  return reply('Невідома команда.');
}

// ----- Вхід -----

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.text();
  if (!(await verify(req, body))) return new Response('Bad signature', { status: 401 });

  const i = JSON.parse(body);
  if (i.type === 1) return Response.json({ type: 1 }); // PING

  const user = i.member?.user ?? i.user;
  const discordId = user?.id as string;
  const username = (user?.global_name || user?.username || '') as string;

  try {
    if (i.type === 2) return await onCommand(i, discordId, username);
    if (i.type === 3) return await onComponent(i, discordId);
    if (i.type === 4) return await onAutocomplete(i, discordId);
  } catch (err) {
    return reply(errText(err));
  }
  return reply('Невідомий тип взаємодії.');
});
