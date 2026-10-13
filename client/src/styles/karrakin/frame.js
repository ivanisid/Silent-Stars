// KARRAKIN INTERSTELLAR: генератори SVG-рамок панелей і хребта (spine) сторінки — порт clean() і spineAlt()
// з прототипу handoff «KARRAKIN INTERSTELLAR». Лише геометрія: кольори задає CSS (skin-karrakin.css).

// Стиль ліній рамки, хребта й навершя головної панелі — «за домом».
export const HOUSE_STYLE = {
  order: { lines: 'double', spine: 'column', crown: 'horns' },
  water: { lines: 'round', spine: 'wave', crown: 'wreath' },
  remembrance: { lines: 'clean', spine: 'rosary', crown: 'key' },
  sand: { lines: 'notch', spine: 'dash', crown: 'rays' },
  dust: { lines: 'rough', spine: 'seam', crown: 'horns' },
  stone: { lines: 'cut', spine: 'blocks', crown: 'crown' },
  promise: { lines: 'double', spine: 'seals', crown: 'key' },
  smoke: { lines: 'fade', spine: 'smoke', crown: 'crown' },
  moments: { lines: 'notch', spine: 'beads', crown: 'rays' },
  glass: { lines: 'double', spine: 'prisms', crown: 'wreath' },
};

export function houseStyle(house) {
  return HOUSE_STYLE[house] || HOUSE_STYLE.order;
}

const n = (v) => +v.toFixed(1);
const dm = (x, y, s) => `M${n(x)} ${n(y - s)}L${n(x + s)} ${n(y)}L${n(x)} ${n(y + s)}L${n(x - s)} ${n(y)}Z`;

// Рамка панелі w×h. pw — ширина плашки заголовка (0 — плашки немає), sw — ширина правого
// блоку. link — горизонтальний з'єднувач ліворуч (панель у ряду поруч із панеллю на хребті).
// Повертає шляхи: d — основний контур, d2 — внутрішній, dia — ромби.
export function frame(w, h, pw, sw, { link = false, seed = '' } = {}, lines = 'clean') {
  const I = 4.5, W = n(w - 0.5), Hh = n(h - 0.5);
  const x0 = 10.5, y0 = 10.5, x1 = n(10 + pw - 0.5), y1 = 41.5, m = 26, rx = n(w - 20 - sw - 14);
  let d = `M0.5 0.5H${W}V${Hh}H0.5Z`, d2 = `M${I} ${I}H${n(w - I)}V${n(h - I)}H${I}Z`, dia = '';
  if (lines === 'cut') {
    const c = 9, c2 = 7, b = n(w - I), e = n(h - I);
    d = `M${0.5 + c} 0.5H${n(W - c)}L${W} ${0.5 + c}V${n(Hh - c)}L${n(W - c)} ${Hh}H${0.5 + c}L0.5 ${n(Hh - c)}V${0.5 + c}Z`;
    d2 = `M${I + c2} ${I}H${n(b - c2)}L${b} ${I + c2}V${n(e - c2)}L${n(b - c2)} ${e}H${I + c2}L${I} ${n(e - c2)}V${I + c2}Z`;
  } else if (lines === 'fade') {
    const g = 16;
    d = `M${g} 0.5H${n(W - g)}M${W} ${g}V${n(Hh - g)}M${n(W - g)} ${Hh}H${g}M0.5 ${n(Hh - g)}V${g}`;
    [[0.5, 0.5], [W, 0.5], [W, Hh], [0.5, Hh]].forEach(([x, y]) => { dia += dm(x, y, 1.4); });
  } else if (lines === 'rough') {
    let s = 5;
    for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const p = [];
    const ed = (ax, ay, bx, by) => {
      const N = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 7));
      for (let i = 0; i < N; i++) {
        const t = i / N, j = i ? 1.2 : 0;
        p.push(`${n(ax + (bx - ax) * t + (R() - 0.5) * j)} ${n(ay + (by - ay) * t + (R() - 0.5) * j)}`);
      }
    };
    ed(0.5, 0.5, W, 0.5); ed(W, 0.5, W, Hh); ed(W, Hh, 0.5, Hh); ed(0.5, Hh, 0.5, 0.5);
    d = `M${p.join('L')}Z`;
  }
  if (lines === 'double') { d += `M3 3H${n(w - 3)}V${n(h - 3)}H3Z`; d2 = `M6.5 6.5H${n(w - 6.5)}V${n(h - 6.5)}H6.5Z`; }
  if (lines === 'round') {
    const r = 9, a = I, b = n(w - I), e = n(h - I);
    d2 = `M${a + r} ${a}H${n(b - r)}A${r} ${r} 0 0 1 ${b} ${a + r}V${n(e - r)}A${r} ${r} 0 0 1 ${n(b - r)} ${e}H${a + r}A${r} ${r} 0 0 1 ${a} ${n(e - r)}V${a + r}A${r} ${r} 0 0 1 ${a + r} ${a}Z`;
  }
  if (lines === 'notch') for (let x = 24; x < w - 20; x += 14) d += `M${n(x)} ${Hh}v-3.5`;
  if (pw > 0) {
    d += `M${x0} ${y0}H${n(x1 - 17)}L${x1} ${m}L${n(x1 - 17)} ${y1}H${x0}L${x0 + 10} ${m}Z`;
    if (rx - 34 > x1 + 30) { d += `M${n(x1 + 8)} ${m}H${n(rx - 10)}`; dia += dm(rx - 5, m, 2.2); }
  }
  if (link) { d += 'M-30 0.5H0.5'; dia += dm(-15, 0.5, 2.4); }
  return { d, d2, dia };
}

