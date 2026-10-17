// ЗГЕНЕРОВАНО foundry-module/bundle-compcon.mjs з client/src/pilot — не редагувати вручну.
// client/src/pilot/compconLink.js
var EMPTY_LINK = { code: "", version: 0, acceptedAt: "", level: null, checkedAt: "", error: "" };
function wrapCloudPilot(data) {
  return { EXPORT_TYPE: "Save Pilot", data };
}
var LINK_FRESH_MS = 14 * 24 * 36e5;
var key = (s) => String(s || "").trim().toLowerCase();
var ROMAN = ["", "I", "II", "III"];
var talentLabel = (t) => `${t.name}${ROMAN[t.rank] ? ` ${ROMAN[t.rank]}` : ""}`;
function listDiff(before, after) {
  const count = (xs) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) || 0) + 1), /* @__PURE__ */ new Map());
  const b = count(before);
  const a = count(after);
  const add = [];
  const remove = [];
  const seenA = /* @__PURE__ */ new Map();
  for (const x of after) {
    const k = key(x);
    seenA.set(k, (seenA.get(k) || 0) + 1);
    if (seenA.get(k) > (b.get(k) || 0)) add.push(x);
  }
  const seenB = /* @__PURE__ */ new Map();
  for (const x of before) {
    const k = key(x);
    seenB.set(k, (seenB.get(k) || 0) + 1);
    if (seenB.get(k) > (a.get(k) || 0)) remove.push(x);
  }
  return { add, remove };
}
var names = (m, type) => (m?.items || []).filter((it) => it.type === type).map((it) => it.name);
var talents = (m) => (m?.build?.talents || []).map(talentLabel);
function mechDiff(old, inc) {
  const frame = (m) => [m?.frameSource, m?.frame].filter(Boolean).join(" ");
  const groups = [];
  const f0 = frame(old);
  const f1 = frame(inc);
  if (!old || key(f0) !== key(f1)) groups.push({ title: "\u0424\u0420\u0415\u0419\u041C", lines: [...old && f0 ? [{ sign: "\u2212", text: f0 }] : [], { sign: "+", text: f1 }] });
  for (const [title, get] of [["\u0417\u0411\u0420\u041E\u042F", (m) => names(m, "weapon")], ["\u0421\u0418\u0421\u0422\u0415\u041C\u0418", (m) => names(m, "system")], ["\u0422\u0410\u041B\u0410\u041D\u0422\u0418", talents]]) {
    const d = listDiff(old ? get(old) : [], get(inc));
    const lines = [...d.add.map((text2) => ({ sign: "+", text: text2 })), ...d.remove.map((text2) => ({ sign: "\u2212", text: text2 }))];
    if (lines.length) groups.push({ title, lines });
  }
  return groups;
}

// client/src/pilot/constants.js
var MAX_LL = 12;
function mechSlots(owned) {
  return 1 + ((owned?.parking || 0) >= 1 ? 1 : 0);
}
var PR_PACK_SIZE = 10;
var SHOP_DATA = [
  { key: "fullrepair", title: "\u041F\u043E\u0432\u043D\u0438\u0439 \u0440\u0435\u043C\u043E\u043D\u0442 / \u043F\u0435\u0440\u0435\u0434\u0440\u0443\u043A \u043C\u0435\u0445\u0430", price: 500, needsMech: true },
  { key: "core", title: "\u0417\u0430\u0440\u044F\u0434 Core Power", price: 250, needsMech: true },
  { key: "prpack", title: `Printer Requisition \xB7 ${PR_PACK_SIZE} \u0448\u0442`, price: 200, needsMech: false }
];

// stub:shopCatalog
var prStart = () => 0;

