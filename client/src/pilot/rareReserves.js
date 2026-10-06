// Каталог рідкісних резервів. Живе в базі (таблиці rare_reserves, reserve_tags,
// rare_reserve_tags — див. 20261006_rare_reserves_catalog.sql): ГМ редагує й додає
// резерви та вішає на них теги, передусім теги фракцій. Початковий вміст перенесено
// з таблиці «HB резерви»: Аркуш1 — ранг 1, Аркуш2 — ранг 2.
//
// Ці резерви не купуються. Вони потрапляють до пілота як частина нагороди за місію
// й лежать на складі (до VAULT_CAP), доки їх не візьмуть на місію, де вони згорять.
//
// Редюсер шукає резерви синхронно (rareReserveByKey), тож каталог тримається в модулі
// й вантажиться один раз на сесію; компоненти підписуються через useRareCatalog і
// перемальовуються, коли він прийшов або ГМ його змінив.
//
// Приховані (archived) резерви лишаються в каталозі: на них можуть посилатися склади
// пілотів, тож назва має знаходитись. З вибору й довідника їх прибирають компоненти.
//
// traits — механічні мітки з таблиці («Limited 1», «1/round»), tagIds — теги-мітки ГМа.

import { useEffect, useSyncExternalStore } from 'react';
import { RESERVES } from './reserves';
import { api } from '../api';

export const RARE_RANKS = [1, 2];

export const TAG_KINDS = [
  { key: 'faction', label: 'ФРАКЦІЯ' },
  { key: 'other', label: 'ІНШЕ' },
];

// Скільки рідкісних резервів вміщує склад пілота. Покращення ангару «Місце на складі»,
// що його розширювало, прибрано з ангару — склад завжди базовий.
export const VAULT_CAP_BASE = 5;

export function vaultCap() {
  return VAULT_CAP_BASE;
}

let catalog = { reserves: [], tags: [], loaded: false, error: '' };
let pending = null;
const listeners = new Set();

function setCatalog(next) {
  catalog = next;
  listeners.forEach((fn) => fn());
}

// force — після правки ГМа; інакше повторні виклики ділять один запит.
export function loadRareCatalog(force = false) {
  if (pending && !force) return pending;
  if (catalog.loaded && !force) return Promise.resolve(catalog);
  pending = api
    .listRareCatalog()
    .then(({ reserves, tags }) => {
      setCatalog({ reserves, tags, loaded: true, error: '' });
      return catalog;
    })
    .catch((err) => {
      setCatalog({ ...catalog, error: err.message });
      return catalog;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useRareCatalog() {
  const snap = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => catalog,
  );
  useEffect(() => {
    if (!snap.loaded) loadRareCatalog();
  }, [snap.loaded]);
  return snap;
}

export function getRareReserves() {
  return catalog.reserves;
}

export function rareReserveByKey(key) {
  return catalog.reserves.find((r) => r.key === key) || null;
}

// Резерв, узятий зі складу, лежить у тому самому state.reserves, що й куплений за PR,
// тож списки «на руках» і запис про згорання мають знаходити і звичайні, і рідкісні.
// reserveByKey навмисно лишається тільки для звичайних: рідкісний не можна ні купити,
// ні зробити через Get Creative.
export function anyReserveByKey(key) {
  return RESERVES.find((r) => r.key === key) || rareReserveByKey(key);
}
