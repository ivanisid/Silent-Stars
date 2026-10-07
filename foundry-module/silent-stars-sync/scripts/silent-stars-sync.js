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
  mergeFields, mergeGroup, mergeLimited, mergeDestroyed, combineItemUpdates, mechMaxPatch, pilotIdentityUpdate, artUpdate,
  findAppPilotFor, findAppMechFor, profileActorName, matchGroup, suggestActors, resolveLinks, pendingMechs,
  idleDecision, isFreshCreating,
} from './sync.js';

const DEFAULT_URL = 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/foundry-sync';
const SYNC_OPTION = { [MODULE]: true }; // позначка наших власних оновлень — не реагувати на них

let timer = null;
let pending = null;
let running = false;
let creating = false; // поки імпорт створює актора, цикл не чіпає напівготові дані
let lastStatus = 'ще не запускалась';
// Для пропуску холостих циклів (див. idleDecision у sync.js).
let lastFingerprint = null;
let idleSkips = 0;
let needFull = false;

const setting = (k) => game.settings.get(MODULE, k);
const isSyncGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
const pilotActors = () => game.actors.filter((a) => a.type === 'pilot');
const mechActors = () => game.actors.filter((a) => a.type === 'mech');
const flag = (doc, k) => doc.getFlag(MODULE, k);

