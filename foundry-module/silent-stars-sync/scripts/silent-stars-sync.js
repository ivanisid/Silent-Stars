// Silent Stars ↔ Foundry: двостороння синхронізація пілотів і мехів з акторами Lancer.
//
// Працює лише в клієнті активного ГМа (щоб два ГМи не синхронізували одночасно).
// Цикл: забрати пілотів з апки → для кожної зв'язаної пари актор/пілот звести поля
// (sync.js) → записати у Foundry те, де перемогла апка, і відправити в апку те, де
// перемогла Foundry. Цикл запускається за таймером, після зміни зв'язаного актора чи
// предмета (з затримкою) і кнопкою в налаштуваннях модуля.
//
// Кнопка «Створити з апки» робить пару актор-пілот + мех з файлу COMP/CON, який гравець
// завантажив в апку, імпортом самої системи Lancer — на будь-якому Foundry з цим модулем.
// Арти модуль кладе в Data свого сервера сам, тож вони є і на локальних серверах ГМів.

import {
  MODULE, PILOT_FIELDS, MECH_FIELDS, get, norm,
  mergeFields, mergeGroup, mergeLimited, mechMaxPatch, pilotIdentityUpdate, artUpdate,
  findAppPilotFor, findAppMechFor, profileActorName, groupActors, matchGroup,
} from './sync.js';

const DEFAULT_URL = 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/foundry-sync';
const SYNC_OPTION = { [MODULE]: true }; // позначка наших власних оновлень — не реагувати на них

let timer = null;
let pending = null;
let running = false;
let creating = false; // поки імпорт створює актора, цикл не чіпає напівготові дані
let lastStatus = 'ще не запускалась';

const setting = (k) => game.settings.get(MODULE, k);
const isSyncGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
const pilotActors = () => game.actors.filter((a) => a.type === 'pilot');
const mechActors = () => game.actors.filter((a) => a.type === 'mech');
const flag = (doc, k) => doc.getFlag(MODULE, k);

// ----- Запити до функції foundry-sync -----

// fetch кидає TypeError, коли відповіді немає зовсім (з'єднання обірвалось, мережа
// моргнула) — це не помилка даних, тож пробуємо ще раз. Повтор push безпечний: функція
// перевіряє updatedAt, і вже застосований push повернеться як conflict.
class NetworkError extends Error {}
const RETRY_DELAYS = [2000, 5000];

async function call(body) {
  const url = setting('url');
  const key = setting('key');
  if (!url || !key) throw new Error('Не вказано адресу функції або ключ синхронізації (налаштування модуля).');
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-foundry-key': key },
        body: JSON.stringify(body),
      });
      break;
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;
      if (attempt >= RETRY_DELAYS.length) throw new NetworkError(`немає зв'язку з апкою (${err.message})`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ----- Арти в Data цього Foundry -----
//
// Шлях (foundry_path) визначає синхронізатор артів в апці; модуль кладе файл за тим самим
// шляхом відносно Data. Яка версія арту вже лежить за шляхом, пам'ятає world-налаштування
// artFiles ({ шлях: id арту }): новий арт під тим самим ім'ям замінює старий файл.

const FP = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
const knownDirs = new Set();

async function ensureDir(dir) {
  let parent = '';
  for (const part of dir.split('/').filter(Boolean)) {
    const cur = parent ? `${parent}/${part}` : part;
    if (!knownDirs.has(cur)) {
      const listing = await FP().browse('data', parent).catch(() => null);
      const exists = (listing?.dirs || []).some((d) => decodeURIComponent(d).replace(/\/+$/, '') === cur);
      // Якщо теку створили паралельно, createDirectory впаде — тоді невдачу покаже upload.
      if (!exists) await FP().createDirectory('data', cur, {}).catch(() => null);
      knownDirs.add(cur);
    }
    parent = cur;
  }
}

async function ensureArt(path, id) {
  if (!path || !id || !setting('uploadArt')) return;
  const files = setting('artFiles') || {};
  if (files[path] === id) return;
  const { url } = await call({ action: 'art', id });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`арт ${path}: HTTP ${res.status}`);
  const blob = await res.blob();
  const dir = path.split('/').slice(0, -1).join('/');
  const name = path.split('/').pop();
  await ensureDir(dir);
  const out = await FP().upload('data', dir, new File([blob], name, { type: blob.type }), {}, { notify: false });
  if (!out?.path) throw new Error(`не вдалося покласти арт ${path} (перевірте право ГМа завантажувати файли)`);
  await game.settings.set(MODULE, 'artFiles', { ...(setting('artFiles') || {}), [path]: id });
}

