import { supabase } from './supabaseClient';
import { createDefaultPilotState } from './pilot/pilotDefaults';

// Supabase Auth requires a real-shaped email, and its local part must be plain ASCII — a
// Cyrillic (or any non-Latin) nickname fails format validation if used directly. So the
// nickname is hashed into an ASCII-only address instead; this also sidesteps reserved/fake-
// looking TLDs (.local, .test, etc.) being rejected. No mail is ever sent here: the `register`
// edge function creates accounts pre-confirmed via the admin API — must derive the SAME hash
// as supabase/functions/register/index.ts so register/login agree on the address.
const EMAIL_DOMAIN = 'ferumvox-pilots.app';

async function nickToEmail(nick) {
  const norm = nick.trim().toLowerCase();
  const bytes = new TextEncoder().encode(norm);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex}@${EMAIL_DOMAIN}`;
}

async function readFunctionError(error) {
  try {
    const body = await error.context.json();
    if (body?.error) return new Error(body.error);
  } catch {
    // fall through to generic message below
  }
  return new Error(error.message || 'Помилка запиту.');
}

function mapAuthError(error, context) {
  const msg = error?.message || '';
  if (context === 'login' && /invalid login credentials/i.test(msg)) {
    return new Error('Невірний нікнейм або пароль.');
  }
  return new Error(msg || 'Помилка запиту.');
}

function toPilotSummary(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    callsign: row.callsign,
    background: row.background,
    status: row.state?.status || 'active',
    games: row.state?.games || 0,
    // Рівень зберігається окремо від кількості ігор; у старих записів його ще немає,
    // тож fallback на стартовий LL2.
    ll: row.state?.ll ?? 2,
    hp: row.state?.hp || null,
    mana: row.state?.mana?.balance ?? 0,
    pr: row.state?.pr ?? 0,
    stress: row.state?.stress ?? 0,
    mechCount: row.state?.mechs?.length || 0,
    mechs: (row.state?.mechs || []).map((m) => ({ id: String(m.id), name: m.name })),
    updatedAt: row.updated_at,
  };
}

export const api = {
  register: async (nick, password) => {
    const trimmedNick = nick.trim();
    const { data, error } = await supabase.functions.invoke('register', {
      body: { nick: trimmedNick, password },
    });
    if (error) throw await readFunctionError(error);
    return data;
  },

  login: async (nick, password) => {
    const trimmedNick = nick.trim();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: await nickToEmail(trimmedNick),
      password,
    });
    if (error) throw mapAuthError(error, 'login');
    return { token: data.session.access_token, user: { id: data.user.id, nick: trimmedNick } };
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  // Own pilots only. RLS also lets a GM read everyone's pilots, so without the
  // user_id filter a GM's pilot-select page would list the whole campaign —
  // other players' characters belong in the GM panel instead.
  listPilots: async (userId) => {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, user_id, name, callsign, background, state, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toPilotSummary);
  },

  getMyRole: async (userId) => {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (error) throw new Error(error.message);
    return data.role;
  },

  // GM panel: every pilot in the campaign. RLS returns only own pilots for players.
  gmListAllPilots: async () => {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, user_id, name, callsign, background, state, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toPilotSummary);
  },

  // GM panel: nicknames to group pilots by player. RLS returns only the own profile for players.
  gmListProfiles: async () => {
    const { data, error } = await supabase.from('profiles').select('id, nick, role');
    if (error) throw new Error(error.message);
    return data;
  },

  // ГМ робить іншого учасника ГМом ('gm') або знімає роль ('player'). Свою роль змінити
  // не можна — це перевіряє сервер (gm_set_role).
  gmSetRole: async (userId, role) => {
    const { data, error } = await supabase.rpc('gm_set_role', { p_user_id: userId, p_role: role });
    if (error) throw new Error(error.message);
    return data;
  },

  // Видаляє акаунт іншого учасника разом із пілотами (gm_delete_user). Сервер не дасть
  // видалити себе, ГМа чи того, хто веде слоти ігор.
  gmDeleteUser: async (userId) => {
    const { data, error } = await supabase.rpc('gm_delete_user', { p_user_id: userId });
    if (error) throw new Error(error.message);
    return data;
  },

  // ----- Game board -----

  getMyContestBonus: async (userId) => {
    const { data, error } = await supabase.from('profiles').select('contest_bonus').eq('id', userId).single();
    if (error) throw new Error(error.message);
    return data.contest_bonus;
  },

  boardList: async () => {
    const { data, error } = await supabase.rpc('board_list');
    if (error) throw new Error(error.message);
    return data || [];
  },

  boardSignup: async (slotId, pilotId, mech) => {
    const { error } = await supabase.from('game_signups').insert({
      slot_id: slotId,
      pilot_id: pilotId,
      mech_id: mech?.id || null,
      mech_name: mech?.name || null,
    });
    if (error) {
      if (error.code === '23505') throw new Error('Ви вже записані на цю гру.');
      if (error.code === '42501') throw new Error('Запис недоступний — набір уже закрито.');
      throw new Error(error.message);
    }
    return { ok: true };
  },

  // Після затвердження складу: віддати своє місце — його отримує наступний за пріоритетом.
  boardReleaseSeat: async (slotId) => {
    const { data, error } = await supabase.rpc('release_seat', { p_slot_id: slotId });
    if (error) throw new Error(error.message);
    return data;
  },

  boardWithdraw: async (signupId) => {
    const { error } = await supabase.from('game_signups').delete().eq('id', signupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  // ----- Арти пілота й мехів (для апки і Foundry) -----
  // Портрет пілота і арт кожного меха. Файл іде в приватний бакет pilot-art у папку
  // гравця, рядок — в art_uploads; новий арт тієї ж ролі замінює попередній (тригер у базі).
  // Синхронізатор на сервері Foundry кладе його в Data/pilots/<нік>/<позивний>/.

  // { portrait: art | null, mechs: { [mechId]: art } }, у кожного art є previewUrl.
  listPilotArt: async (pilotId) => {
    const { data, error } = await supabase
      .from('art_uploads')
      .select('id, kind, mech_id, storage_path, file_name, synced_at, foundry_path')
      .eq('pilot_id', pilotId)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    const result = { portrait: null, mechs: {} };
    if (!data.length) return result;
    // Бакет приватний — показуємо через тимчасові посилання.
    const { data: signed } = await supabase.storage
      .from('pilot-art')
      .createSignedUrls(data.map((a) => a.storage_path), 3600);
    const url = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
    for (const a of data) {
      const art = { ...a, previewUrl: url.get(a.storage_path) || null };
      if (a.kind === 'portrait') result.portrait = art;
      else if (a.kind === 'mech') result.mechs[a.mech_id] = art;
    }
    return result;
  },

  // Портрети кількох пілотів одним запитом — для списку на сторінці вибору: { [pilotId]: url }.
  listPortraits: async (pilotIds) => {
    if (!pilotIds.length) return {};
    const { data, error } = await supabase
      .from('art_uploads')
      .select('pilot_id, storage_path')
      .eq('kind', 'portrait')
      .in('pilot_id', pilotIds)
      .is('deleted_at', null);
    if (error || !data.length) return {};
    const { data: signed } = await supabase.storage
      .from('pilot-art')
      .createSignedUrls(data.map((a) => a.storage_path), 3600);
    const url = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
    return Object.fromEntries(data.map((a) => [a.pilot_id, url.get(a.storage_path) || null]));
  },

  // kind: 'portrait' | 'mech'; mechId — лише для меха.
  uploadPilotArt: async ({ userId, pilotId, kind, mechId = null, file }) => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${userId}/${pilotId}/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('pilot-art').upload(path, file, { contentType: file.type });
    if (upErr) {
      if (/exceeded|too large|maximum/i.test(upErr.message)) throw new Error(`«${file.name}» більший за 10 МБ.`);
      if (/mime|type/i.test(upErr.message)) throw new Error(`«${file.name}» — не зображення (потрібен png, jpg, webp або gif).`);
      throw new Error(upErr.message);
    }
    const { error } = await supabase.from('art_uploads').insert({
      storage_path: path,
      file_name: file.name,
      size_bytes: file.size,
      pilot_id: pilotId,
      kind,
      mech_id: kind === 'mech' ? mechId : null,
    });
    if (error) {
      // Без рядка синхронізатор файл не побачить — прибираємо його, щоб не лишався сиротою.
      await supabase.storage.from('pilot-art').remove([path]);
      throw new Error(error.message);
    }
  },

  // Файли COMP/CON по одному на меха (див. compconProfiles): з них модуль Foundry створює
  // акторів. Повторне завантаження того ж меха замінює файл.
  saveCompconProfiles: async (pilotId, profiles) => {
    if (!profiles?.length) return;
    const rows = profiles.map((p) => ({
      pilot_id: pilotId, mech_id: p.mechId, data: p.data, updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('pilot_compcon').upsert(rows, { onConflict: 'pilot_id,mech_id' });
    if (error) throw new Error(error.message);
  },

  // М'яке видалення: файл із Foundry і зі сховища прибирає синхронізатор.
  deleteArt: async (id) => {
    const { error } = await supabase.rpc('art_delete', { p_id: id });
    if (error) throw new Error(error.message);
  },

  subscribePilotArt: (pilotId, onChange) => {
    const channel = supabase
      .channel(`art-${pilotId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'art_uploads', filter: `pilot_id=eq.${pilotId}` }, onChange)
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  // Оновлення рядка пілота (зокрема зміни з Foundry через foundry-sync). RLS діє і тут.
  subscribePilot: (pilotId, onChange) => {
    const channel = supabase
      .channel(`pilot-${pilotId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pilots', filter: `id=eq.${pilotId}` },
        (payload) => onChange(payload.new))
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  // ----- Discord -----
  // Запис через Discord іде в ті ж game_signups; тут лише прив'язка акаунта.

  getDiscordLink: async (userId) => {
    const { data, error } = await supabase
      .from('discord_links').select('discord_username, linked_at').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  // Вхід через Discord (OAuth). Повертає браузер з Discord на redirect-адресу вже з сесією.
  loginWithDiscord: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/pilots` },
    });
    if (error) throw new Error(error.message);
  },

  // Додати Discord-вхід до вже наявного акаунта (нік+пароль). Після цього обидва способи
  // ведуть в один акаунт, а прив'язку discord_links база ставить сама.
  linkDiscordLogin: async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/board` },
    });
    if (error) {
      if (/manual linking/i.test(error.message)) {
        throw new Error('Прив\'язка Discord-входу ще не ввімкнена на сервері — скажіть ГМу.');
      }
      throw new Error(error.message);
    }
  },

  hasDiscordLogin: async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) return false;
    return (data?.identities || []).some((i) => i.provider === 'discord');
  },

  createDiscordLinkCode: async () => {
    const { data, error } = await supabase.rpc('discord_create_link_code');
    if (error) throw new Error(error.message);
    return data;
  },

  unlinkDiscord: async (userId) => {
    const { error } = await supabase.from('discord_links').delete().eq('user_id', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  // Discord-теги складу для ГМа гри: рядок «<@id> <@id>», який Discord при вставці
  // перетворює на теги. Хто не прив'язав Discord — іде ніком через @, тегнути вручну.
  getRosterTags: async (slotId) => {
    const { data, error } = await supabase.rpc('slot_discord_mentions', { p_slot_id: slotId });
    if (error) throw new Error(error.message);
    const list = data || [];
    return {
      text: list.map((m) => (m.discordId ? `<@${m.discordId}>` : `@${m.nick}`)).join(' '),
      unlinked: list.filter((m) => !m.discordId).map((m) => m.nick),
    };
  },

  // Будь-яка зміна слотів чи записів (зокрема з Discord) → onChange. Повертає відписку.
  // Ігри одного пілота для шапки профілю: його записи разом зі слотом.
  listPilotGames: async (pilotId) => {
    const { data, error } = await supabase
      .from('game_signups')
      .select('id, approved, released_at, roll, roll_bonus, guaranteed, game_slots(id, title, game_at, status)')
      .eq('pilot_id', pilotId);
    if (error) throw new Error(error.message);
    return (data || []).filter((g) => g.game_slots);
  },

  // channelName — щоб дошка і профіль пілота не ділили один канал, коли обидва відкриті.
  subscribeBoard: (onChange, channelName = 'board') => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_slots' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_signups' }, onChange)
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  gmCreateSlot: async ({ title, description, gameAt, signupDeadline, seats, rewardMana, rewardPr, difficulty }) => {
    const { error } = await supabase.from('game_slots').insert({
      title: title.trim(),
      description: description.trim(),
      game_at: gameAt,
      signup_deadline: signupDeadline,
      seats,
      reward_mana: rewardMana,
      reward_pr: rewardPr,
      difficulty: difficulty || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  // Reward stays editable until the slot is closed — closing is what pays it out.
  //
  // .select() тут не косметика. Без нього PostgREST відповідає «успішно» навіть коли
  // UPDATE не зачепив жодного рядка — RLS відфільтрувала, слот видалено, id чужий —
  // і правка нагороди зникає мовчки, а UI показує, що все збережено. Повертаємо рядок
  // і падаємо, якщо його немає: краще видима помилка, ніж тиха втрата суми.
  gmUpdateSlotReward: async (slotId, { rewardMana, rewardPr, difficulty }) => {
    const { data, error } = await supabase
      .from('game_slots')
      .update({ reward_mana: rewardMana, reward_pr: rewardPr, difficulty: difficulty || null })
      .eq('id', slotId)
      .select('id, reward_mana, reward_pr, difficulty');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error('Нагороду НЕ збережено — слот не оновився. Оновіть сторінку й спробуйте ще раз.');
    }
    return { rewardMana: data[0].reward_mana, rewardPr: data[0].reward_pr, difficulty: data[0].difficulty };
  },

  // Та сама причина, що й у gmUpdateSlotReward: без .select() нульове оновлення
  // не відрізнити від успішного.
  gmCancelSlot: async (slotId) => {
    const { data, error } = await supabase
      .from('game_slots').update({ status: 'cancelled' }).eq('id', slotId).select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Слот не скасовано — він не оновився. Оновіть сторінку.');
    return { ok: true };
  },

  gmDeleteSlot: async (slotId) => {
    const { data, error } = await supabase
      .from('game_slots').delete().eq('id', slotId).select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Слот не видалено — рядок не зачепило. Оновіть сторінку.');
    return { ok: true };
  },

  // Каталог рідкісних резервів і теги. Читати можуть усі, писати — лише ГМ через gm_*.
  listRareCatalog: async () => {
    const [res, tags] = await Promise.all([
      supabase
        .from('rare_reserves')
        .select('key, rank, name, action, traits, description, flavor, price_pr, archived, rare_reserve_tags(tag_id)')
        .order('sort')
        .order('key'),
      supabase.from('reserve_tags').select('id, name, kind').order('kind').order('name'),
    ]);
    if (res.error) throw new Error(res.error.message);
    if (tags.error) throw new Error(tags.error.message);
    return {
      reserves: (res.data || []).map((r) => ({
        key: r.key,
        rank: r.rank,
        name: r.name,
        action: r.action,
        traits: r.traits,
        desc: r.description,
        flavor: r.flavor,
        pricePr: r.price_pr,
        archived: r.archived,
        tagIds: (r.rare_reserve_tags || []).map((t) => t.tag_id),
      })),
      tags: tags.data || [],
    };
  },

  gmSaveRareReserve: async ({ key, rank, name, action, traits, desc, flavor, tagIds, pricePr }) => {
    const { data, error } = await supabase.rpc('gm_save_rare_reserve', {
      p_key: key || null,
      p_rank: rank,
      p_name: name,
      p_action: action,
      p_traits: traits,
      p_description: desc,
      p_flavor: flavor,
      p_tag_ids: tagIds,
      p_price_pr: pricePr,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  gmSetRareReserveArchived: async (key, archived) => {
    const { error } = await supabase.rpc('gm_set_rare_reserve_archived', { p_key: key, p_archived: archived });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  gmSaveReserveTag: async ({ id, name, kind }) => {
    const { data, error } = await supabase.rpc('gm_save_reserve_tag', { p_id: id || null, p_name: name, p_kind: kind });
    if (error) throw new Error(error.message);
    return data;
  },

  gmDeleteReserveTag: async (id) => {
    const { error } = await supabase.rpc('gm_delete_reserve_tag', { p_id: id });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  // Locking the line-up and paying for a played game are separate steps: a slot sits in
  // 'approved' in between, where signup is shut but nothing has been awarded yet.
  gmApproveRoster: async (slotId, approvedSignupIds) => {
    const { error } = await supabase.rpc('gm_approve_roster', { p_slot_id: slotId, p_approved: approvedSignupIds });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  gmCloseGame: async (slotId) => {
    const { error } = await supabase.rpc('gm_close_game', { p_slot_id: slotId });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  // One operations log for both roles: the owner reads their own currency operations,
  // the GM reads anyone's. Same rows, same shape — the server decides who may see what.
  // Rows carry the author's nick, the kind of change, and whether the action journal
  // shrank, which is how a cleared journal stays visible.
  pilotOperationsLog: async (pilotId) => {
    const { data, error } = await supabase.rpc('pilot_operations_log', { p_pilot_id: pilotId });
    if (error) throw new Error(error.message);
    return data.map((row) => ({
      id: row.id,
      changedAt: row.changed_at,
      nick: row.changed_by_nick,
      action: row.action,
      revertible: row.revertible,
      manaOld: row.mana_old === null ? null : Number(row.mana_old),
      manaNew: row.mana_new === null ? null : Number(row.mana_new),
      prOld: row.pr_old === null ? null : Number(row.pr_old),
      prNew: row.pr_new === null ? null : Number(row.pr_new),
      logOldCount: row.log_old_count,
      logNewCount: row.log_new_count,
      logAdded: row.log_added || [],
    }));
  },

  // Restores the state captured before one recorded change. The restore is itself
  // written to the audit log, so an undo can't erase the trail.
  revertPilotState: async (auditId) => {
    const { error } = await supabase.rpc('revert_pilot_state', { p_audit_id: auditId });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  createPilot: async ({ name, callsign, background }) => {
    const { data, error } = await supabase
      .from('pilots')
      .insert({
        name: name.trim(),
        callsign: callsign.trim().toUpperCase(),
        background: background?.trim() || 'Бекграунд не вказано.',
        state: createDefaultPilotState(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  getPilot: async (id) => {
    const { data, error } = await supabase.from('pilots').select('*').eq('id', id).single();
    if (error) throw new Error('Пілота не знайдено');
    return data;
  },

  updatePilot: async (id, payload) => {
    const patch = { ...payload };
    if (typeof patch.callsign === 'string') patch.callsign = patch.callsign.trim().toUpperCase();
    if (typeof patch.name === 'string') patch.name = patch.name.trim();
    const { data, error } = await supabase.from('pilots').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  deletePilot: async (id) => {
    const { error } = await supabase.from('pilots').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