// Актори, яких цикл синхронізації не чіпає, бо їх зараз створює імпорт (з будь-якого браузера
// ГМа): сам актор-пілот і мехи, що належать йому. Вікно зв'язків бачить усіх — інакше мех
// виглядав би «ще не створеним», і друге «Створити» зробило б дубль.
const isCreatingActor = (a) => isFreshCreating(flag(a, 'creating'));
const syncPilotActors = () => pilotActors().filter((a) => !isCreatingActor(a));
const syncMechActors = () => mechActors().filter((a) => {
  const owner = get(a, 'system.pilot.value');
  return !(owner && typeof owner.getFlag === 'function' && isCreatingActor(owner));
});

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
  for (const actor of syncPilotActors()) {
    if (flag(actor, 'pilotId')) continue;
    const p = findAppPilotFor(actor, appPilots, linkedPilots);
    if (!p) continue;
    linkedPilots.add(p.id);
    await actor.setFlag(MODULE, 'pilotId', p.id);
    console.log(`${MODULE} | зв'язано пілота ${actor.name} ↔ ${p.callsign}`);
  }

  const byId = new Map(appPilots.map((p) => [p.id, p]));
  const linkedMechs = new Set(mechActors().map((a) => flag(a, 'mechId')).filter(Boolean));
  for (const actor of syncMechActors()) {
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

// idle: цикл таймера — спершу легкий ping, повний pull лише коли в апці щось змінилось.
// Зміни у Foundry (хуки) і кнопка ручної синхронізації завжди роблять повний цикл.
export async function syncNow({ quiet = true, idle = false } = {}) {
  if (!isSyncGM()) return;
  if (running || creating) return;
  running = true;
  try {
    if (idle && lastFingerprint) {
      // Функція без ping (стара версія) чи збій ping — просто повний pull.
      const fp = await call({ action: 'ping' }).then((r) => r.fingerprint, () => null);
      if (idleDecision({ last: lastFingerprint, fp, skips: idleSkips, needFull }) === 'skip') {
        idleSkips++;
        lastStatus = `${new Date().toLocaleTimeString()} — без змін в апці`;
        return;
      }
    }
    const { pilots, fingerprint } = await call({ action: 'pull' });
    lastFingerprint = fingerprint || null;
    idleSkips = 0;
    needFull = true; // до кінця циклу: впаде — наступний також повний
    // Помилка на одному акторі (буває, що її кидає сама система Lancer у відповідь на
    // оновлення) не зупиняє решту: її видно в статусі з іменем актора, деталі — у консолі.
    const failures = [];
    const guard = async (label, fn) => {
      try {
        await fn();
      } catch (err) {
        failures.push(`${label}: ${err.message}`);
        console.error(`${MODULE} | ${label}:`, err);
      }
    };
    if (setting('autoLink')) await guard("автозв'язування", () => autoLink(pilots));
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
    for (const actor of syncPilotActors()) {
      const id = flag(actor, 'pilotId');
      if (!byId.has(id)) continue;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(actor);
    }
    for (const [id, actors] of groups) {
      const p = byId.get(id);
      await guard(actors.map((a) => a.name).join(', '), async () => {
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
          actors.forEach((actor, i) => push.after.push([actor.name, () => setBase(actor, r.baseAfterPush[i])]));
        }
        conflicts.push(...r.conflicts.map((c) => `${p.callsign}: ${c}`));
      });
    }

    for (const actor of syncMechActors()) {
      const p = byId.get(flag(actor, 'pilotId'));
      const m = p?.mechs.find((x) => x.id === flag(actor, 'mechId'));
      if (!m) continue;
      await guard(actor.name, async () => {
        const appTime = Date.parse(p.updatedAt) || 0;
        await ensureArtSafe(m.art, m.artId);

        const r = mergeFields(MECH_FIELDS, m, actor, appTime);
        const update = { ...artUpdate(m.art, actor), ...(r.update || {}) };
        if (Object.keys(update).length) await actor.update(update, SYNC_OPTION);

        const lim = mergeLimited(m, actor.items.contents, appTime);
        const des = mergeDestroyed(m, actor.items.contents, appTime);
        const itemUpdates = combineItemUpdates(lim.itemUpdates, des.itemUpdates);
        if (itemUpdates.length) await actor.updateEmbeddedDocuments('Item', itemUpdates, SYNC_OPTION);

        const mechPatch = { ...mechMaxPatch(m, actor), ...r.patch };
        if (Object.keys(lim.patch).length) mechPatch.limited = lim.patch;
        if (Object.keys(des.patch).length) mechPatch.destroyed = des.patch;
        if (Object.keys(mechPatch).length) {
          const push = pushFor(p);
          push.mechs[m.id] = mechPatch;
          push.after.push([actor.name, () => setBase(actor, r.baseAfterPush)]);
          for (const { item, value } of lim.baseAfterPush) {
            push.after.push([actor.name, () => item.update({ [`flags.${MODULE}.base`]: value }, SYNC_OPTION)]);
          }
          for (const { item, value } of des.baseAfterPush) {
            push.after.push([actor.name, () => item.update({ [`flags.${MODULE}.baseDestroyed`]: value }, SYNC_OPTION)]);
          }
        }
        conflicts.push(...[...r.conflicts, ...lim.conflicts, ...des.conflicts].map((c) => `${p.callsign} / ${m.name}: ${c}`));
      });
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
          for (const [label, fn] of push.after) await guard(label, fn);
        } else if (res.conflict) {
          stale++; // пілота щойно змінили в апці — наступний цикл зведе вже свіжі дані
        } else {
          console.warn(`${MODULE} | push ${res.pilotId}: ${res.error}`);
        }
      }
    }

    // Цикл дійшов до кінця без помилок і відкладених push — наступний холостий можна пропускати.
    needFull = failures.length > 0 || stale > 0;
    if (conflicts.length) console.warn(`${MODULE} | змінено з обох боків, взято новіше:`, conflicts);
    lastStatus = `${new Date().toLocaleTimeString()} — у апку: ${sent} змін${stale ? `, ${stale} відкладено` : ''}` +
      (failures.length ? ` · помилки (${failures.length}): ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '…' : ''}` : '');
    if (!quiet) ui.notifications[failures.length ? 'warn' : 'info'](`Silent Stars: синхронізовано. ${lastStatus}`);
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
  timer = setInterval(() => syncNow({ idle: true }), sec * 1000);
  syncNow();
}

// ----- Створення актора з апки -----
//
// Файл COMP/CON (у ньому лише цей мех) імпортує сама система Lancer: вона заповнює
// пілота (таланти, скіли, ліцензії, лоадаут) і створює меха з фреймом, зброєю й
// системами з компендіумів світу. Модуль лише називає актора, зв'язує пару з апкою і
// запускає синхронізацію, яка підтягує ХП, стрес, структуру, заряди й арти.

