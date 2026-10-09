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

// Esc спершу закриває модальне вікно (у нього свій обробник), і лише потім бічні панелі.
export function modalIsOpen() {
  return !!document.querySelector('.modal-backdrop');
}
