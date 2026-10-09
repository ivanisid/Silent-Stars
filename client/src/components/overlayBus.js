// Ліва рейка й магазин — бічні панелі з різних компонентів, а відкритою може бути лише
// одна: відкриття однієї закриває іншу. Звʼязок через подію на window, щоб не тягнути
// спільний стан через усі сторінки.

const EVENT = 'ss:side-panel';

// Повідомити, що панель `who` відкрилась.
export function announceOpen(who) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: who }));
}

// Викликати onOther, коли відкрилась будь-яка інша панель. Повертає відписку.
export function onOtherOpen(who, onOther) {
  const fn = (e) => e.detail !== who && onOther();
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

// Відкрити магазин на вкладці tab ('repair' | 'mana' | 'ins') — з панелей профілю.
const SHOP_EVENT = 'ss:open-shop';
export function openShop(tab) {
  window.dispatchEvent(new CustomEvent(SHOP_EVENT, { detail: tab }));
}
export function onOpenShop(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener(SHOP_EVENT, h);
  return () => window.removeEventListener(SHOP_EVENT, h);
}

// Вибрати покращення в панелі «Особисті покращення» і прокрутити до неї — з магазину.
const UPGRADE_EVENT = 'ss:select-upgrade';
export function showUpgrade(key) {
  window.dispatchEvent(new CustomEvent(UPGRADE_EVENT, { detail: key }));
  const el = document.getElementById('upgrades');
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
}
export function onShowUpgrade(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener(UPGRADE_EVENT, h);
  return () => window.removeEventListener(UPGRADE_EVENT, h);
}

// Esc спершу закриває модальне вікно (у нього свій обробник), і лише потім бічні панелі.
export function modalIsOpen() {
  return !!document.querySelector('.modal-backdrop');
}
