import { supabase } from './supabaseClient';
import { createDefaultPilotState } from './pilot/pilotDefaults';

// Supabase Auth rejects reserved/fake-looking TLDs (.local, .test, .example, .invalid) as
// malformed, so a real-shaped-but-unregistered domain is used instead. No mail is ever sent to
// it: the `register` edge function creates accounts pre-confirmed via the admin API, so nobody
// has to click an email link — just nickname + password.
const EMAIL_DOMAIN = 'ferumvox-pilots.app';

function nickToEmail(nick) {
  return `${nick.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
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
    name: row.name,
    callsign: row.callsign,
    background: row.background,
    status: row.state?.status || 'active',
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
      email: nickToEmail(trimmedNick),
      password,
    });
    if (error) throw mapAuthError(error, 'login');
    return { token: data.session.access_token, user: { id: data.user.id, nick: trimmedNick } };
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  listPilots: async () => {
    const { data, error } = await supabase
      .from('pilots')
      .select('id, name, callsign, background, state, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toPilotSummary);
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
