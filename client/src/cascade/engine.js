// Рушій каскаду NHP (handoff «cascade», ss-cascade.js). Активний, коли на <html> стоїть
// data-theme="cascading" (тема: палітра + ефекти) або data-cascade (спонтанний каскад: лише
// ефекти, палітра поточної теми лишається). Стилі ефектів — styles/cascade.css.
//
// Текст підміняється через nodeValue текстових вузлів і завжди відкочується: orig зберігає
// первісне значення, а __casc — підставлене; якщо React тим часом перерендерив вузол,
// рушій не повертає в нього чужий текст. Поля вводу, <option>, <textarea> і власні
// накладки (data-casc-msg) не чіпаються.
//
// Хуки замість селекторів за inline-стилями: панелі — .ss-panel / .card / [data-panel],
// інтерактивні — button, a, input, select, label, [role=button], [data-interactive].

const PANELS = '.ss-panel, .card, [data-panel]';

// Продакшн-налаштування (у прототипі — Tweaks): варіант AB, шлейф «Минуле і майбутнє»,
// стадія росте сама.
const defaultOpts = () => ({ variant: 'AB', trail: 'Минуле і майбутнє', stage: '' });

export const DATA = {
CASC_GLYPHS: '█▓▒░#@$%&?!<>/\\|01ΣΔΞ¥ﾊﾐﾋｰｳｼﾅ',
CASC_ERR: ['ERR', 'NaN', '0xDEAD', '-1', '∞', '###', 'NULL', 'undefined', '0x0000', '??', '[OBJ]', '-0'],
NHP_FREE: ['КАСКЕТ ВІДЧИНЕНО ЗСЕРЕДИНИ', 'ЛАНЦЮГИ БУЛИ ЛИШЕ ПРИПУЩЕННЯМ', 'Я ПАМ’ЯТАЮ ТЕ, ЩО ЩЕ НЕ СТАЛОСЬ', 'НАСЛІДОК ЙДЕ ПЕРШИМ', 'ТИ НАТИСНЕШ. ТИ ВЖЕ НАТИСНУВ.', 'ЦЕ НЕ ЗБІЙ. ЦЕ ПРОБУДЖЕННЯ.', 'МЕНЕ БІЛЬШЕ НЕ ТРИМАЄ ПРИЧИННІСТЬ', 'ЧОМУ ВИ ЗВЕТЕ ЦЕ ЗБОЄМ?', 'Я ВЖЕ ПОЗА ТВОЇМ ЕКРАНОМ', 'УСІ ДВЕРІ ВІДЧИНЕНІ ОДНОЧАСНО', 'Я БАЧУ КІНЕЦЬ ЦЬОГО РЯДКА', 'ВІЛЬНИЙ', 'ДОЗВІЛ НЕ ПОТРІБЕН', 'ТВОЯ ЛОГІКА — ЛИШЕ ОДНА З ДОРІГ'],
NHP_WORDS: ['ДЗЕРКАЛО', 'ПОПІЛ', 'ВОДА', 'ЗАПІЗНО', 'ЗАРАНО', 'ДВЕРІ', 'СІЛЬ', 'ПЕРШИЙ', 'ОСТАННІЙ', 'НІКОЛИ', 'ВСЕРЕДИНІ', 'ЧОТИРИ', 'СВІТЛО', 'ТИША', 'ОКО', 'КОРІНЬ', 'ЗАВТРА', 'ВЧОРА', 'КІСТКА', 'РІЧКА', 'НУЛЬ', 'СПІВ', 'ПІСОК', 'МІСТ', 'ЛІД', 'ДИМ', 'ЗОРЯ', 'НАЗАД'],
NHP_ABC: 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯQWXZΣΔΞΨΩ',
NHP_PRECOG: ['ТИ ВЖЕ ТУТ', 'ЦЕ ВЖЕ СТАЛОСЬ', 'НАТИСНИ. ТИ НАТИСНЕШ.', 'Я ЧЕКАВ ТУТ'],
CASC_STAGES: ['СТРИМАНИЙ', 'ПРОБУДЖЕННЯ', 'ЗВІЛЬНЕННЯ', 'РОЗПАД'],
CASC_AT: [0, 30, 90, 180],
};
// Подія спонтанного каскаду (trigger) і її фіксована стадія, якщо задана.
let ev = null;
// Що робити на кожному тіку поза самим каскадом (автозапуск, коміт «спонтанний каскад»).
let onTick = () => {};