// Помилка з артом не має зупиняти синхронізацію ХП і решти.
async function ensureArtSafe(path, id) {
  try {
    await ensureArt(path, id);
  } catch (err) {
    console.warn(`${MODULE} |`, err);
  }
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
  if (running || creating) return;
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

    // Кілька акторів одного пілота (профілі з різними талантами й мехами) зводяться
    // разом: ХП і стрес пілота в апці одні.
    const groups = new Map();
    for (const actor of pilotActors()) {
      const id = flag(actor, 'pilotId');
      if (!byId.has(id)) continue;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(actor);
    }
    for (const [id, actors] of groups) {
      const p = byId.get(id);
      const appTime = Date.parse(p.updatedAt) || 0;
      await ensureArtSafe(p.portrait, p.portraitId);
      const r = mergeGroup(PILOT_FIELDS, p, actors, appTime);
      for (const [i, actor] of actors.entries()) {
        const update = { ...pilotIdentityUpdate(p, actor), ...(r.updates[i] || {}) };
        if (Object.keys(update).length) await actor.update(update, SYNC_OPTION);
      }
      if (Object.keys(r.patch).length) {
        const push = pushFor(p);
        Object.assign(push.pilot, r.patch);
        actors.forEach((actor, i) => push.after.push(() => setBase(actor, r.baseAfterPush[i])));
      }
      conflicts.push(...r.conflicts.map((c) => `${p.callsign}: ${c}`));
    }

    for (const actor of mechActors()) {
      const p = byId.get(flag(actor, 'pilotId'));
      const m = p?.mechs.find((x) => x.id === flag(actor, 'mechId'));
      if (!m) continue;
      const appTime = Date.parse(p.updatedAt) || 0;
      await ensureArtSafe(m.art, m.artId);

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
    // Мережевий збій після повторів — попередження: наступний цикл таймера спробує знову.
    if (err instanceof NetworkError) console.warn(`${MODULE} | ${err.message}, спробую в наступному циклі`);
    else console.error(`${MODULE} |`, err);
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

// ----- Створення актора з апки -----
//
// Файл COMP/CON (у ньому лише цей мех) імпортує сама система Lancer: вона заповнює
// пілота (таланти, скіли, ліцензії, лоадаут) і створює меха з фреймом, зброєю й
// системами з компендіумів світу. Модуль лише називає актора, зв'язує пару з апкою і
// запускає синхронізацію, яка підтягує ХП, стрес, структуру, заряди й арти.

async function createFromApp(p, m) {
  if (!isSyncGM()) throw new Error('Створювати акторів може лише активний ГМ.');
  const Sheet = game.lancer?.applications?.LancerPilotSheet;
  if (typeof Sheet?.prototype?._onPilotJsonParsed !== 'function') {
    throw new Error('Система Lancer не має імпорту COMP/CON (потрібна Lancer 3.x).');
  }
  const { data } = await call({ action: 'profile', pilotId: p.id, mechId: m.id });
  const ccMechId = (data?.data ?? data)?.mechs?.[0]?.id;

  creating = true;
  let pilot;
  try {
    pilot = await Actor.create({
      name: profileActorName(p, m.id),
      type: 'pilot',
      flags: { [MODULE]: { pilotId: p.id, profileMechId: m.id } },
    });
    // Імпорт листа пілота без відкриття самого листа: метод бере лише this.actor і this.render.
    await Sheet.prototype._onPilotJsonParsed.call({ actor: pilot, render() {} }, JSON.stringify(data));

    const mech = game.actors.find((a) => a.type === 'mech' && ccMechId && get(a, 'system.lid') === ccMechId);
    if (mech) {
      // Новий зв'язок — стара база (якщо імпорт оновив уже наявного меха) не про нього.
      await mech.update({
        [`flags.${MODULE}.-=base`]: null,
        [`flags.${MODULE}.pilotId`]: p.id,
        [`flags.${MODULE}.mechId`]: m.id,
      }, SYNC_OPTION);
      const resets = mech.items.filter((i) => i.getFlag(MODULE, 'base') !== undefined)
        .map((i) => ({ _id: i.id, [`flags.${MODULE}.-=base`]: null }));
      if (resets.length) await mech.updateEmbeddedDocuments('Item', resets, SYNC_OPTION);
    }
    // Імпорт ставить ім'я з файлу — повертаємо наше.
    await pilot.update({ name: profileActorName(p, m.id) }, SYNC_OPTION);
    if (!mech) ui.notifications.warn(`Silent Stars: меха «${m.name}» не створено — перевірте, чи є його фрейм у компендіумах світу.`);
  } finally {
    creating = false;
  }
  await syncNow({ quiet: true });
  ui.notifications.info(`Silent Stars: створено «${pilot.name}».`);
  return pilot;
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
    actions: { syncNow: LinksApp.#onSyncNow, createActor: LinksApp.#onCreateActor },
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

  query = '';

  async _renderHTML() {
    const esc = foundry.utils.escapeHTML ?? ((s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;flex-direction:column;padding:8px;gap:6px';
    if (this.error) {
      div.innerHTML = `<p style="color:var(--color-level-error,#c00)">${esc(this.error)}</p>`;
      return div;
    }
    const byCallsign = (a, b) => String(a.callsign).localeCompare(String(b.callsign), 'en', { sensitivity: 'base', numeric: true });
    const pilots = [...(this.pilots || [])].sort(byCallsign);
    const none = `<option value="">— не зв'язано —</option>`;
    const pilotOpts = (sel) =>
      none + pilots.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.callsign)} (${esc(p.player || p.name)})</option>`).join('');
    // Мехи згруповані за пілотами апки; мехи пілота, з яким зв'язаний власник цього меха
    // у Foundry, — першими, бо майже завжди шукають саме серед них.
    const mechOpts = (sel, ownerAppId) => {
      const ordered = [...pilots.filter((p) => p.id === ownerAppId), ...pilots.filter((p) => p.id !== ownerAppId)];
      return none + ordered.filter((p) => p.mechs.length).map((p) =>
        `<optgroup label="${esc(p.callsign)}">` + p.mechs.map((m) => {
          const v = `${p.id}|${m.id}`;
          return `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(p.callsign)} / ${esc(m.name)}${m.frame ? ` (${esc(m.frame)})` : ''}</option>`;
        }).join('') + '</optgroup>').join('');
    };

    // «Є в апці, нема у Foundry»: мехи з файлом COMP/CON, ще не зв'язані з актором цього
    // світу, — під своїм пілотом, за алфавітом, кожен з кнопкою «Створити» (з файлу виходить
    // пара актор-пілот + мех). Після створення мех переходить у зв'язки вище.
    const linkedMechIds = new Set(mechActors().map((a) => flag(a, 'mechId')).filter(Boolean));
    const abc = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
    const createBody = [...pilots].sort((a, b) => abc(a.name || a.callsign, b.name || b.callsign))
      .map((p) => ({ p, mechs: p.mechs.filter((m) => m.hasProfile && !linkedMechIds.has(m.id)).sort((a, b) => abc(a.name, b.name)) }))
      .filter(({ mechs }) => mechs.length)
      .map(({ p, mechs }) => {
        const head = `<tr data-row data-name="${esc(`${p.name} ${p.callsign}`)}"><td colspan="2" style="padding:6px 6px 2px">` +
          `<strong>${esc(p.name || p.callsign)}</strong>${p.name && p.name !== p.callsign ? ` <span style="opacity:.6">${esc(p.callsign)}</span>` : ''}</td></tr>`;
        const rows = mechs.map((m) =>
          `<tr data-row data-name="${esc(`${m.name} ${m.frame || ''}`)}">` +
          `<td style="padding:2px 6px 2px 34px"><i class="fas fa-turn-up fa-rotate-90" style="opacity:.5;margin-right:6px"></i>` +
          `${esc(m.name)}${m.frame ? ` <span style="opacity:.6">(${esc(m.frame)})</span>` : ''}</td>` +
          `<td style="text-align:right;white-space:nowrap;padding:2px 6px">` +
          `<button type="button" data-action="createActor" data-pilot="${p.id}" data-mech="${m.id}" style="width:auto;line-height:1.6;padding:0 10px"><i class="fas fa-user-plus"></i> Створити</button></td></tr>`,
        ).join('');
        return `<tbody data-group data-section="create" style="border-top:1px solid rgba(127,127,127,.25)">${head}${rows}</tbody>`;
      })
      .join('');

    const cell = (actor, indent) =>
      `<td style="padding:2px 6px${indent ? ';padding-left:34px' : ''}">` +
      `${indent ? '<i class="fas fa-turn-up fa-rotate-90" style="opacity:.5;margin-right:6px"></i>' : ''}` +
      `<img src="${esc(actor.img)}" width="28" height="28" style="vertical-align:middle;border:none"> ${esc(actor.name)}</td>`;
    const pilotRow = (a) =>
      `<tr data-row data-name="${esc(a.name)}">${cell(a, false)}<td><select name="pilot.${a.id}">${pilotOpts(flag(a, 'pilotId'))}</select></td></tr>`;
    const mechRow = (a, ownerAppId, indent) => {
      const sel = flag(a, 'mechId') ? `${flag(a, 'pilotId')}|${flag(a, 'mechId')}` : '';
      return `<tr data-row data-name="${esc(a.name)}">${cell(a, indent)}<td><select name="mech.${a.id}">${mechOpts(sel, ownerAppId)}</select></td></tr>`;
    };

    const { groups, orphans } = groupActors(pilotActors(), mechActors());
    const body = groups.map((g) =>
      `<tbody data-group style="border-top:1px solid rgba(127,127,127,.25)">` +
      pilotRow(g.pilot) + g.mechs.map((m) => mechRow(m, flag(g.pilot, 'pilotId'), true)).join('') +
      '</tbody>').join('');
    // Мехи без пілота: кожен — окрема «група» з одного рядка, щоб пошук ховав їх поштучно.
    const lonely = orphans.map((m) => `<tbody data-group data-section="solo">${mechRow(m, null, false)}</tbody>`).join('');

    // Список має власну межу висоти (60% екрана) і прокручується сам: з десятками акторів
    // вікно інакше виростає за екран, а висоту вікна Foundry рахує по-своєму.
    div.innerHTML = `
      <p style="margin:0">Статус: ${esc(lastStatus)}</p>
      <input type="search" data-search placeholder="Пошук: пілот, мех або позивний в апці…" value="${esc(this.query)}">
      <div style="max-height:65vh;overflow-y:auto;padding-right:4px">
        <table style="margin:0">${body || '<tbody><tr><td>Немає акторів-пілотів</td></tr></tbody>'}</table>
        ${lonely ? `<h3 data-section-title="solo" style="margin-top:12px">Мехи без пілота у Foundry</h3><table style="margin:0">${lonely}</table>` : ''}
        ${createBody ? `<h3 data-section-title="create" style="margin-top:12px">Є в апці, нема у Foundry</h3><table style="margin:0">${createBody}</table>` : ''}
        <p data-empty style="display:none;opacity:.7">Нічого не знайдено.</p>
      </div>
      <p style="font-size:12px;opacity:.8;margin:0">Після зміни зв'язку перша синхронізація бере значення з апки.</p>
      <footer class="form-footer" style="display:flex;gap:8px">
        <button type="submit"><i class="fas fa-save"></i> Зберегти зв'язки</button>
        <button type="button" data-action="syncNow"><i class="fas fa-sync"></i> Синхронізувати зараз</button>
      </footer>`;
    return div;
  }

  // Пошук фільтрує вже намальовані рядки, без перемальовування: вибрані, але ще не збережені
  // зв'язки лишаються на місці. Шукає в імені актора і в підписі вибраного зв'язку.
  _onRender() {
    const root = this.element;
    const input = root.querySelector('[data-search]');
    if (!input) return;
    const apply = () => {
      this.query = input.value;
      let any = false;
      const sections = new Set(); // розділи, в яких лишилось хоч щось видиме
      for (const group of root.querySelectorAll('[data-group]')) {
        const rows = [...group.querySelectorAll('[data-row]')];
        const texts = rows.map((r) => `${r.dataset.name} ${r.querySelector('select')?.selectedOptions[0]?.text ?? ''}`);
        const m = matchGroup(texts, this.query);
        group.style.display = m.visible ? '' : 'none';
        rows.forEach((r, i) => { r.style.display = m.rows[i] ? '' : 'none'; });
        any ||= m.visible;
        if (m.visible && group.dataset.section) sections.add(group.dataset.section);
      }
      for (const title of root.querySelectorAll('[data-section-title]')) {
        title.style.display = sections.has(title.dataset.sectionTitle) ? '' : 'none';
      }
      root.querySelector('[data-empty]').style.display = any ? 'none' : '';
    };
    input.addEventListener('input', apply);
    // Enter у полі пошуку не має зберігати форму.
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    root.querySelectorAll('select').forEach((s) => s.addEventListener('change', apply));
    apply();
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
        // Ім'я профілю веде лише актор, створений з апки, і лише для свого пілота.
        ...(isPilot ? { [`flags.${MODULE}.-=profileMechId`]: null } : { [`flags.${MODULE}.mechId`]: mechId }),
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

  static async #onCreateActor(_event, target) {
    const { pilot: pilotId, mech: mechId } = target.dataset;
    const p = (this.pilots || []).find((x) => x.id === pilotId);
    const m = p?.mechs.find((x) => x.id === mechId);
    if (!m) return;
    target.disabled = true; // імпорт триває кілька секунд — без повторного натискання
    try {
      await createFromApp(p, m);
    } catch (err) {
      console.error(`${MODULE} |`, err);
      ui.notifications.error(`Silent Stars: ${err.message}`);
    }
    this.pilots = null;
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
  game.settings.register(MODULE, 'uploadArt', {
    name: 'Класти арти з апки в Data цього сервера',
    hint: 'Портрети й арти мехів завантажуються у Foundry за тим самим шляхом, що й на основному сервері. Потрібно для локальних серверів.',
    scope: 'world', config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE, 'artFiles', { scope: 'world', config: false, type: Object, default: {} });
  game.settings.register(MODULE, 'autoLink', {
    name: "Автоматично зв'язувати акторів",
    hint: 'Пілот — за позивним, мех — за назвою серед мехів свого пілота.',
    scope: 'world', config: true, type: Boolean, default: true,
  });
});

Hooks.once('ready', () => {
  game.modules.get(MODULE).api = {
    syncNow: () => syncNow({ quiet: false }),
    openLinks: () => new LinksApp().render(true),
    createFromApp,
  };
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
