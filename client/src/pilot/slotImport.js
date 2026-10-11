// Імпорт мехів з файлу COMP/CON у слоти ангару (чиста логіка — тестується простим `node`,
// див. slotImport.test.mjs).
//
// Ангар має слоти (1, з «Розширеним ангаром» — 2), а COMP/CON — ні: у файлі може бути
// скільки завгодно мехів. Тому імпорт — це розклад «який мех з файлу в який слот»:
//
//   assignment[i] — індекс меха з файлу для слота i, або null (слот не чіпаємо).
//
// Мех з файлу у слоті, де вже стоїть той самий мех (той самий ідентифікатор COMP/CON, а
// без нього — та сама назва), оновлює його: збірка з файлу, стан (HP, структура, заряди,
// зламане) лишається з апки (mergeMechState). Інший мех у зайнятому слоті замінює старого
// повністю — новий мех з новим id і повним станом. Порожній слот — просто додається.

import { mergeMechState } from './mechMerge.js';

const key = (s) => String(s || '').trim().toLowerCase();

export function sameMech(a, b) {
  if (!a || !b) return false;
  if (a.ccId && b.ccId) return a.ccId === b.ccId;
  return key(a.name) === key(b.name);
}

// Скільки слотів показувати: слоти ангару, але не менше, ніж уже є мехів (могли додати раніше).
export function slotCount(existing, slots) {
  return Math.max(slots || 1, (existing || []).length);
}

// Розклад за замовчуванням.
//   target — номер слота, з кнопки якого завантажено файл (null — кнопка профілю).
// Мех з файлу, що вже стоїть у якомусь слоті, оновлює свій слот; решта — у порожні слоти по
// черзі. З кнопки слота — у цей слот: той самий мех, якщо він є у файлі, інакше перший.
export function defaultAssignment(existing, slots, imported, target = null) {
  const n = slotCount(existing, slots);
  const a = Array(n).fill(null);
  const list = imported || [];
  if (target != null) {
    const same = list.findIndex((m) => sameMech(existing[target], m));
    a[target] = list.length ? (same >= 0 ? same : 0) : null;
    return a;
  }
  const used = new Set();
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

// Чи можна застосувати без питань: кожен мех з файлу має слот і нікого не замінює.
export function isObvious(existing, imported, assignment) {
  const placed = new Set(assignment.filter((j) => j != null));
  if (placed.size !== (imported || []).length) return false;
  return assignment.every((j, i) => j == null || !existing[i] || sameMech(existing[i], imported[j]));
}

// Застосування розкладу. Повертає мехи пілота після імпорту і що з кожним слотом сталося:
//   changes: [{ slot, kind: 'update' | 'replace' | 'add', mech, old? }]
// Помилка — рядок у error (один мех у двох слотах, однакові назви).
export function applyAssignment(existing, imported, assignment) {
  const seen = new Set();
  for (const j of assignment) {
    if (j == null) continue;
    if (seen.has(j)) return { error: `Мех «${imported[j].name}» обрано для кількох слотів.` };
    seen.add(j);
  }
  const mechs = [...(existing || [])];
  const changes = [];
  assignment.forEach((j, slot) => {
    if (j == null) return;
    const inc = imported[j];
    const old = mechs[slot];
    if (!old) {
      changes.push({ slot, kind: 'add', mech: inc });
      mechs[slot] = inc;
    } else if (sameMech(old, inc)) {
      const merged = mergeMechState(old, inc);
      changes.push({ slot, kind: 'update', mech: merged });
      mechs[slot] = merged;
    } else {
      changes.push({ slot, kind: 'replace', mech: inc, old });
      mechs[slot] = inc;
    }
  });
  const result = mechs.filter(Boolean);
  const names = new Set();
  for (const m of result) {
    if (names.has(key(m.name))) {
      return { error: `Два мехи з назвою «${m.name}». Назви мехів мають бути різні — перейменуйте меха в COMP/CON.` };
    }
    names.add(key(m.name));
  }
  return { mechs: result, changes };
}

// Файл COMP/CON для кожного меха, що потрапив у слот: увесь файл, але з лише цим мехом —
// з нього модуль Foundry створює актора.
export function profilesFor(changes, json) {
  const source = json?.data?.mechs || [];
  return changes.flatMap(({ mech }) => {
    const raw = source.find((m) => mech.ccId && m.id === mech.ccId) ||
      source.find((m) => key(m.name || m.frameData?.name) === key(mech.name));
    return raw ? [{ mechId: String(mech.id), data: { ...json, data: { ...json.data, mechs: [raw] } } }] : [];
  });
}

export function changesText(changes) {
  return changes.map((c) => {
    const n = `слот ${c.slot + 1}`;
    if (c.kind === 'add') return `${n}: + «${c.mech.name}»`;
    if (c.kind === 'update') return `${n}: оновлено «${c.mech.name}»`;
    return `${n}: «${c.old.name}» → «${c.mech.name}»`;
  }).join('; ');
}
