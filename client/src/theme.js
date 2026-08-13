// Colour themes ported from COMP/CON. Each one is a set of CSS variable overrides
// in styles/theme.css, selected by a data-theme attribute on <html>; GMS Dark is
// the bare :root default. The swatch hexes are literal on purpose — they preview a
// theme other than the one currently applied, so they cannot come from variables.

export const THEMES = [
  { id: 'gms-dark', label: 'GMS Dark', dark: true, swatch: ['#212d40', '#802932', '#dd5562'] },
  { id: 'gms', label: 'GMS Light', dark: false, swatch: ['#cccccc', '#991E2A', '#8c1420'] },
  { id: 'horus', label: 'HORUS Terminal', dark: true, swatch: ['#333333', '#126127', '#00d900'] },
  { id: 'horizon', label: 'HORIZON Operative', dark: true, swatch: ['#333333', '#233943', '#ce7100'] },
  { id: 'msmc', label: 'MSMC Solarized', dark: true, swatch: ['#293940', '#146464', '#1dc2c2'] },
  { id: 'lc-solarized', label: 'Low Contrast Solarized', dark: true, swatch: ['#4c585e', '#1b4e4e', '#2fa3a3'] },
  { id: 'galsim', label: 'FORECAST/GALSIM', dark: true, swatch: ['#373737', '#e36600', '#4974bf'] },
  { id: 'ha', label: 'Harrison Armory Ras Shamra', dark: true, swatch: ['#373737', '#771675', '#e080de'] },
  { id: 'ipsn', label: 'IPS-N Carina', dark: false, swatch: ['#c9c7c7', '#1952A2', '#19A2A2'] },
  { id: 'ssc', label: 'SSC Constellar Congress', dark: false, swatch: ['#dbcfc3', '#d1920a', '#b58900'] },
  { id: 'hc-dark', label: 'High Contrast Dark', dark: true, swatch: ['#1b212b', '#4b0c13', '#ffabb3'] },
  { id: 'mono', label: 'Monochrome', dark: true, swatch: ['#131313', '#2a2a2a', '#d6d6d6'] },
];

const STORAGE_KEY = 'ferumvox.theme';
const DEFAULT_THEME = 'gms-dark';

export function themeLabel(id) {
  return THEMES.find((t) => t.id === id)?.label || '—';
}

export function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    // private mode / storage disabled — fall back to the default
  }
  return DEFAULT_THEME;
}

// The browser paints its own chrome — the address bar on Android, the status bar area of an
// installed PWA — from this tag, so without it the phone frames a themed page in stock colours.
// Read after the attribute is set: custom properties resolve synchronously.
function syncThemeColor() {
  const header = getComputedStyle(document.documentElement).getPropertyValue('--header').trim();
  if (!header) return;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', header);
}

export function applyTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  syncThemeColor();
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // choice just won't persist
  }
  return theme;
}
