// Дані зоряної мапи. Поки систем одна; назви й описи в дужках — заглушки, які ГМ замінить.
// Відстані й розміри — в одиницях 3D-сцени, період — секунди на повний оберт.
//
// kind: star | planet | moon | station | belt. Супутник чи станція з `parent` обертається
// навколо свого об'єкта, без `parent` — навколо центру системи.
// tex: тип процедурної текстури (textures.js), color: змінна з theme.css.

export const TYPE_LABEL = {
  star: 'ЗОРЯ',
  planet: 'ПЛАНЕТА',
  moon: 'СУПУТНИК',
  station: 'СТАНЦІЯ',
  belt: 'ПОЛЕ АСТЕРОЇДІВ',
};

export const SECTOR = {
  systems: [
    {
      id: 'sys1',
      name: '[СИСТЕМА]',
      desc: '[ОПИС СИСТЕМИ]',
      pos: [0, 0, 0],
      // Подвійна зоря: обидві однакові, обертаються навколо спільного центру.
      binary: { separation: 1.7, period: 36 },
      stars: [
        { id: 'sA', kind: 'star', name: '[ЗОРЯ A]', desc: '[ОПИС]', tex: 'sun', color: '--map-star', size: 0.75 },
        { id: 'sB', kind: 'star', name: '[ЗОРЯ B]', desc: '[ОПИС]', tex: 'sun', color: '--map-star', size: 0.75 },
      ],
      objects: [
        { id: 'p1', kind: 'planet', name: '[ПЛАНЕТА 01]', desc: '[ОПИС]', tex: 'rock', color: '--map-rock', size: 0.32, orbit: 5.5, period: 50, phase: 0.3 },
        { id: 'p2', kind: 'planet', name: '[ПЛАНЕТА 02]', desc: '[ОПИС]', tex: 'terra', color: '--map-ocean', size: 0.55, orbit: 8.5, period: 86, phase: 2.1 },
        { id: 'p2m1', kind: 'moon', parent: 'p2', name: '[СУПУТНИК 01]', desc: '[ОПИС]', tex: 'rock', color: '--map-moon', size: 0.13, orbit: 1.1, period: 14, phase: 0 },
        { id: 'b1', kind: 'belt', name: '[ПОЛЕ АСТЕРОЇДІВ]', desc: '[ОПИС]', color: '--map-rock', inner: 11, outer: 13, period: 600, count: 1400 },
        { id: 'p3', kind: 'planet', name: '[ПЛАНЕТА 03]', desc: '[ОПИС]', tex: 'gas', color: '--map-gas', size: 1.15, orbit: 16.5, period: 190, phase: 4.0 },
        { id: 'p3m1', kind: 'moon', parent: 'p3', name: '[СУПУТНИК 02]', desc: '[ОПИС]', tex: 'ice', color: '--map-ice', size: 0.18, orbit: 2.0, period: 20, phase: 1.2 },
        { id: 'p3s1', kind: 'station', parent: 'p3', name: '[СТАНЦІЯ 01]', desc: '[ОПИС]', size: 0.22, orbit: 2.8, period: 34, phase: 3.5 },
        { id: 's2', kind: 'station', name: '[СТАНЦІЯ 02]', desc: '[ОПИС]', size: 0.32, orbit: 19.5, period: 230, phase: 5.2 },
        { id: 'p4', kind: 'planet', name: '[ПЛАНЕТА 04]', desc: '[ОПИС]', tex: 'ice', color: '--map-ice', size: 0.45, orbit: 23, period: 300, phase: 0.9 },
      ],
    },
  ],
};

// Усі об'єкти системи плоским списком у порядку меню: зорі, далі за орбітами, супутники й
// станції одразу під своїм об'єктом.
export function flatObjects(system) {
  const out = [...system.stars];
  for (const o of system.objects) {
    if (o.parent) continue;
    out.push(o);
    for (const c of system.objects) if (c.parent === o.id) out.push(c);
  }
  return out;
}

export function findObject(system, id) {
  return system.stars.find((o) => o.id === id) || system.objects.find((o) => o.id === id) || null;
}

export function childrenOf(system, id) {
  return system.objects.filter((o) => o.parent === id);
}