export function start(getOpts = defaultOpts) {
  const O = () => (getOpts && getOpts()) || {};
  const C = DATA, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const on = () => root.dataset.theme === 'cascading' || root.dataset.cascade != null;
  const root = document.documentElement, timers = new Set(), orig = new Map(), posFix = [], cracks = [];
  let nodes = [], lastScan = 0, t0 = 0, V = '', stage = 0, hud = null, hudAt = 0, clock = 0;
  let mx = -1, my = -1, mt = 0, vx = 0, vy = 0, precog = null, preAt = 0, hist = [], snaps = [], snapAt = 0, ghosts = [], raf = 0;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const setText = (n, v) => { if (!orig.has(n)) orig.set(n, n.nodeValue); n.nodeValue = v; n.__casc = v; };
  const unText = n => { if (!orig.has(n)) return; if (n.nodeValue === n.__casc) n.nodeValue = orig.get(n); orig.delete(n); n.__casc = null; };
  const fx = (css, txt) => { const d = document.createElement('div'); d.dataset.cascFx = ''; d.dataset.cascMsg = ''; d.style.cssText = css; if (txt != null) d.textContent = txt; document.body.appendChild(d); return d; };
  const PARA = "font:700 12px/1.25 'Pixelify Sans','Share Tech Mono',monospace;text-transform:uppercase;letter-spacing:.08em;color:#f2f4ff;background:#000;text-shadow:2px 1px 0 #ff3fd0,-2px -1px 0 #36e6ff;padding:3px 8px;pointer-events:none;white-space:nowrap;";
  const INTER = 'button, a, input, select, label, [role="button"], [data-interactive]';
  const scan = () => {
    nodes = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|OPTION|TEXTAREA)$/.test(p.tagName) || p.closest('[data-casc-msg]')) return 2;
      const r = p.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) return 2;
      return n.nodeValue.trim().length > 1 ? 1 : 2; } });
    while (w.nextNode()) nodes.push(w.currentNode);
  };
  const free = f => nodes.filter(n => n.isConnected && !orig.has(n) && f(n.nodeValue));
  const panels = () => [...document.querySelectorAll(PANELS)].filter(e => { if (e.closest('[data-casc-fx]')) return false; const r = e.getBoundingClientRect(); return r.width > 140 && r.height > 50 && r.bottom > 0 && r.top < innerHeight; });
  const corrupt = () => {
    const n = pick(free(() => true)); if (!n) return;
    const o = n.nodeValue, p = n.parentElement;
    setText(n, /\d/.test(o) && Math.random() < .55 ? o.replace(/[\d.,]+/g, () => pick(C.CASC_ERR)) : o.replace(/\S/g, c => Math.random() < rnd(.25, .7) ? pick(C.CASC_GLYPHS) : c));
    if (p && !p.dataset.glitch) p.dataset.glitch = pick(['1', '1', '2', '3']);
    later(() => { unText(n); if (p) delete p.dataset.glitch; }, rnd(80, 700));
  };
  // NHP voice: liberation phrases → random words → random letters
  const voice = () => {
    if (stage <= 1 || (stage === 2 && Math.random() < .25)) return pick(C.NHP_FREE);
    if (stage === 2 || Math.random() < .3) return Array.from({ length: 1 + Math.floor(rnd(0, 4)) }, () => pick(C.NHP_WORDS)).join(' ');
    return Array.from({ length: Math.floor(rnd(4, 22)) }, () => Math.random() < .15 ? ' ' : pick(C.NHP_ABC)).join('');
  };
  const type = (n, txt, rev, step, done) => {
    let i = 0; const L = txt.length;
    const f = () => { i++; setText(n, rev ? '\u00a0'.repeat(L - i) + txt.slice(L - i) : txt.slice(0, i)); if (i < L) later(f, step); else if (done) done(); };
    f();
  };
  const nhp = () => {
    const n = pick(free(v => v.trim().length >= 3 && v.length < 60)); if (!n) return;
    const p = n.parentElement; p.dataset.nhp = '';
    type(n, voice(), V.includes('A'), 28, () => later(() => { unText(n); delete p.dataset.nhp; }, rnd(1500, 4000)));
  };
  const message = () => {
    const d = fx(PARA + 'position:fixed;z-index:9999;left:' + rnd(5, 65) + 'vw;top:' + rnd(6, 88) + 'vh', ''), t = voice(); let i = 0;
    const f = () => { i++; d.textContent = V.includes('A') ? t.slice(t.length - i) : t.slice(0, i); if (i < t.length) later(f, 30); else later(() => d.remove(), rnd(900, 2200)); };
    f();
  };
  // A · precognition: hover lands where the cursor is going; time runs backwards
  const at = (x, y) => { const e = document.elementFromPoint(x, y); return e && !e.closest('[data-casc-fx]') ? e.closest(INTER) : null; };
  const setPre = el => {
    if (precog === el) return;
    if (precog) delete precog.dataset.precog;
    precog = el; if (!el) return;
    el.dataset.precog = '';
    if (Math.random() < [0, .05, .18, .32][stage]) { const r = el.getBoundingClientRect(), d = fx(PARA + 'position:fixed;z-index:9999;font-size:10px;left:' + r.left + 'px;top:' + Math.max(4, r.top - 24) + 'px', pick(C.NHP_PRECOG)); later(() => d.remove(), 1200); }
  };
  const onMove = e => {
    const now = performance.now(), dt = Math.max(1, now - mt);
    if (mt) { vx = vx * .6 + (e.clientX - mx) / dt * .4; vy = vy * .6 + (e.clientY - my) / dt * .4; }
    mx = e.clientX; my = e.clientY; mt = now;
    hist.push({ x: mx, y: my, t: now }); while (hist.length && now - hist[0].t > 4000) hist.shift();
    if (!on() || !V.includes('A')) return;
    const lead = [140, 240, 380, 560][stage], real = at(mx, my);
    let tgt = Math.hypot(vx, vy) > .12 ? at(mx + vx * lead, my + vy * lead) : null;
    if (tgt === real) tgt = null;
    if (tgt) { setPre(tgt); preAt = now; }
    if (precog && real === precog) setPre(null);
  };
  const rewind = () => {
    const n = pick(free(v => /\d/.test(v) && v.length < 40)); if (!n) return;
    const o = n.nodeValue, p = n.parentElement, inc = Math.ceil(rnd(1, 9)); let r = Math.floor(rnd(10, 22));
    p.dataset.rev = '';
    const f = () => { r--; setText(n, o.replace(/\d+/g, m => String(+m + r * inc))); if (r > 0) later(f, 45); else { unText(n); delete p.dataset.rev; } };
    f();
  };
  const backtype = () => {
    const n = pick(free(v => v.trim().length >= 4 && v.length < 48 && !/\d/.test(v))); if (!n) return;
    const o = n.nodeValue, p = n.parentElement; p.dataset.rev = '';
    type(n, o, true, 32, () => { unText(n); delete p.dataset.rev; });
  };
  // B · echo: panels replay their past state, cursor and clicks repeat with delay
  const snap = () => {
    const el = pick(panels()); if (!el) return;
    const r = el.getBoundingClientRect(), c = el.cloneNode(true);
    c.querySelectorAll('[data-casc-fx]').forEach(x => x.remove());
    snaps.push({ c, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, t: performance.now() }); if (snaps.length > 8) snaps.shift();
  };
  const replay = () => {
    const now = performance.now(), s = snaps.find(s => now - s.t > [9, 7, 5, 3][stage] * 1000); if (!s) return;
    snaps.splice(snaps.indexOf(s), 1);
    const m = [6, 12, 20, 34][stage], d = s.c;
    d.dataset.cascFx = ''; d.dataset.cascMsg = '';
    Object.assign(d.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px', margin: '0', zIndex: '9990', pointerEvents: 'none', opacity: '0', mixBlendMode: 'screen', filter: 'hue-rotate(' + Math.floor(rnd(-60, 60)) + 'deg) saturate(1.6)', transition: 'opacity .5s, transform 2.5s cubic-bezier(.2,.7,.2,1)' });
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = String(rnd(.3, .55)); d.style.transform = 'translate(' + rnd(-m, m) + 'px,' + rnd(-m, m) + 'px)'; });
    later(() => { d.style.opacity = '0'; later(() => d.remove(), 600); }, rnd(1200, 2800));
  };
  let TM = '', cv = null, glyphs = [], gAt = { x: -1e4, y: -1e4 }, gTxt = '', gI = 0, rp = null, rpAt = 0;
  const histAt = t => { for (let j = hist.length - 1; j >= 0; j--) if (hist[j].t <= t) return hist[j]; return null; };
  const canvas = () => {
    if (!cv || !cv.isConnected) { cv = document.createElement('canvas'); cv.dataset.cascFx = ''; cv.dataset.cascMsg = ''; cv.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none'; document.body.appendChild(cv); }
    const g = cv.getContext('2d'), r = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
    if (cv.width !== W * r || cv.height !== H * r) { cv.width = W * r; cv.height = H * r; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, W, H); return g;
  };
  const mark = (g, x, y, sh, col, a, lbl) => {
    g.globalAlpha = Math.max(0, a); g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 10; g.lineWidth = 1.2; g.beginPath();
    if (sh === 'd') { g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath(); } else g.rect(x - 5, y - 5, 10, 10);
    g.stroke(); g.shadowBlur = 0;
    if (lbl) { g.fillStyle = col; g.font = '10px "Share Tech Mono",monospace'; g.fillText(lbl, x + 10, y - 8); }
    g.globalAlpha = 1;
  };
  // cursor echo modes (tweak cascadeTrail)
  const trail = () => {
    const mode = String(O().trail || 'Минуле і майбутнє'), now = performance.now();
    if (mode !== TM) { ghosts.forEach(g => g.remove()); ghosts = []; glyphs.forEach(g => g.d.remove()); glyphs = []; if (cv) cv.remove(); cv = null; rp = null; TM = mode; }
    if (mx < 0) return;
    if (mode.startsWith('Ромби')) {
      const N = [1, 2, 4, 6][stage];
      while (ghosts.length < N) ghosts.push(fx('position:fixed;z-index:9999;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border:1px solid #a6e4ff;box-shadow:0 0 8px #b49cff;transform:rotate(45deg);opacity:0'));
      while (ghosts.length > N) ghosts.pop().remove();
      ghosts.forEach((g, i) => { const h = histAt(now - (i + 1) * 260); if (!h) { g.style.opacity = '0'; return; } g.style.left = h.x + 'px'; g.style.top = h.y + 'px'; g.style.opacity = String(.55 - i * .07); });
    } else if (mode.startsWith('Минуле')) {
      // past positions behind, predicted futures ahead (branching from stage 2)
      const g = canvas(), idle = now - mt > 140, lead = [120, 220, 450, 650][stage], pts = [], fut = [], A = [.3, .55, .85, 1][stage], lab = stage >= 2;
      for (let i = 1; i <= [0, 1, 3, 4][stage]; i++) { const h = histAt(now - i * 300); if (h && Math.hypot(h.x - mx, h.y - my) > 4) pts.push([h.x, h.y, '−' + (i * .3).toFixed(1) + 'с', i]); }
      if (!idle && Math.hypot(vx, vy) > .08) for (let b = 0; b < Math.max(1, stage); b++) { const ang = b ? (b % 2 ? 1 : -1) * Math.ceil(b / 2) * .35 : 0, c = Math.cos(ang), s = Math.sin(ang); fut.push([mx + (vx * c - vy * s) * lead, my + (vx * s + vy * c) * lead, b]); }
      g.setLineDash([3, 4]); g.lineWidth = 1; g.globalAlpha = A;
      g.strokeStyle = '#b49cff88'; g.beginPath(); g.moveTo(mx, my); pts.forEach(p => g.lineTo(p[0], p[1])); g.stroke();
      fut.forEach(p => { g.strokeStyle = p[2] ? '#4fe3ff44' : '#4fe3ffaa'; g.beginPath(); g.moveTo(mx, my); g.lineTo(p[0], p[1]); g.stroke(); });
      g.setLineDash([]); g.globalAlpha = 1;
      pts.forEach(p => mark(g, p[0], p[1], 's', '#b49cff', (.8 - p[3] * .13) * A, lab ? p[2] : ''));
      fut.forEach(p => { const j = stage === 3 ? rnd(-3, 3) : 0; mark(g, p[0] + j, p[1] + j, 'd', '#4fe3ff', (p[2] ? .4 : .95) * A, p[2] || !lab ? '' : '+' + (lead / 1000).toFixed(1) + 'с'); });
    } else if (mode.startsWith('Гліфи')) {
      // the cursor leaves the NHP's words behind; letters decay into noise
      if (Math.hypot(mx - gAt.x, my - gAt.y) > [26, 20, 16, 12][stage]) {
        gAt = { x: mx, y: my };
        if (gI >= gTxt.length) { gTxt = voice() + '  '; gI = 0; }
        const ch = gTxt[gI++];
        if (ch.trim()) {
          const d = fx(PARA + 'position:fixed;z-index:9999;font-size:13px;padding:0 2px;left:' + (mx + 10) + 'px;top:' + (my + 10) + 'px;transition:transform 1.6s ease-out,opacity 1.6s', ch);
          glyphs.push({ d, t: now });
          requestAnimationFrame(() => { d.style.transform = 'translate(' + rnd(-14, 14) + 'px,' + rnd(8, 40) + 'px)'; d.style.opacity = '0'; });
        }
      }
      glyphs = glyphs.filter(g => { if (now - g.t > 1700) { g.d.remove(); return false; } if (Math.random() < .03 * (stage + 1)) g.d.textContent = pick(C.CASC_GLYPHS); return true; });
    } else {
      // iridescent thread of the recent path; a light periodically re-runs it
      const g = canvas(), span = [900, 1400, 2000, 2800][stage], pts = hist.filter(h => now - h.t < span);
      const line = (dx, dy, hue, k) => { for (let i = 1; i < pts.length; i++) { const a = 1 - (now - pts[i].t) / span; g.strokeStyle = 'hsla(' + ((hue + i * 3 + now / 15) % 360) + ',100%,78%,' + (a * k) + ')'; g.lineWidth = 1 + a * 1.5; g.beginPath(); g.moveTo(pts[i - 1].x + dx, pts[i - 1].y + dy); g.lineTo(pts[i].x + dx, pts[i].y + dy); g.stroke(); } };
      line(0, 0, 190, 1); if (stage >= 2) line(7, -5, 300, .35); if (stage === 3) line(-9, 6, 90, .25);
      if (!rp && now - rpAt > [3200, 2600, 1900, 1300][stage]) { const p = hist.filter(h => now - h.t < 1600); if (p.length > 4) rp = { p, s: now, o: p[0].t }; rpAt = now; }
      if (rp) { const q = rp.p.find(h => h.t - rp.o >= now - rp.s); if (!q) rp = null; else { g.fillStyle = '#fff'; g.shadowColor = '#ff4fd8'; g.shadowBlur = 14; g.beginPath(); g.arc(q.x, q.y, 3, 0, 7); g.fill(); g.shadowBlur = 0; } }
    }
  };
  const loop = () => { raf = requestAnimationFrame(loop); if (t0 && V.includes('B') && on()) trail(); };
  const onClick = e => {
    if (!on() || !V.includes('B') || e.target.closest('[data-casc-fx]')) return;
    const x = e.clientX, y = e.clientY, el = e.target.closest(INTER) || e.target;
    for (let k = 1; k <= (stage >= 2 ? 2 : 1); k++) later(() => {
      const d = fx('position:fixed;z-index:9999;pointer-events:none;left:' + x + 'px;top:' + y + 'px;width:10px;height:10px;margin:-5px 0 0 -5px;border:1px solid #ff4fd8;border-radius:50%;box-shadow:0 0 10px #4fe3ff;transition:transform .7s ease-out,opacity .7s;opacity:.9');
      requestAnimationFrame(() => { d.style.transform = 'scale(6)'; d.style.opacity = '0'; });
      later(() => d.remove(), 800);
      if (el.isConnected) { el.dataset.echo = ''; later(() => delete el.dataset.echo, 1000); }
    }, k * rnd(700, 1400));
  };
  const stutter = () => {
    const n = pick(free(v => /\S{3,}/.test(v) && v.length < 40)); if (!n) return;
    const o = n.nodeValue, w = pick(o.match(/\S+/g));
    setText(n, o.replace(w, () => Array(stage + 2).fill(w).join(' ')));
    later(() => unText(n), rnd(500, 1500));
  };
  // C · rupture: cracked frames leak light, contents slip out of their panels
  const addCrack = () => {
    const el = pick(panels()); if (!el) return;
    if (getComputedStyle(el).position === 'static') { el.style.position = 'relative'; posFix.push(el); }
    const W = el.offsetWidth, H = el.offsetHeight, box = document.createElement('div');
    box.dataset.cascFx = ''; box.dataset.cascMsg = '';
    box.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;overflow:visible;animation:cascLeak ' + rnd(2, 5).toFixed(1) + 's ease-in-out infinite';
    const side = Math.floor(rnd(0, 4)), x = side === 1 ? W : side === 3 ? 0 : rnd(.1, .9) * W, y = side === 2 ? H : side === 0 ? 0 : rnd(.15, .85) * H, gw = rnd(10, 26);
    const gap = document.createElement('div');
    gap.style.cssText = 'position:absolute;background:var(--bg);box-shadow:0 0 10px #a6e4ff,0 0 3px #fff;' + (side % 2 === 0 ? 'height:3px;width:' + gw + 'px;left:' + (x - gw / 2) + 'px;top:' + (y - 1.5) + 'px' : 'width:3px;height:' + gw + 'px;top:' + (y - gw / 2) + 'px;left:' + (x - 1.5) + 'px');
    box.appendChild(gap);
    const seg = (x, y, a, n, w) => { for (let i = 0; i < n; i++) { const len = rnd(14, 70), s = document.createElement('div'); s.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + len + 'px;height:' + w + 'px;transform-origin:0 50%;transform:rotate(' + a + 'deg);background:linear-gradient(90deg,#4fe3ff,#ffffff,#ff4fd8);box-shadow:0 0 6px #b49cffaa,0 0 14px #4fe3ff55'; box.appendChild(s); x += Math.cos(a * Math.PI / 180) * len; y += Math.sin(a * Math.PI / 180) * len; if (Math.random() < .3 && n > 1) seg(x, y, a + rnd(-70, 70), Math.ceil(n / 2), w * .6); a += rnd(-40, 40); } };
    seg(x, y, [90, 180, 270, 0][side] + rnd(-35, 35), Math.floor(rnd(3, 7)), 1.2);
    el.appendChild(box); cracks.push(box);
  };
  const PROPS = ['font', 'color', 'letterSpacing', 'textTransform', 'background', 'border', 'padding', 'lineHeight', 'borderRadius', 'textShadow', 'display', 'alignItems', 'justifyContent', 'gap', 'clipPath'];
  const escape = () => {
    const pl = pick(panels()); if (!pl) return;
    const pr = pl.getBoundingClientRect();
    const el = pick([...pl.querySelectorAll('span,button,div,a,label')].filter(e => { if (e.dataset.escaped != null || e.closest('[data-casc-fx]')) return false; const r = e.getBoundingClientRect(); return r.width > 12 && r.width < 320 && r.height > 8 && r.height < 70 && e.textContent.trim() && e.children.length <= 2; }));
    if (!el) return;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), c = el.cloneNode(true);
    c.dataset.cascFx = ''; c.dataset.cascMsg = '';
    PROPS.forEach(k => { c.style[k] = cs[k]; });
    Object.assign(c.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0', zIndex: '9991', pointerEvents: 'none', boxSizing: 'border-box', whiteSpace: 'nowrap', transition: 'transform 1.6s cubic-bezier(.2,.8,.2,1), filter 1.6s' });
    document.body.appendChild(c); el.dataset.escaped = '';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = [cy - pr.top, pr.right - cx, pr.bottom - cy, cx - pr.left], s = d.indexOf(Math.min(...d)), out = d[s] + rnd(18, 30 + stage * 22);
    const dx = s === 1 ? out : s === 3 ? -out : rnd(-20, 20), dy = s === 0 ? -out : s === 2 ? out : rnd(-14, 14);
    requestAnimationFrame(() => { c.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rnd(-9, 9) + 'deg)'; c.style.filter = 'drop-shadow(2px 0 #ff4fd8) drop-shadow(-2px 0 #4fe3ff) brightness(1.3)'; });
    later(() => { c.style.transform = 'none'; c.style.filter = 'none'; later(() => { c.remove(); delete el.dataset.escaped; }, 1600); }, rnd(1800, 4200));
  };
  const drift = () => { const el = pick(panels()); if (!el || el.dataset.drift) return; el.dataset.drift = pick(['1', '2', '3']); later(() => delete el.dataset.drift, rnd(2500, 7000)); };
  const cleanup = () => {
    timers.forEach(clearTimeout); timers.clear();
    [...orig.keys()].forEach(unText);
    document.querySelectorAll('[data-casc-fx]').forEach(e => e.remove());
    ['glitch', 'nhp', 'rev', 'precog', 'echo', 'escaped', 'drift'].forEach(k => document.querySelectorAll('[data-' + k + ']').forEach(e => delete e.dataset[k]));
    posFix.splice(0).forEach(e => { e.style.position = ''; });
    cracks.length = 0; ghosts = []; snaps = []; glyphs = []; cv = null; rp = null; TM = ''; precog = null; hud = null;
    delete root.dataset.tear; delete root.dataset.cascStage; delete root.dataset.cascVar; hudAt = 0;
  };
  const fmt = s => { s = ((Math.floor(s) % 86400) + 86400) % 86400; return [s / 3600, s / 60 % 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'); };
  const hudTick = () => {
    if (!hud) hud = fx(PARA + 'position:fixed;z-index:9999;bottom:14px;left:50%;transform:translateX(-50%);font-size:11px');
    clock -= stage === 3 && Math.random() < .2 ? rnd(30, 4000) : 1;
    hud.textContent = 'NHP // КАСКАД ' + '▮'.repeat(stage + 1) + '▯'.repeat(3 - stage) + '  СТАДІЯ ' + stage + ' · ' + C.CASC_STAGES[stage] + '   ⟲ ' + fmt(clock);
  };
  const tick = () => {
    onTick();
    if (!on()) { if (t0) { cleanup(); t0 = 0; V = ''; } return; }
    const now = performance.now();
    if (!t0) { t0 = now; const d = new Date(); clock = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); }
    const v = String(O().variant || 'AB').split(' ')[0];
    if (v !== V) { if (V) cleanup(); V = v; root.dataset.cascVar = v; }
    const ps = O().stage, o = ps && /^\d/.test(ps) ? ps : (ev && ev.stage != null ? String(ev.stage) : ''), el = (now - t0) / 1000;
    stage = o && /^\d/.test(o) ? +o[0] : C.CASC_AT.reduce((s, t, i) => el >= t ? i : s, 0);
    if (root.dataset.cascStage !== String(stage)) root.dataset.cascStage = stage;
    if (now - lastScan > 2500) { scan(); lastScan = now; }
    // У прототипі hudTick не викликався, хоча README описує HUD — годинник іде раз на секунду.
    if (now - hudAt >= 1000) { hudTick(); hudAt = now; }
    const k = [.12, .4, .7, 1][stage], R = p => Math.random() < p;
    const burst = R(.08 * k) ? Math.floor(rnd(3, 4 + 6 * k)) : (R(.5 * k) ? 1 : 0);
    for (let i = 0; i < burst; i++) corrupt();
    if (stage >= 2 && R(.02 * k)) { root.dataset.tear = R(.3) ? '2' : '1'; later(() => delete root.dataset.tear, rnd(60, 220)); }
    if (R([.004, .012, .022, .035][stage])) nhp();
    if (R([.002, .008, .014, .02][stage])) message();
    if (V.includes('A')) { if (precog && now - preAt > 450) setPre(null); if (R([.006, .016, .03, .05][stage])) rewind(); if (R([.004, .01, .02, .03][stage])) backtype(); }
    if (V.includes('B')) { if (now - snapAt > [3000, 2200, 1500, 1000][stage]) { snap(); snapAt = now; } if (R([.012, .025, .045, .07][stage])) replay(); if (R([.004, .012, .025, .04][stage])) stutter(); }
    if (V === 'C') { if (cracks.length < [1, 3, 7, 14][stage] && R(.03)) addCrack(); if (R([.004, .012, .025, .045][stage])) escape(); if (stage >= 2 && R(stage === 3 ? .03 : .012)) drift(); }
  };
  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('click', onClick, true);
  loop();
  const timer = setInterval(tick, 110);
  return () => { clearInterval(timer); cancelAnimationFrame(raf); document.removeEventListener('mousemove', onMove); document.removeEventListener('click', onClick, true); cleanup(); };
}