async function createFromApp(p, m) {
  if (!game.user.isGM) throw new Error('Створювати акторів можуть лише ГМи.');
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
      // creating — щоб цикл активного ГМа (інший браузер) не підхопив напівготового актора.
      flags: { [MODULE]: { pilotId: p.id, profileMechId: m.id, creating: Date.now() } },
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
    // Без SYNC_OPTION — навмисно: хук оновлення в браузері активного ГМа (інший, ніж цей) запустить
    // повну синхронізацію за 3 с. З нею ping не бачив би змін в апці, і новий актор чекав би цикл-другий.
    if (pilot) await pilot.update({ [`flags.${MODULE}.-=creating`]: null }).catch((err) => console.warn(`${MODULE} |`, err));
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
    position: { width: 760, height: 'auto' },
    form: { handler: LinksApp.#onSubmit, closeOnSubmit: false },
    actions: { syncNow: LinksApp.#onSyncNow, createActors: LinksApp.#onCreateActors },
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

    // Вікно йде від апки: пілоти апки за алфавітом (архівні — в кінці), під кожним його
    // мехи; для пілота й кожного меха — вибір актора Foundry. У списку вибору «схожі»
    // актори першими. Під пілотом — «Створити актора/акторів» з файлів COMP/CON.
    const abc = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
    const label = (p) => p.name || p.callsign;
    // Акаунти апки за алфавітом (пілоти без акаунту — в кінці), під кожним його пілоти.
    const account = (p) => p.player || '';
    const pilots = [...(this.pilots || [])].sort((a, b) =>
      (!account(a) - !account(b)) || abc(account(a), account(b)) ||
      ((a.status === 'archive') - (b.status === 'archive')) || abc(label(a), label(b)));
    const byPilotId = new Map(pilots.map((p) => [p.id, p]));
    const pActors = pilotActors();
    const mActors = mechActors();
    const asLink = (a) => ({ pilotId: flag(a, 'pilotId'), mechId: flag(a, 'mechId') });
    const pLinks = pActors.map(asLink);
    const mLinks = mActors.map(asLink);

    const linkNote = (a, ownPilotId) => {
      const other = flag(a, 'pilotId');
      return other && other !== ownPilotId && byPilotId.has(other) ? ` · ↔ ${byPilotId.get(other).callsign}` : '';
    };
    const options = (actors, hints, preferred, selected, ownPilotId, suffix = () => '') => {
      const { similar, others } = suggestActors(actors, hints, preferred);
      const opt = (a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}${esc(suffix(a))}${esc(linkNote(a, ownPilotId))}</option>`;
      return (similar.length ? `<optgroup label="Схожі">${similar.map(opt).join('')}</optgroup>` : '') +
        (others.length ? `<optgroup label="Інші">${others.map(opt).join('')}</optgroup>` : '');
    };
    const select = (name, emptyText, opts) =>
      `<select name="${name}" style="width:100%"><option value="">${emptyText}</option>${opts}</select>`;
    const ownerName = (mech) => get(mech, 'system.pilot.value')?.name;
    // Мініатюра: арт з апки (шлях у Data), якщо його ще немає на цьому сервері — арт
    // зв'язаного актора, далі — стандартна іконка.
    const thumb = (src, fallback, size) => {
      const alt = fallback || 'icons/svg/mystery-man.svg';
      return `<img src="${esc(src || alt)}" data-fallback="${esc(alt)}" width="${size}" height="${size}" ` +
        `style="vertical-align:middle;border:none;object-fit:cover;margin-right:6px;flex:0 0 auto" ` +
        `onerror="if(this.src!==this.dataset.fallback){this.src=this.dataset.fallback}">`;
    };

    let lastAccount = null;
    let accountIndex = -1;
    const body = pilots.map((p) => {
      // Заголовок акаунту перед першим його пілотом; data-acc зв'язує його з групами пілотів,
      // щоб пошук ховав і заголовок, коли під ним нічого не лишилось.
      let accountHead = '';
      if (account(p) !== lastAccount) {
        lastAccount = account(p);
        accountIndex++;
        accountHead = `<tbody data-acc-head="${accountIndex}"><tr><td colspan="2" style="padding:12px 6px 4px;font-size:15px;font-weight:bold;` +
          `border-bottom:2px solid rgba(127,127,127,.45)"><i class="fas fa-user" style="opacity:.6;margin-right:6px"></i>${esc(account(p) || 'Без акаунту')}</td></tr></tbody>`;
      }
      const linkedPilots = pActors.filter((a) => flag(a, 'pilotId') === p.id);
      const preferredPilots = new Set(linkedPilots.map((a) => a.id));
      // Кілька мехів — кілька профілів: кожен може мати свого актора-пілота, тож лишаємо
      // порожній вибір, щоб додати ще одного.
      const slots = [...linkedPilots.map((a) => a.id), ...(!linkedPilots.length || p.mechs.length > 1 ? [''] : [])];
      const pilotSelects = slots.map((sel, i) => select(`p:${p.id}:${i}`, sel || !i ? "— не зв'язано —" : '+ ще актор-пілот',
        options(pActors, [p.name, p.callsign], preferredPilots, sel, p.id))).join('');
      const head = `<tr data-row data-name="${esc(`${p.name} ${p.callsign}`)}"><td style="padding:6px 6px 2px;vertical-align:top">` +
        `${thumb(p.portrait, linkedPilots[0]?.img, 32)}<strong>${esc(label(p))}</strong>${p.name && p.name !== p.callsign ? ` <span style="opacity:.6">${esc(p.callsign)}</span>` : ''}` +
        `${p.status === 'archive' ? ' <span style="opacity:.6">(архів)</span>' : ''}</td>` +
        `<td style="padding:4px 6px;display:flex;flex-direction:column;gap:4px">${pilotSelects}</td></tr>`;

      const pilotActorIds = new Set(linkedPilots.map((a) => a.id));
      const mechRows = [...p.mechs].sort((a, b) => abc(a.name, b.name)).map((m) => {
        const current = mActors.find((a) => flag(a, 'pilotId') === p.id && flag(a, 'mechId') === m.id);
        const preferred = new Set(mActors.filter((a) => pilotActorIds.has(get(a, 'system.pilot.value')?.id)).map((a) => a.id));
        if (current) preferred.add(current.id);
        return `<tr data-row data-name="${esc(`${m.name} ${m.frame || ''}`)}">` +
          `<td style="padding:2px 6px 2px 28px"><i class="fas fa-turn-up fa-rotate-90" style="opacity:.5;margin-right:6px"></i>` +
          `${thumb(m.art, current?.img, 24)}${esc(m.name)}${m.frame ? ` <span style="opacity:.6">(${esc(m.frame)})</span>` : ''}</td>` +
          `<td style="padding:2px 6px">${select(`m:${p.id}:${m.id}`, "— не зв'язано —",
            options(mActors, [m.name], preferred, current?.id, p.id, (a) => (ownerName(a) ? ` — ${ownerName(a)}` : '')))}</td></tr>`;
      }).join('');

      const withFile = p.mechs.filter((m) => m.hasProfile);
      const pending = pendingMechs(p, pLinks, mLinks);
      const createCell = !withFile.length
        ? '<span style="opacity:.5;font-size:12px">Створити акторів: гравець не завантажив файл COMP/CON</span>'
        : !pending.length
          ? '<span style="opacity:.6;font-size:12px"><i class="fas fa-check"></i> усі мехи з файлом уже у Foundry</span>'
          : `<button type="button" data-action="createActors" data-pilot="${p.id}" style="width:auto;line-height:1.6;padding:0 10px">` +
            `<i class="fas fa-user-plus"></i> ${pending.length > 1 ? `Створити акторів (${pending.length})` : 'Створити актора'}</button>`;
      const create = `<tr><td colspan="2" style="text-align:right;padding:2px 6px 6px">${createCell}</td></tr>`;

      return `${accountHead}<tbody data-group data-acc="${accountIndex}" style="border-top:1px solid rgba(127,127,127,.25)">${head}${mechRows}${create}</tbody>`;
    }).join('');

    // Список має власну межу висоти і прокручується сам: з десятками пілотів вікно інакше
    // виростає за екран, а висоту вікна Foundry рахує по-своєму.
    div.innerHTML = `
      <p style="margin:0">Статус: ${esc(lastStatus)}</p>
      <input type="search" data-search placeholder="Пошук: пілот, позивний, мех або актор…" value="${esc(this.query)}">
      <div style="max-height:65vh;overflow-y:auto;padding-right:4px">
        <table style="margin:0;table-layout:fixed;width:100%"><colgroup><col style="width:42%"><col></colgroup>
          ${body || '<tbody><tr><td colspan="2">В апці ще немає пілотів.</td></tr></tbody>'}</table>
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
  // зв'язки лишаються на місці. Шукає в імені пілота/меха апки і в іменах вибраних акторів.
  _onRender() {
    const root = this.element;
    const input = root.querySelector('[data-search]');
    if (!input) return;
    const apply = () => {
      this.query = input.value;
      let any = false;
      for (const group of root.querySelectorAll('[data-group]')) {
        const rows = [...group.querySelectorAll('[data-row]')];
        const texts = rows.map((r) => `${r.dataset.name} ${[...r.querySelectorAll('select')].map((s) => (s.value ? s.selectedOptions[0]?.text : '')).join(' ')}`);
        const m = matchGroup(texts, this.query);
        group.style.display = m.visible ? '' : 'none';
        rows.forEach((r, i) => { r.style.display = m.rows[i] ? '' : 'none'; });
        any ||= m.visible;
      }
      for (const head of root.querySelectorAll('[data-acc-head]')) {
        const shown = [...root.querySelectorAll(`[data-group][data-acc="${head.dataset.accHead}"]`)].some((g) => g.style.display !== 'none');
        head.style.display = shown ? '' : 'none';
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
    const pilotChoices = [];
    const mechChoices = [];
    for (const [key, value] of Object.entries(formData.object)) {
      const [kind, pilotId, rest] = key.split(':');
      if (kind === 'p') pilotChoices.push([pilotId, value || '']);
      else if (kind === 'm') mechChoices.push([pilotId, rest, value || '']);
    }
    const asLink = (a) => ({ id: a.id, pilotId: flag(a, 'pilotId') ?? null, mechId: flag(a, 'mechId') ?? null });
    const appPilotIds = new Set((this.pilots || []).map((p) => p.id));
    const changes = resolveLinks({ pilotChoices, mechChoices }, pilotActors().map(asLink), mechActors().map(asLink), appPilotIds);

    for (const c of changes) {
      const actor = game.actors.get(c.actorId);
      if (!actor) continue;
      // Новий зв'язок — стара база не про нього; ім'я профілю веде лише актор, створений з апки.
      await actor.update({
        [`flags.${MODULE}.-=base`]: null,
        [`flags.${MODULE}.pilotId`]: c.pilotId,
        ...(c.type === 'pilot' ? { [`flags.${MODULE}.-=profileMechId`]: null } : { [`flags.${MODULE}.mechId`]: c.mechId }),
      }, SYNC_OPTION);
      if (c.type === 'mech') {
        const resets = actor.items.filter((i) => i.getFlag(MODULE, 'base') !== undefined)
          .map((i) => ({ _id: i.id, [`flags.${MODULE}.-=base`]: null }));
        if (resets.length) await actor.updateEmbeddedDocuments('Item', resets, SYNC_OPTION);
      }
    }
    ui.notifications.info(`Silent Stars: зв'язки збережено${changes.length ? ` (змін: ${changes.length})` : ''}.`);
    this.render();
  }

  // Пари актор-пілот + мех для всіх мехів пілота з файлом COMP/CON, яких ще немає у світі.
  static async #onCreateActors(_event, target) {
    const p = (this.pilots || []).find((x) => x.id === target.dataset.pilot);
    if (!p) return;
    const asLink = (a) => ({ pilotId: flag(a, 'pilotId'), mechId: flag(a, 'mechId') });
    const pending = pendingMechs(p, pilotActors().map(asLink), mechActors().map(asLink));
    target.disabled = true; // імпорт триває кілька секунд — без повторного натискання
    for (const m of pending) {
      try {
        await createFromApp(p, m);
      } catch (err) {
        console.error(`${MODULE} |`, err);
        ui.notifications.error(`Silent Stars: ${m.name}: ${err.message}`);
      }
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

// Кнопка вікна зв'язків у вкладці налаштувань гри на бічній панелі (лише ГМу) — щоб не
// шукати модуль у списку налаштувань щоразу. Стає після стандартних кнопок налаштувань
// чи модулів; якщо розмітка вкладки інша — у кінець вкладки.
Hooks.on('renderSettings', (_app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(`[data-ss-links]`)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.ssLinks = '';
  button.innerHTML = `<i class="fas fa-link"></i> <span>Silent Stars: зв'язки</span>`;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    new LinksApp().render(true);
  });
  const anchor = root.querySelector('[data-action="modules"], [data-action="configure"], button[data-tab="modules"]');
  if (anchor) anchor.after(button);
  else root.append(button);
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