// client/src/pilot/logic.js
function pad(n) {
  return String(n).padStart(2, "0");
}
function nowTs() {
  const d = /* @__PURE__ */ new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function skillCapMax(ll, skillCapBonus) {
  return 6 + Math.max(0, ll - 2) + (skillCapBonus || 0);
}

// client/src/pilot/pilotDefaults.js
function pad2(n) {
  return String(n).padStart(2, "0");
}
function nowTs2() {
  const d = /* @__PURE__ */ new Date();
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function createDefaultPilotState() {
  return {
    // games — показане число зіграних ігор. Його не інкрементує ніхто вручну:
    // gm_close_game перераховує його як gamesBase + кількість закритих слотів, де
    // пілот був у затвердженому складі. gamesBase — ігри поза дошкою (до неї або
    // зараховані окремо), у нового пілота їх нуль.
    games: 0,
    gamesBase: 0,
    // Рівень ліцензії більше не виводиться з кількості ігор — він купується за ману
    // і зберігається окремо.
    ll: 2,
    status: "active",
    resourceMode: "full",
    // Особисті покращення: owned — придбані ({key: 1}); deposits — внесене частинами
    // в ще не придбані ({key: {mana, pr}}), списане з гаманця; policies — куплені й ще не
    // використані страхові поліси ({key: 1}).
    hangar: { owned: {}, deposits: {}, policies: {} },
    // Прив'язка до COMP/CON за share code (compconLink.js): код, прийнята версія, коли прийнято.
    compcon: { ...EMPTY_LINK },
    // Тір 1 стартує з готовим запасом PR (правила: «На старті кожен гравець вже має 30PR»).
    pr: prStart(),
    // Відкритість і вкладка магазину — стан інтерфейсу (ShopDrawer), у пілоті не зберігаються.
    shop: { error: "" },
    mana: {
      balance: 0,
      txOpen: false,
      txType: "deposit",
      amount: "",
      comment: "",
      target: "",
      error: "",
      history: []
    },
    stress: 0,
    // Базово 8; окремі bond powers цей ліміт змінюють, тому він редагований.
    stressMax: 8,
    // Burden-и не існують наперед — вони створюються, коли стрес перевищує ліміт
    // або коли їх записує гравець. Розмір задається порядковим номером, не вибором.
    burdens: [],
    // Стан «down and out»: знімається дією Get medical help, яка автоматично забирає
    // наступну щотижневу downtime-дію.
    downAndOut: false,
    bond: {
      archetype: "",
      xp: 0,
      powers: [],
      newPower: "",
      // Перший major ideal свій у кожного бонду — вводиться текстом, бо переліку бондів
      // у додатку немає. Два інші беруться з SHARED_MAJOR_IDEALS.
      majorIdealFirst: "",
      // Особиста ціль на гру, обирається перед грою.
      minorIdeal: "",
      // Що з ідеалів виконано за цю гру; наприкінці гри перетворюється на XP.
      marked: { major0: false, major1: false, major2: false, minor: false },
      // Сила з чужого бонду й бонусні сили за неї та за п'ять власних.
      foreignPower: "",
      veteranPower: "",
      masterPower: "",
      // Скільки разів лічильник XP скидався, поки бонд ще не обрано. При виборі бонду
      // кожен скид перетворюється на додаткову силу.
      deferredResets: 0,
      // Вибір бонду фіксується окремо від тексту архетипу, щоб сили нарахувались
      // рівно один раз, а не на кожне натискання клавіші в полі.
      confirmed: false,
      // Сили, на які гравець має право, але ще не назвав їх.
      powersOwed: 0,
      // Ідеали з імпорту COMP/CON: три major (перший — свій у кожного бонду) і варіанти
      // minor для select. Без імпорту пункти 2–3 беруться з SHARED_MAJOR_IDEALS.
      majorIdeals: [],
      minorIdeals: [],
      // Чекліст на гру (5 пунктів) і вибраний мінорний ідеал; TALLY XP перетворює
      // відмітки на XP.
      checks: [false, false, false, false, false],
      pick: 0,
      // «СКИНУТИ» Bond powers: скільки циклів XP уже не рахуються в лічильнику сил.
      powerOffset: 0
    },
    hp: { current: 6, max: 6 },
    downtime: { open: null, modifiers: {}, rolls: {} },
    downtimeCharges: { max: 1, used: 0 },
    weeklyCharges: { max: 1, used: 0 },
    skillTriggers: [],
    skillCapBonus: 0,
    skillDraft: { name: "", desc: "", level: 1 },
    // Придбані/створені резерви. gamesLeft null — резерв не згорає сам
    // (отриманий за Get Creative); число — скільки ігор він ще живе.
    reserves: [],
    // Склад рідкісних резервів: до VAULT_CAP штук, не згорають, доки їх не взяли
    // на місію. Наповнюється вручну — рідкісні видають як частину нагороди.
    vault: [],
    contacts: [],
    contactDraft: { name: "", circle: "", help: "", debt: "" },
    // Трекер Get Creative: один проєкт за раз, черги немає.
    // key — резерв, який будується; filled — заповнені секції лічильника.
    creative: { key: null, filled: 0, lastRoll: null },
    mechs: [],
    mechDraft: { name: "", hpMax: "", repairMax: "", frame: "" },
    llEdit: { open: false, ll: "" },
    levelUp: { open: false, mechId: null, allTalents: false, allLicenses: false, error: "" },
    mechEditId: null,
    mechEdit: { hpMax: "", repairMax: "", frame: "" },
    actionLog: [{ ts: nowTs2(), msg: "\u041F\u0456\u043B\u043E\u0442\u0430 \u0441\u0442\u0432\u043E\u0440\u0435\u043D\u043E." }],
    narrative: "",
    // Записник: окремі нотатки з тегом і прив'язкою до гри замість одного textarea.
    notes: [],
    notesMigrated: true
  };
}

// client/src/pilot/mechBonuses.js
var FALLBACK = {
  ms_personalizations: [{ id: "hp", val: 2 }],
  cb_reinforced_frame: [{ id: "hp", val: 5 }],
  cb_heatfall_coolant_system: [{ id: "overcharge", val: ["1", "1d3", "1d6", "1d6"] }]
};
var nameOf = (x) => x?.name || x?.data?.name || x?.id || "";
function bonusesOf(entry) {
  const d = entry?.data || entry;
  if (Array.isArray(d?.bonuses)) return d.bonuses;
  return FALLBACK[d?.id] || FALLBACK[entry?.id] || [];
}
function sources(pilot, mech) {
  const out = [];
  for (const cb of pilot?.core_bonuses || []) out.push({ name: nameOf(cb?.data || cb), bonuses: bonusesOf(cb) });
  const loadout = mech?.loadouts?.[mech?.active_loadout_index ?? 0];
  for (const sys of loadout?.systems || []) out.push({ name: nameOf(sys?.data || sys), bonuses: bonusesOf(sys) });
  for (const t of mech?.frameData?.traits || []) out.push({ name: nameOf(t), bonuses: bonusesOf(t) });
  for (const t of pilot?.talents || []) {
    const rank = Number(t?.rank) || 0;
    const ranks = (t?.data?.ranks || t?.ranks || []).slice(0, rank);
    for (const r of ranks) out.push({ name: nameOf(r) || nameOf(t?.data || t), bonuses: bonusesOf(r) });
  }
  return out.filter((s) => s.bonuses.length);
}
function numeric(val) {
  const n = typeof val === "number" ? val : typeof val === "string" && /^\s*[+-]?\d+\s*$/.test(val) ? Number(val) : NaN;
  return Number.isFinite(n) ? n : null;
}
function sumOf(list, id) {
  const parts = [];
  for (const s of list) {
    for (const b of s.bonuses) {
      if (b?.id !== id) continue;
      const v = numeric(b.val);
      if (v) parts.push({ name: s.name, val: v });
    }
  }
  return { total: parts.reduce((t, p) => t + p.val, 0), parts };
}
function overchargeSteps(list) {
  for (const s of list) {
    for (const b of s.bonuses) {
      if (b?.id === "overcharge" && Array.isArray(b.val) && b.val.length) {
        return { steps: b.val.map((v) => `+${String(v).toUpperCase()}`), name: s.name };
      }
    }
  }
  return null;
}
function mechBonuses(pilot, mech) {
  const list = sources(pilot, mech);
  return {
    hp: sumOf(list, "hp"),
    repcap: sumOf(list, "repcap"),
    overcharge: overchargeSteps(list)
  };
}
function bonusText(parts) {
  return parts.map((p) => `${p.val > 0 ? "+" : ""}${p.val} ${p.name}`).join(", ");
}

// client/src/pilot/compconImport.js
function tagValue(tags, id) {
  const t = (tags || []).find((t2) => t2.id === id);
  return t ? Number(t.val) || 0 : null;
}
function sumLimitedBonuses(container) {
  return (container?.bonuses || []).filter((b) => b?.id === "limited_bonus").reduce((total, b) => total + (Number(b.val) || 0), 0);
}
function limitedBonusFor(pilot, mech) {
  const eng = Number(pilot.mechSkills?.[3]) || 0;
  const fromEngineering = Math.floor(eng / 2);
  const fromCoreBonuses = (pilot.core_bonuses || []).reduce(
    (total, cb) => total + sumLimitedBonuses(cb?.data || cb),
    0
  );
  const fromFrame = (mech.frameData?.traits || []).reduce(
    (total, t) => total + sumLimitedBonuses(t),
    0
  );
  return { fromEngineering, fromCoreBonuses, fromFrame, total: fromEngineering + fromCoreBonuses + fromFrame };
}
function collectItems(mech, bonus = 0) {
  const results = [];
  const loadout = mech.loadouts?.[mech.active_loadout_index ?? 0];
  if (!loadout) return results;
  const push = (type, name, mount, tagMax, destroyed, lid) => {
    const item = { name, type, mount: (mount || "").toString().toUpperCase(), destroyed: !!destroyed };
    if (lid) item.lid = String(lid);
    if (tagMax) {
      const max = tagMax + bonus;
      Object.assign(item, { current: max, max, base: tagMax });
    }
    results.push(item);
  };
  (loadout.mounts || []).forEach((mount) => {
    (mount.slots || []).forEach((slot) => {
      const w = slot.weapon?.data;
      if (!w) return;
      push("weapon", w.name, w.mount || slot.size, tagValue(w.tags, "tg_limited"), slot.weapon?.destroyed, w.id);
    });
  });
  (loadout.systems || []).forEach((sys) => {
    const s = sys.data || sys;
    if (!s?.name) return;
    push("system", s.name, "", tagValue(s.tags, "tg_limited"), sys.destroyed, s.id);
  });
  return results;
}
function mapSkillTriggers(skills, cap) {
  const ranked = [...skills || []].filter((s) => s?.data?.name && s.rank > 0).sort((a, b) => b.rank - a.rank);
  const triggers = [];
  let used = 0;
  ranked.forEach((s, i) => {
    if (used >= cap) return;
    const level = clamp(s.rank, 1, 3);
    const fitted = Math.min(level, cap - used);
    if (fitted < 1) return;
    triggers.push({
      id: Date.now() + i,
      name: s.data.name,
      desc: (s.data.detail || s.data.description || "").slice(0, 140),
      level: fitted
    });
    used += fitted;
  });
  return triggers;
}
var text = (v) => typeof v === "string" ? v.replace(/<\/(li|p|div)>|<br\s*\/?>|<(ul|ol)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{2,}/g, "\n").trim() : "";
var nameOf2 = (x) => text(x?.data?.name) || text(x?.stub?.name) || text(x?.name) || text(x?.id).replace(/^(mf|cb|t)_/, "").replace(/_/g, " ").toUpperCase();
function mapPilotBuild(d) {
  const hase = d?.mechSkills || [];
  return {
    skills: ["HULL", "AGILITY", "SYSTEMS", "ENGINEERING"].map((name, i) => ({ name, value: Number(hase[i]) || 0 })),
    talents: (d?.talents || []).map((t) => {
      const rank = Number(t?.rank) || 0;
      const ranks = t?.data?.ranks || t?.ranks || [];
      return {
        name: nameOf2(t),
        rank,
        ranks: ranks.slice(0, rank).map((r) => ({ name: text(r?.name), desc: text(r?.description) }))
      };
    }).filter((t) => t.name && t.rank > 0),
    coreBonuses: (d?.core_bonuses || []).map((cb) => {
      const c = cb?.data || cb;
      return {
        name: nameOf2(cb),
        source: text(c?.source),
        desc: text(c?.effect) || text(c?.description)
      };
    }).filter((c) => c.name),
    licenses: (d?.licenses || []).map((l) => ({ name: nameOf2(l), rank: Number(l?.rank) || 0, source: text(l?.stub?.source) })).filter((l) => l.name).sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
  };
}
function mapMech(m, grit, hull, limitedBonus, build, bonuses) {
  const frameStats = m.frameData?.stats || {};
  const hpMax = (frameStats.hp || 10) + grit + 2 * hull + bonuses.hp.total;
  const repairMax = (frameStats.repcap || 0) + Math.floor(hull / 2) + bonuses.repcap.total;
  const liveHp = m.stats?.current?.hp;
  return {
    id: Date.now() + Math.floor(Math.random() * 1e3),
    name: m.name || m.frameData?.name || "\u041C\u0435\u0445",
    // Ідентифікатор меха в COMP/CON: за ним повторний імпорт відрізняє «той самий мех» від
    // іншого меха з такою ж назвою з іншого файлу (профілю).
    ccId: m.id || "",
    // The chassis, kept apart from the pilot's own name for it: a mech called "Godhammer"
    // is an IPS-N Tortuga, and which frame it is drives everything at the table.
    frame: m.frameData?.name || "",
    frameSource: m.frameData?.source || "",
    hpCurrent: liveHp > 0 ? liveHp : hpMax,
    hpMax,
    repairCurrent: repairMax,
    repairMax,
    structureFilled: 0,
    reactorFilled: 0,
    corePower: m.corePower ?? true,
    overcharge: 0,
    items: collectItems(m, limitedBonus),
    // Звідки взялись бонуси до HP і ремкомплектів — для підказки на картці меха.
    hpBonus: bonusText(bonuses.hp.parts),
    repairBonus: bonusText(bonuses.repcap.parts),
    // Власна драбина Overcharge (Heatfall Coolant System); null — звичайна OC_STEPS.
    ocSteps: bonuses.overcharge?.steps || null,
    ocSource: bonuses.overcharge?.name || "",
    // Збірка пілота з цього файлу: у COMP/CON скіли, таланти, кор-бонуси й ліцензії належать
    // пілоту, а не меху; кожен мех = окремий файл, тому зберігаємо їх на мехові.
    build
  };
}
function isCompconPilotExport(json) {
  return !!json && json.EXPORT_TYPE === "Save Pilot" && !!json.data;
}
function mapCompconPilot(json) {
  if (!isCompconPilotExport(json)) {
    throw new Error("\u0426\u0435 \u043D\u0435 \u0441\u0445\u043E\u0436\u0435 \u043D\u0430 \u0444\u0430\u0439\u043B \u0435\u043A\u0441\u043F\u043E\u0440\u0442\u0443 \u043F\u0456\u043B\u043E\u0442\u0430 \u0437 COMP/CON (Save Pilot).");
  }
  const d = json.data;
  const level = clamp(parseInt(d.level, 10) || 2, 2, MAX_LL);
  const bondData = d.bond?.data;
  const state = {
    ...createDefaultPilotState(),
    ll: level,
    status: d.status === "ACTIVE" ? "active" : "archive",
    stress: clamp(d.bond?.stress || 0, 0, 8),
    stressMax: 8,
    bond: {
      ...createDefaultPilotState().bond,
      archetype: bondData?.name || "",
      confirmed: !!bondData?.name,
      xp: Math.max(0, d.bond?.xp || 0),
      powers: (d.bond?.bondPowers || []).map((p) => p.name),
      majorIdeals: (bondData?.major_ideals || []).slice(0, 3),
      minorIdeals: (bondData?.minor_ideals || []).slice()
    },
    hp: {
      current: d.stats?.current?.hp || d.stats?.max?.hp || 6,
      max: d.stats?.max?.hp || 6
    },
    skillTriggers: mapSkillTriggers(d.skills, skillCapMax(level, 0)),
    mechs: (d.mechs || []).map(
      (m) => mapMech(m, d.stats?.max?.grit || 0, d.mechSkills?.[0] || 0, limitedBonusFor(d, m).total, mapPilotBuild(d), mechBonuses(d, m))
    ),
    actionLog: [
      { ts: nowTs(), msg: `\u0406\u043C\u043F\u043E\u0440\u0442\u043E\u0432\u0430\u043D\u043E \u0437 COMP/CON (${d.callsign || d.name || "\u043F\u0456\u043B\u043E\u0442"})` },
      // The bonus is written down per mech so a wrong cap can be traced to its source
      // instead of looking like the import inventing numbers.
      ...(d.mechs || []).map((m) => {
        const b = limitedBonusFor(d, m);
        return {
          ts: nowTs(),
          msg: `\u041B\u0456\u043C\u0456\u0442 \u0437\u0430\u0440\u044F\u0434\u0456\u0432 \xAB${m.name || m.frameData?.name || "\u043C\u0435\u0445"}\xBB: +${b.total} (ENG ${b.fromEngineering} \xB7 \u043A\u043E\u0440-\u0431\u043E\u043D\u0443\u0441\u0438 ${b.fromCoreBonuses} \xB7 \u0444\u0440\u0435\u0439\u043C ${b.fromFrame})` + (b.total === 0 ? " \u2014 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C\u0438 \u0432\u0440\u0443\u0447\u043D\u0443" : "")
        };
      }),
      // Бонуси до HP / ремкомплектів / Overcharge — щоб сума не виглядала вигаданою.
      ...(d.mechs || []).flatMap((m) => {
        const b = mechBonuses(d, m);
        const parts = [
          b.hp.parts.length && `HP ${bonusText(b.hp.parts)}`,
          b.repcap.parts.length && `\u0440\u0435\u043C\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u0438 ${bonusText(b.repcap.parts)}`,
          b.overcharge && `Overcharge ${b.overcharge.steps.join(" \u2192 ")} (${b.overcharge.name})`
        ].filter(Boolean);
        return parts.length ? [{ ts: nowTs(), msg: `\u0411\u043E\u043D\u0443\u0441\u0438 \xAB${m.name || m.frameData?.name || "\u043C\u0435\u0445"}\xBB: ${parts.join(" \xB7 ")}` }] : [];
      })
    ]
  };
  return {
    name: (d.name || d.callsign || "\u041F\u0456\u043B\u043E\u0442").trim(),
    callsign: (d.callsign || d.name || "PILOT").trim(),
    background: (d.background || "").trim() || "\u0411\u0435\u043A\u0433\u0440\u0430\u0443\u043D\u0434 \u043D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E.",
    state
  };
}

// client/src/pilot/mechMerge.js
var limited = (it) => !!it && it.max != null;
var norm = (s) => String(s || "").trim().toLowerCase();
var isSpent = (it) => !!it && (!!it.destroyed || limited(it) && it.current < it.max);
function take(pool, it) {
  const byLid = it.lid ? pool.find((p) => !p.used && p.item.lid && p.item.lid === it.lid) : null;
  const found = byLid || pool.find((p) => !p.used && !(it.lid && p.item.lid) && p.item.type === it.type && norm(p.item.name) === norm(it.name));
  if (found) found.used = true;
  return found ? found.item : null;
}
var clamp2 = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var num = (v, fallback) => Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : fallback;
function mergeMechState(old, inc) {
  const pool = (old.items || []).map((item) => ({ item, used: false }));
  const items = (inc.items || []).map((it) => {
    const o = take(pool, it);
    if (!o) return it;
    const out = { ...it, destroyed: !!(o.destroyed || it.destroyed) };
    if (limited(it)) out.current = clamp2(limited(o) ? o.current : it.max, 0, it.max);
    return out;
  });
  const dropped = pool.filter((p) => !p.used && isSpent(p.item)).map((p) => ({ ...p.item, retained: true }));
  for (const it of dropped) {
    const at = it.type === "weapon" ? items.map((x) => x.type === "weapon").lastIndexOf(true) + 1 : items.length;
    items.splice(at, 0, it);
  }
  return {
    ...old,
    ...inc,
    id: old.id,
    ccId: inc.ccId || old.ccId || "",
    hpCurrent: clamp2(num(old.hpCurrent, inc.hpCurrent), 0, inc.hpMax),
    repairCurrent: clamp2(num(old.repairCurrent, inc.repairCurrent), 0, inc.repairMax),
    structureFilled: num(old.structureFilled, inc.structureFilled),
    reactorFilled: num(old.reactorFilled, inc.reactorFilled),
    overcharge: num(old.overcharge, inc.overcharge),
    corePower: old.corePower ?? inc.corePower,
    items
  };
}

// client/src/pilot/slotImport.js
var key2 = (s) => String(s || "").trim().toLowerCase();
function sameMech(a, b) {
  if (!a || !b) return false;
  if (a.ccId && b.ccId) return a.ccId === b.ccId;
  return key2(a.name) === key2(b.name);
}
function slotCount(existing, slots) {
  return Math.max(slots || 1, (existing || []).length);
}
function defaultAssignment(existing, slots, imported, target = null) {
  const n = slotCount(existing, slots);
  const a = Array(n).fill(null);
  const list = imported || [];
  if (target != null) {
    const same = list.findIndex((m) => sameMech(existing[target], m));
    a[target] = list.length ? same >= 0 ? same : 0 : null;
    return a;
  }
  const used = /* @__PURE__ */ new Set();
  for (let i = 0; i < n; i++) {
    const j = list.findIndex((m, k) => !used.has(k) && sameMech(existing[i], m));
    if (j >= 0) {
      a[i] = j;
      used.add(j);
    }
  }
  for (let i = 0; i < n; i++) {
    if (a[i] != null || existing[i]) continue;
    const j = list.findIndex((_, k) => !used.has(k));
    if (j < 0) break;
    a[i] = j;
    used.add(j);
  }
  return a;
}
function isObvious(existing, imported, assignment) {
  const placed = new Set(assignment.filter((j) => j != null));
  if (placed.size !== (imported || []).length) return false;
  return assignment.every((j, i) => j == null || !existing[i] || sameMech(existing[i], imported[j]));
}
function applyAssignment(existing, imported, assignment) {
  const seen = /* @__PURE__ */ new Set();
  for (const j of assignment) {
    if (j == null) continue;
    if (seen.has(j)) return { error: `\u041C\u0435\u0445 \xAB${imported[j].name}\xBB \u043E\u0431\u0440\u0430\u043D\u043E \u0434\u043B\u044F \u043A\u0456\u043B\u044C\u043A\u043E\u0445 \u0441\u043B\u043E\u0442\u0456\u0432.` };
    seen.add(j);
  }
  const mechs = [...existing || []];
  const changes = [];
  assignment.forEach((j, slot) => {
    if (j == null) return;
    const inc = imported[j];
    const old = mechs[slot];
    if (!old) {
      changes.push({ slot, kind: "add", mech: inc });
      mechs[slot] = inc;
    } else if (sameMech(old, inc)) {
      const merged = mergeMechState(old, inc);
      changes.push({ slot, kind: "update", mech: merged });
      mechs[slot] = merged;
    } else {
      changes.push({ slot, kind: "replace", mech: inc, old });
      mechs[slot] = inc;
    }
  });
  const result = mechs.filter(Boolean);
  const names2 = /* @__PURE__ */ new Set();
  for (const m of result) {
    if (names2.has(key2(m.name))) {
      return { error: `\u0414\u0432\u0430 \u043C\u0435\u0445\u0438 \u0437 \u043D\u0430\u0437\u0432\u043E\u044E \xAB${m.name}\xBB. \u041D\u0430\u0437\u0432\u0438 \u043C\u0435\u0445\u0456\u0432 \u043C\u0430\u044E\u0442\u044C \u0431\u0443\u0442\u0438 \u0440\u0456\u0437\u043D\u0456 \u2014 \u043F\u0435\u0440\u0435\u0439\u043C\u0435\u043D\u0443\u0439\u0442\u0435 \u043C\u0435\u0445\u0430 \u0432 COMP/CON.` };
    }
    names2.add(key2(m.name));
  }
  return { mechs: result, changes };
}
function profilesFor(changes, json) {
  const source = json?.data?.mechs || [];
  return changes.flatMap(({ mech }) => {
    const raw = source.find((m) => mech.ccId && m.id === mech.ccId) || source.find((m) => key2(m.name || m.frameData?.name) === key2(mech.name));
    return raw ? [{ mechId: String(mech.id), data: { ...json, data: { ...json.data, mechs: [raw] } } }] : [];
  });
}
function changesText(changes) {
  return changes.map((c) => {
    const n = `\u0441\u043B\u043E\u0442 ${c.slot + 1}`;
    if (c.kind === "add") return `${n}: + \xAB${c.mech.name}\xBB`;
    if (c.kind === "update") return `${n}: \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043E \xAB${c.mech.name}\xBB`;
    return `${n}: \xAB${c.old.name}\xBB \u2192 \xAB${c.mech.name}\xBB`;
  }).join("; ");
}
export {
  applyAssignment,
  changesText,
  defaultAssignment,
  isObvious,
  mapCompconPilot,
  mechDiff,
  mechSlots,
  profilesFor,
  wrapCloudPilot
};
