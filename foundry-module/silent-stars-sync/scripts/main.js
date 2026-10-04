// Silent Stars ↔ Foundry: двостороння синхронізація пілотів і мехів з акторами Lancer.
//
// Працює лише в клієнті активного ГМа (щоб два ГМи не синхронізували одночасно).
// Цикл: забрати пілотів з апки → для кожної зв'язаної пари актор/пілот звести поля
// (sync.js) → записати у Foundry те, де перемогла апка, і відправити в апку те, де
// перемогла Foundry. Цикл запускається за таймером, після зміни зв'язаного актора чи
// предмета (з затримкою) і кнопкою в налаштуваннях модуля.

import {
  MODULE, PILOT_FIELDS, MECH_FIELDS, get, norm,
  mergeFields, mergeLimited, mechMaxPatch, pilotIdentityUpdate, artUpdate,
  findAppPilotFor, findAppMechFor,
} from './sync.js';

const DEFAULT_URL = 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/foundry-sync';
const SYNC_OPTION = { [MODULE]: true }; // позначка наших власних оновлень — не реагувати на них

let timer = null;
let pending = null;
let running = false;
let lastStatus = 'ще не запускалась';

const setting = (k) => game.settings.get(MODULE, k);
const isSyncGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
const pilotActors = () => game.actors.filter((a) => a.type === 'pilot');
const mechActors = () => game.actors.filter((a) => a.type === 'mech');
const flag = (doc, k) => doc.getFlag(MODULE, k);

// ----- Запити до функції foundry-sync -----