// Хребет: вертикаль на x = −25.5 від лівого краю стовпця, H — висота стовпця, js — y вузлів
// (верх кожної панелі на хребті + 26). S — лінії, D — пунктир (da — його dasharray), F — заливка.
export function spine(H, js, style) {
  const X = -25.5, Y0 = -30, Y1 = n(H - 20), A = { S: '', D: '', F: '', da: 'none' };
  const ci = (x, y, r) => `M${n(x - r)} ${n(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const ring = (y, r) => `M${X + r} ${y}A${r} ${r} 0 1 0 ${X - r} ${y}A${r} ${r} 0 1 0 ${X + r} ${y}`;
  const mr = style === 'seals' ? 9 : 7, ys = [Y0, ...js, Y1];
  for (let i = 0; i < ys.length - 1; i++) {
    const a = n(ys[i] + (i > 0 ? mr + 2 : 0)), b = n(ys[i + 1] - (i + 1 < ys.length - 1 ? mr + 2 : 0)), L = b - a, mid = n((a + b) / 2);
    if (L < 4) continue;
    if (style === 'seals') { A.S += `M${X} ${a}V${b}`; if (L > 40) A.F += dm(X, mid, 3); }
    else if (style === 'rosary') {
      const st = 20, N = Math.max(1, Math.floor(L / st)), o0 = a + (L - N * st) / 2;
      for (let j = 0; j < N; j++) { const c = o0 + j * st + st / 2; A.S += `M${X} ${n(c - 8)}a3 8 0 1 0 0 16a3 8 0 1 0 0 -16Z`; if (j < N - 1) A.F += dm(X, c + st / 2, 1.8); }
    } else if (style === 'column') { A.S += `M${X - 4} ${a}V${b}M${X + 4} ${a}V${b}`; A.D += `M${X} ${a + 4}V${b - 4}`; A.da = '1 3'; }
    else if (style === 'blocks') {
      A.S += `M${X - 5} ${a}V${b}M${X + 5} ${a}V${b}`;
      for (let y = a + 9; y < b - 4; y += 18) A.S += `M${X - 5} ${n(y)}H${X + 5}`;
      for (let y = a + 18; y < b - 4; y += 18) A.D += `M${X} ${n(y - 9)}V${n(y)}`;
    } else if (style === 'wave') {
      const k = Math.max(1, Math.round(L / 30)), p = [];
      for (let y = a; y <= b; y += 2) p.push(`${n(X + 3 * Math.sin((Math.PI * k * (y - a)) / L))} ${n(y)}`);
      p.push(`${X} ${b}`);
      A.S += `M${p.join('L')}`;
    } else if (style === 'dash') {
      for (let y = a; y < b;) { const g = 2 + 7 * Math.sin((Math.PI * (y - a)) / L); A.S += `M${X} ${n(y)}V${n(Math.min(b, y + 3))}`; y += 3 + g; }
    } else if (style === 'seam') {
      A.D += `M${X} ${a}V${b}`; A.da = '1 3';
      for (let y = a + 2; y < b - 5; y += 7) A.S += `M${X - 3} ${n(y)}L${X + 3} ${n(y + 4)}`;
    } else if (style === 'smoke') {
      let k = 0;
      for (let y = a; y < b; k++) { const len = 6 + ((k * 37) % 17); A.D += `M${X} ${n(y)}V${n(Math.min(b, y + len))}`; y += len + 3 + ((k * 23) % 9); }
    } else if (style === 'beads') {
      A.S += `M${X} ${a}V${b}`;
      let k = 0;
      for (let y = a + 5; y < b - 3; y += 8, k++) { if (k % 4 === 3) A.S += `M${X - 3} ${n(y)}H${X + 3}`; else A.F += ci(X, y, 1.5); }
    } else if (style === 'prisms') {
      if (L > 40) A.S += `M${X} ${a}V${n(mid - 9)}M${X} ${n(mid + 9)}V${b}M${X} ${n(mid - 9)}L${X + 3.5} ${mid}L${X} ${n(mid + 9)}L${X - 3.5} ${mid}ZM${X - 3.5} ${mid}H${X + 3.5}`;
      else A.S += `M${X} ${a}V${b}`;
    } else { A.D += `M${X} ${a}V${b}`; A.da = '6 4'; }
  }
  if (style === 'column' || style === 'blocks') A.S += `M${X - 9} ${Y0}H${X + 9}M${X - 7} ${Y0 + 3}H${X + 7}M${X - 7} ${n(Y1 - 3)}H${X + 7}M${X - 9} ${Y1}H${X + 9}`;
  else A.F += dm(X, Y0, 3) + dm(X, Y1, 2.4);
  js.forEach((j) => {
    A.S += `${ring(j, mr)}M${X + mr} ${j}H-0.5`;
    if (style === 'seals') A.S += ring(j, 6);
    A.F += style === 'prisms' ? dm(X, j, 3.2) : ci(X, j, 2.6);
  });
  return A;
}
