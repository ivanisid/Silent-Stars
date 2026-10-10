import { useSyncExternalStore } from 'react';

// Colour themes. Most are ported from COMP/CON; FERUM//VOX and KARRAKIN are ours. Each one
// is a set of CSS variable overrides in styles/theme.css, selected by a data-theme attribute
// on <html>; KARRAKIN additionally reads data-house, which picks the banner its colours are
// mixed from. The swatch hexes are literal on purpose — they preview a theme other than the
// one currently applied, so they cannot come from variables.

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
  { id: 'ferum', label: 'FERUM//VOX', dark: true, swatch: ['#0c1117', '#2a3e54', '#6ea4d8'] },
  { id: 'karrakin', label: 'KARRAKIN', dark: true, swatch: ['#1a1814', '#5fa883', '#f0f0ea'] },
];

// Доми Карракіна в порядку циклу кліком по прапору. light — світла основа (свій блок змінних).
export const HOUSES = [
  { id: 'water', label: 'Дім Води' },
  { id: 'remembrance', label: 'Дім Пам’яті' },
  { id: 'sand', label: 'Дім Піску' },
  { id: 'dust', label: 'Дім Пилу' },
  { id: 'stone', label: 'Дім Каменю' },
  { id: 'promise', label: 'Дім Обіцянки', light: true },
  { id: 'smoke', label: 'Дім Диму' },
  { id: 'moments', label: 'Дім Миттєвостей' },
  { id: 'glass', label: 'Дім Скла', light: true },
  { id: 'order', label: 'Дім Порядку' },
];

const STORAGE_KEY = 'ferumvox.theme';
const HOUSE_KEY = 'ferumvox.house';
const DEFAULT_THEME = 'ferum';
const DEFAULT_HOUSE = 'water';

export function themeLabel(id) {
  return THEMES.find((t) => t.id === id)?.label || '—';
}

export function houseInfo(id) {
  return HOUSES.find((h) => h.id === id) || HOUSES[0];
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // private mode / storage disabled — fall back to the default
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // choice just won't persist
  }
}

export function loadTheme() {
  const saved = read(STORAGE_KEY);
  return THEMES.some((t) => t.id === saved) ? saved : DEFAULT_THEME;
}

export function loadHouse() {
  const saved = read(HOUSE_KEY);
  return HOUSES.some((h) => h.id === saved) ? saved : DEFAULT_HOUSE;
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

// Тема й дім живуть на <html>; компоненти (шапка з прапором, рейка зі списком тем)
// підписуються через useThemeState, щоб зміна в одному місці одразу була видна в іншому.
const listeners = new Set();
let snapshot = { theme: DEFAULT_THEME, house: DEFAULT_HOUSE };

function publish(next) {
  snapshot = next;
  listeners.forEach((fn) => fn());
}

function paint({ theme, house }) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (theme === 'karrakin') root.dataset.house = house;
  else delete root.dataset.house;
  syncThemeColor();
}

export function applyTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
  const next = { theme, house: snapshot.house };
  paint(next);
  write(STORAGE_KEY, theme);
  publish(next);
  return theme;
}

export function applyHouse(id) {
  const house = HOUSES.some((h) => h.id === id) ? id : DEFAULT_HOUSE;
  const next = { theme: snapshot.theme, house };
  paint(next);
  write(HOUSE_KEY, house);
  publish(next);
  return house;
}

export function nextHouse() {
  const i = HOUSES.findIndex((h) => h.id === snapshot.house);
  return applyHouse(HOUSES[(i + 1) % HOUSES.length].id);
}

// Before the first paint, so the saved theme doesn't flash the default one first.
export function initTheme() {
  snapshot = { theme: loadTheme(), house: loadHouse() };
  paint(snapshot);
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useThemeState() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