async function call(body) {
  const url = setting('url');
  const key = setting('key');
  if (!url || !key) throw new Error('Не вказано адресу функції або ключ синхронізації (налаштування модуля).');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-foundry-key': key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ----- Зв'язки -----

// Автозв'язування: пілот — за позивним, мех — за назвою серед мехів його пілота.
async function autoLink(appPilots) {
  const linkedPilots = new Set(pilotActors().map((a) => flag(a, 'pilotId')).filter(Boolean));
  for (const actor of pilotActors()) {
    if (flag(actor, 'pilotId')) continue;
    const p = findAppPilotFor(actor, appPilots, linkedPilots);
    if (!p) continue;
    linkedPilots.add(p.id);
    await actor.setFlag(MODULE, 'pilotId', p.id);
    console.log(`${MODULE} | зв'язано пілота ${actor.name} ↔ ${p.callsign}`);
  }

  const byId = new Map(appPilots.map((p) => [p.id, p]));
  const linkedMechs = new Set(mechActors().map((a) => flag(a, 'mechId')).filter(Boolean));
  for (const actor of mechActors()) {
    if (flag(actor, 'mechId')) continue;
    const pilotActor = get(actor, 'system.pilot.value');
    const appPilot = byId.get(pilotActor && flag(pilotActor, 'pilotId'));
    const m = findAppMechFor(actor, appPilot, linkedMechs);
    if (!m) continue;
    linkedMechs.add(m.id);
    await actor.update({ [`flags.${MODULE}.pilotId`]: appPilot.id, [`flags.${MODULE}.mechId`]: m.id }, SYNC_OPTION);
    console.log(`${MODULE} | зв'язано меха ${actor.name} ↔ ${appPilot.callsign} / ${m.name}`);
  }
}

// ----- Цикл -----

export async function syncNow({ quiet = true } = {}) {
  if (!isSyncGM()) return;
  if (running) return;
  running = true;
  try {
    const { pilots } = await call({ action: 'pull' });
    if (setting('autoLink')) await autoLink(pilots);
    const byId = new Map(pilots.map((p) => [p.id, p]));

    // pilotId → { pilotId, updatedAt, pilot, mechs, after: [функції, що дописують базу] }
    const pushes = new Map();
    const pushFor = (p) => {
      if (!pushes.has(p.id)) pushes.set(p.id, { pilotId: p.id, updatedAt: p.updatedAt, pilot: {}, mechs: {}, after: [] });
      return pushes.get(p.id);
    };
    const conflicts = [];

    for (const actor of pilotActors()) {
      const p = byId.get(flag(actor, 'pilotId'));
      if (!p) continue;
      const appTime = Date.parse(p.updatedAt) || 0;
      const r = mergeFields(PILOT_FIELDS, p, actor, appTime);
      const update = { ...pilotIdentityUpdate(p, actor), ...(r.update || {}) };
      if (Object.keys(update).length) await actor.update(update, SYNC_OPTION);
      if (Object.keys(r.patch).length) {
        const push = pushFor(p);
        Object.assign(push.pilot, r.patch);
        push.after.push(() => setBase(actor, r.baseAfterPush));
      }
      conflicts.push(...r.conflicts.map((c) => `${p.callsign}: ${c}`));
    }

    for (const actor of mechActors()) {
      const p = byId.get(flag(actor, 'pilotId'));
      const m = p?.mechs.find((x) => x.id === flag(actor, 'mechId'));
      if (!m) continue;
      const appTime = Date.parse(p.updatedAt) || 0;

      const r = mergeFields(MECH_FIELDS, m, actor, appTime);
      const update = { ...artUpdate(m.art, actor), ...(r.update || {}) };
      if (Object.keys(update).length) await actor.update(update, SYNC_OPTION);

      const lim = mergeLimited(m, actor.items.contents, appTime);
      if (lim.itemUpdates.length) await actor.updateEmbeddedDocuments('Item', lim.itemUpdates, SYNC_OPTION);

      const mechPatch = { ...mechMaxPatch(m, actor), ...r.patch };
      if (Object.keys(lim.patch).length) mechPatch.limited = lim.patch;
      if (Object.keys(mechPatch).length) {
        const push = pushFor(p);
        push.mechs[m.id] = mechPatch;
        push.after.push(() => setBase(actor, r.baseAfterPush));
        for (const { item, value } of lim.baseAfterPush) {
          push.after.push(() => item.update({ [`flags.${MODULE}.base`]: value }, SYNC_OPTION));
        }
      }
      conflicts.push(...[...r.conflicts, ...lim.conflicts].map((c) => `${p.callsign} / ${m.name}: ${c}`));
    }

    let sent = 0;
    let stale = 0;
    if (pushes.size) {
      const list = [...pushes.values()];
      const { results } = await call({
        action: 'push',
        updates: list.map(({ after, ...u }) => u),
      });
      for (const res of results || []) {
        const push = pushes.get(res.pilotId);
        if (res.ok) {
          sent += res.changes || 0;
          for (const fn of push.after) await fn();
        } else if (res.conflict) {
          stale++; // пілота щойно змінили в апці — наступний цикл зведе вже свіжі дані
        } else {
          console.warn(`${MODULE} | push ${res.pilotId}: ${res.error}`);
        }
      }
    }

    if (conflicts.length) console.warn(`${MODULE} | змінено з обох боків, взято новіше:`, conflicts);
    lastStatus = `${new Date().toLocaleTimeString()} — у апку: ${sent} змін${stale ? `, ${stale} відкладено` : ''}`;
    if (!quiet) ui.notifications.info(`Silent Stars: синхронізовано. ${lastStatus}`);
  } catch (err) {
    lastStatus = `${new Date().toLocaleTimeString()} — помилка: ${err.message}`;
    console.error(`${MODULE} |`, err);
    if (!quiet) ui.notifications.error(`Silent Stars: ${err.message}`);
  } finally {
    running = false;
  }
}

async function setBase(doc, values) {
  if (!Object.keys(values).length) return;
  const u = {};
  for (const [k, v] of Object.entries(values)) u[`flags.${MODULE}.base.${k}`] = v;
  await doc.update(u, SYNC_OPTION);
}

// Зміна у Foundry — синхронізувати невдовзі, а не чекати таймера. Затримка збирає
// кілька змін підряд (удар → структура → тепло) в один запит.
function scheduleSoon() {
  if (!isSyncGM() || !setting('enabled')) return;
  clearTimeout(pending);
  pending = setTimeout(() => syncNow(), 3000);
}

function restartTimer() {
  clearInterval(timer);
  timer = null;
  if (!isSyncGM() || !setting('enabled')) return;
  const sec = Math.max(5, Number(setting('interval')) || 20);
  timer = setInterval(() => syncNow(), sec * 1000);
  syncNow();
}

// ----- Вікно зв'язків -----

const { ApplicationV2 } = foundry.applications.api;

class LinksApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE}-links`,
    tag: 'form',
    window: { title: "Silent Stars: зв'язки з апкою", resizable: true },
    position: { width: 720, height: 'auto' },
    form: { handler: LinksApp.#onSubmit, closeOnSubmit: false },
    actions: { syncNow: LinksApp.#onSyncNow },
  };

  pilots = null;
  error = '';

  async _prepareContext() {
    if (!this.pilots && !this.error) {
      try {
        this.pilots = (await call({ action: 'pull' })).pilots;
      } catch (err) {
        this.error = err.message;
      }
    }
    return {};
  }

  async _renderHTML() {
    const esc = foundry.utils.escapeHTML ?? ((s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
    const div = document.createElement('div');
    div.style.padding = '8px';
    if (this.error) {
      div.innerHTML = `<p style="color:var(--color-level-error,#c00)">${esc(this.error)}</p>`;
      return div;
    }
    const pilots = this.pilots || [];
    const pilotOpts = (sel) =>
      `<option value="">— не зв'язано —</option>` +
      pilots.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.callsign)} (${esc(p.player || p.name)})</option>`).join('');
    const mechOpts = (sel) =>
      `<option value="">— не зв'язано —</option>` +
      pilots.flatMap((p) => p.mechs.map((m) => {
        const v = `${p.id}|${m.id}`;
        return `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(p.callsign)} / ${esc(m.name)}${m.frame ? ` (${esc(m.frame)})` : ''}</option>`;
      })).join('');

    const row = (actor, select) =>
      `<tr><td style="padding:2px 6px"><img src="${esc(actor.img)}" width="28" height="28" style="vertical-align:middle;border:none"> ${esc(actor.name)}</td><td>${select}</td></tr>`;

    div.innerHTML = `
      <p>Статус: ${esc(lastStatus)}</p>
      <h3>Пілоти</h3>
      <table>${pilotActors().map((a) => row(a, `<select name="pilot.${a.id}">${pilotOpts(flag(a, 'pilotId'))}</select>`)).join('') || '<tr><td>Немає акторів-пілотів</td></tr>'}</table>
      <h3>Мехи</h3>
      <table>${mechActors().map((a) => row(a, `<select name="mech.${a.id}">${mechOpts(flag(a, 'mechId') ? `${flag(a, 'pilotId')}|${flag(a, 'mechId')}` : '')}</select>`)).join('') || '<tr><td>Немає акторів-мехів</td></tr>'}</table>
      <p style="font-size:12px;opacity:.8">Після зміни зв'язку перша синхронізація бере значення з апки.</p>
      <footer class="form-footer" style="display:flex;gap:8px">
        <button type="submit"><i class="fas fa-save"></i> Зберегти зв'язки</button>
        <button type="button" data-action="syncNow"><i class="fas fa-sync"></i> Синхронізувати зараз</button>
      </footer>`;
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    for (const actor of [...pilotActors(), ...mechActors()]) {
      const isPilot = actor.type === 'pilot';
      const value = data[`${isPilot ? 'pilot' : 'mech'}.${actor.id}`];
      if (value === undefined) continue;
      const [pilotId, mechId] = isPilot ? [value || null, null] : (value ? value.split('|') : [null, null]);
      if (flag(actor, 'pilotId') === pilotId && (isPilot || flag(actor, 'mechId') === mechId)) continue;
      // Новий зв'язок — стара база не про нього.
      await actor.update({
        [`flags.${MODULE}.-=base`]: null,
        [`flags.${MODULE}.pilotId`]: pilotId,
        ...(isPilot ? {} : { [`flags.${MODULE}.mechId`]: mechId }),
      }, SYNC_OPTION);
      if (!isPilot) {
        const resets = actor.items.filter((i) => i.getFlag(MODULE, 'base') !== undefined)
          .map((i) => ({ _id: i.id, [`flags.${MODULE}.-=base`]: null }));
        if (resets.length) await actor.updateEmbeddedDocuments('Item', resets, SYNC_OPTION);
      }
    }
    ui.notifications.info("Silent Stars: зв'язки збережено.");
    this.render();
  }

  static async #onSyncNow() {
    await syncNow({ quiet: false });
    this.pilots = null;
    this.render();
  }
}

