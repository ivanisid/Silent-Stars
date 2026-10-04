// Іконки резервів за типом. Малюнки — від автора проєкту (SVG з Inkscape); тут лише їхні
// контури, а колір береться з теми (currentColor), тож іконка читається в будь-якій.
//
// Нова іконка: скопіювати з SVG viewBox, transform групи (якщо є) і d контуру в ICONS
// під ключем типу — категорії звичайного резерву (mech, tactical, pilot, resource).

const ICONS = {
  mech: {
    viewBox: '0 -64 1024 1024',
    transform: 'matrix(1,0,0,-1,0,896)',
    d: 'M 273,789 171,687 v -68 h 34 l 136,136 v 34 h -68 z m 410,0 V 755 L 819,619 h 34 v 68 L 751,789 H 683 Z M 478,687 V 615 Q 462,612 446.5,605.5 431,599 418,590 l -51,51 -48,-48 51,-51 Q 361,529 354.5,513.5 348,498 345,482 h -72 v -68 h 72 q 3,-16 9.5,-31.5 Q 361,367 370,354 l -51,-51 48,-48 51,51 q 13,-9 28.5,-15.5 Q 462,284 478,281 v -72 h 68 v 72 0 q 16,3 31.5,9.5 Q 593,297 606,306 l 51,-51 48,48 -51,51 q 9,13 15.5,28.5 6.5,15.5 9.5,31.5 h 72 v 68 h -72 q -3,16 -9.5,31.5 Q 663,529 654,542 l 51,51 -48,48 -51,-51 q -14,9 -29,15.5 -15,6.5 -31,9.5 v 72 h -68 z m 34,-137 q 43,0 72.5,-29.5 Q 614,491 614,448 614,405 584.5,375.5 555,346 512,346 469,346 439.5,375.5 410,405 410,448 q 0,43 29.5,72.5 Q 469,550 512,550 Z M 171,277 V 209 L 273,107 h 68 v 34 L 205,277 h -34 z m 648,0 -136,-136 v -34 h 68 l 102,102 v 68 h -34 z',
  },
  // role_support.svg
  tactical: {
    viewBox: '0 -64 1024 1024',
    transform: 'matrix(1,0,0,-1,0,915)',
    d: 'M 157,428 512,783 867,428 771,331 512,590 253,331 Z M 283,199 512,428 741,199 693,151 512,331 331,151 Z',
  },
  // reserve_tac.svg
  pilot: {
    viewBox: '0 -64 1024 1024',
    transform: 'matrix(1,0,0,-1,0,896)',
    d: 'M 273,789 171,687 v -68 h 34 l 136,136 v 34 h -68 z m 410,0 V 755 L 819,619 h 34 v 68 L 751,789 H 683 Z M 512,687 q -49,0 -84,-35 -35,-35 -35,-85 0,-49 35,-84 35,-35 84,-35 49,0 84,35 35,35 35,84 0,50 -35,85 -35,35 -84,35 z M 358,431 v -37 q -11,-7 -23.5,-14.5 L 307,363 Q 304,351 301.5,341.5 299,332 296,322 L 512,209 728,322 q -3,10 -5.5,19.5 Q 720,351 717,363 l -27.5,16.5 q 0,0 -23.5,14.5 v 37 H 626 Q 610,413 589.5,401 569,389 546,384 v -73 l -34,-34 -34,34 v 73 q -23,5 -43.5,17 Q 414,413 398,431 H 358 Z M 171,277 V 209 L 273,107 h 68 v 34 L 205,277 h -34 z m 648,0 -136,-136 v -34 h 68 l 102,102 v 68 h -34 z',
  },
  // save.svg
  resource: {
    viewBox: '0 -64 1024 1024',
    transform: 'matrix(1,0,0,-1,0,896)',
    d: 'M 512,789 216,619 V 277 L 512,107 808,277 V 619 Z M 276,585 H 748 L 512,175 394,380 Z m 236,-69 q -28,0 -48,-20 -20,-20 -20,-48 v 0 0 0 0 0 q 0,-28 20,-48 20,-20 48,-20 v 0 q 28,0 48,20 20,20 20,48 v 0 0 0 0 0 q 0,28 -20,48 -20,20 -48,20 z',
  },
  // generic_item.svg — спільна для всіх рідкісних резервів
  rare: {
    viewBox: '0 -64 1024 1024',
    transform: 'matrix(1,0,0,-1,0,895.5)',
    d: 'M 512,760 495,751 241,604 V 292 L 512,135 783,292 V 604 Z M 512,682 714,565 512,448 310,565 Z',
  },
};

export function hasReserveIcon(kind) {
  return kind in ICONS;
}

export function ReserveGlyph({ kind, size = 18 }) {
  const icon = ICONS[kind];
  if (!icon) return null;
  return (
    <svg width={size} height={size} viewBox={icon.viewBox} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <g transform={icon.transform}>
        <path fill="currentColor" d={icon.d} />
      </g>
    </svg>
  );
}

// Квадратна плашка з іконкою зліва від назви резерву. Типу без іконки — нічого.
export default function ReserveIcon({ kind, title, size = 44 }) {
  if (!hasReserveIcon(kind)) return null;
  return (
    <div
      title={title}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Рідкісні — золоті, як у дизайні 2a: видно здалеку, що це не звичайний резерв.
        color: kind === 'rare' ? 'var(--gm)' : 'var(--accent)',
        border: `1px solid ${kind === 'rare' ? 'var(--gm-dim)' : 'var(--accent-dim)'}`,
        background: kind === 'rare' ? 'var(--gm-panel-border)' : 'var(--panel-sunken)',
      }}
    >
      <ReserveGlyph kind={kind} size={Math.round(size * 0.68)} />
    </div>
  );
}
