import { CanvasTexture, SRGBColorSpace } from 'three';

// Процедурні текстури небесних тіл. Шум рахується в 3D на одиничній сфері, тож
// рівнокутна текстура не має шва на меридіані й стиску на полюсах. Кольори — зі змінних
// theme.css (--map-*), текстури кешуються за типом, кольором і розміром.

export function cssVar(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function parseColor(str) {
  const s = (str || '').trim();
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const r = s.match(/rgba?\(([^)]+)\)/);
  if (r) return r[1].split(/[ ,/]+/).slice(0, 3).map(Number);
  return [128, 128, 128];
}

export function varRgb(name) {
  return parseColor(cssVar(name));
}

// ---------- шум ----------

function makeNoise(seed) {
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  let s = seed * 9301 + 49297;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const h = (x, y, z) => p[p[p[x & 255] + (y & 255)] + (z & 255)] / 255;
  return function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    const x0 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), xf);
    const x1 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf);
    const x2 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf);
    const x3 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf);
    return lerp(lerp(x0, x1, yf), lerp(x2, x3, yf), zf);
  };
}

function fbm(noise, x, y, z, oct) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise(x * f, y * f, z * f);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const WHITE = [255, 255, 255];

// Колір пікселя для кожного типу. p — точка на сфері, lat — широта в радіанах.
const PAINTERS = {
  rock(n, x, y, z, base) {
    const t = fbm(n, x * 3, y * 3, z * 3, 6);
    const r = 1 - Math.abs(2 * fbm(n, x * 7 + 9, y * 7, z * 7, 3) - 1);
    let c = mix(scale(base, 0.45), mix(base, WHITE, 0.15), clamp((t - 0.3) * 1.8));
    if (r > 0.92) c = scale(c, 0.7);
    return c;
  },
  terra(n, x, y, z, base, lat, extra) {
    const t = fbm(n, x * 2.2, y * 2.2, z * 2.2, 6);
    const land = extra.land;
    let c;
    if (t > 0.53) {
      const k = clamp((t - 0.53) * 5);
      c = mix(land, mix(land, [150, 130, 100], 0.6), k);
    } else {
      c = mix(scale(base, 0.55), base, clamp((t - 0.25) * 3.5));
    }
    const pole = Math.abs(lat) + (fbm(n, x * 5, y * 5, z * 5, 3) - 0.5) * 0.3;
    if (pole > 1.25) c = mix(c, WHITE, 0.9);
    return c;
  },
  clouds(n, x, y, z) {
    const t = fbm(n, x * 2.5 + 20, y * 4, z * 2.5, 6);
    return [255, 255, 255, clamp((t - 0.5) * 3.2) * 235];
  },
  gas(n, x, y, z, base, lat) {
    const w = fbm(n, x * 1.6, y * 1.6, z * 1.6, 5);
    const b = Math.sin(lat * 14 + w * 5);
    const fine = fbm(n, x * 6, y * 24, z * 6, 3);
    let c = b > 0 ? mix(base, mix(base, WHITE, 0.5), b * 0.55) : mix(base, scale(base, 0.55), -b * 0.6);
    c = mix(c, scale(c, 0.8), clamp((fine - 0.5) * 2));
    // велика буря
    const dx = x - 0.75, dy = y + 0.35, dz = z - 0.55;
    const d = Math.sqrt(dx * dx + dy * dy * 4 + dz * dz);
    if (d < 0.22) c = mix(c, mix(base, [190, 80, 50], 0.6), clamp((0.22 - d) * 8));
    return c;
  },
  ice(n, x, y, z, base) {
    const t = fbm(n, x * 3, y * 3, z * 3, 5);
    const r = 1 - Math.abs(2 * fbm(n, x * 5 + 3, y * 5, z * 5, 4) - 1);
    let c = mix(scale(base, 0.75), mix(base, WHITE, 0.6), t);
    if (r > 0.9) c = mix(c, scale(base, 0.45), clamp((r - 0.9) * 12));
    return c;
  },
  sun(n, x, y, z, base) {
    const t = fbm(n, x * 9, y * 9, z * 9, 4);
    const s = fbm(n, x * 2 + 5, y * 2, z * 2, 3);
    let c = mix(base, mix(base, WHITE, 0.75), clamp((t - 0.35) * 2));
    if (s > 0.68) c = mix(c, scale(base, 0.5), clamp((s - 0.68) * 6));
    return c;
  },
};

const cache = new Map();

// { texture, url }: texture — для 3D, url — та сама картинка для CSS-сфер у меню й панелі.
export function planetTexture(type, colorVar, w = 512, seed = 1) {
  const base = varRgb(colorVar);
  const key = `${type}|${base.join(',')}|${w}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const h = w / 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const n = makeNoise(seed + type.length * 31);
  const paint = PAINTERS[type] || PAINTERS.rock;
  const extra = { land: varRgb('--map-land') };
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;
    const cy = Math.sin(lat), cl = Math.cos(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2;
      const x = cl * Math.cos(lon), z = cl * Math.sin(lon);
      const c = paint(n, x, cy, z, base, lat, extra);
      const o = (j * w + i) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const out = { texture, url: canvas.toDataURL('image/png') };
  cache.set(key, out);
  return out;
}

// М'яке сяйво для спрайта зорі.
export function glowTexture(colorVar) {
  const key = `glow|${cssVar(colorVar)}`;
  if (cache.has(key)) return cache.get(key);
  const [r, g, b] = varRgb(colorVar);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.18, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.12)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

// Текстура конкретного об'єкта мапи — одна й та сама для 3D і для сфер у меню.
export function bodyTexture(o) {
  if (o.kind === 'star') return planetTexture('sun', o.color, 512, 5);
  return planetTexture(o.tex, o.color, o.size > 0.3 ? 1024 : 256, o.id.length + 3);
}