// ----- Реєстрація -----

Hooks.once('init', () => {
  game.settings.registerMenu(MODULE, 'links', {
    name: "Зв'язки з апкою",
    label: "Відкрити зв'язки",
    hint: 'Які актори Foundry відповідають яким пілотам і мехам в апці; кнопка ручної синхронізації.',
    icon: 'fas fa-link',
    type: LinksApp,
    restricted: true,
  });
  game.settings.register(MODULE, 'url', {
    name: 'Адреса функції foundry-sync', scope: 'world', config: true, type: String, default: DEFAULT_URL,
    onChange: restartTimer,
  });
  game.settings.register(MODULE, 'key', {
    name: 'Ключ синхронізації',
    // client, а не world: значення world-налаштувань отримують усі клієнти, зокрема гравці,
    // а з цим ключем можна писати в будь-якого пілота. Вписується один раз у браузері ГМа.
    hint: 'Секрет foundry_sync_key з vault у Supabase. Зберігається лише в цьому браузері.',
    scope: 'client', config: true, type: String, default: '', onChange: restartTimer,
  });
  game.settings.register(MODULE, 'enabled', {
    name: 'Синхронізація увімкнена', scope: 'world', config: true, type: Boolean, default: true, onChange: restartTimer,
  });
  game.settings.register(MODULE, 'interval', {
    name: 'Інтервал опитування апки (сек)', scope: 'world', config: true, type: Number, default: 20, onChange: restartTimer,
  });
  game.settings.register(MODULE, 'autoLink', {
    name: "Автоматично зв'язувати акторів",
    hint: 'Пілот — за позивним, мех — за назвою серед мехів свого пілота.',
    scope: 'world', config: true, type: Boolean, default: true,
  });
});

Hooks.once('ready', () => {
  game.modules.get(MODULE).api = { syncNow: () => syncNow({ quiet: false }), openLinks: () => new LinksApp().render(true) };
  restartTimer();
});

// Активний ГМ змінився (зайшов/вийшов) — таймер має жити рівно в одного.
Hooks.on('userConnected', () => setTimeout(restartTimer, 1000));

const linked = (actor) => actor && (flag(actor, 'pilotId') || flag(actor, 'mechId'));
Hooks.on('updateActor', (actor, _change, options) => {
  if (!options?.[MODULE] && linked(actor)) scheduleSoon();
});
Hooks.on('updateItem', (item, _change, options) => {
  if (!options?.[MODULE] && linked(item.parent)) scheduleSoon();
});
