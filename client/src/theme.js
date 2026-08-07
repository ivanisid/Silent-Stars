// Colour themes. Each one is a set of CSS variable overrides in styles/theme.css,
// selected by a data-theme attribute on <html>; UNION is the bare :root default.
// The swatch hexes are literal on purpose — they preview a theme other than the
// one currently applied, so they cannot come from the variables.

export const THEMES = [
  { id: 'union', label: 'ЮНІОН', swatch: ['#0e1622', '#17385c', '#5fb3ff'] },
  { id: 'hespera', label: 'ГЕСПЕРА', swatch: ['#1a100a', '#5c3117', '#ff9a4d'] },
  { id: 'quarantine', label: 'КАРАНТИН', swatch: ['#081a12', '#14512f', '#5fe39a'] },
  { id: 'void', label: 'ПУСТКА', swatch: ['#150e22', '#3d2170', '#b98cff'] },
];

const STORAGE_KEY = 'ferumvox.theme';
const DEFAULT_THEME = 'union';

export function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    // private mode / storage disabled — fall back to the default
  }
  return DEFAULT_THEME;
}

export function applyTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // choice just won't persist
  }
  return theme;
}
