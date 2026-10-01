// Рівні складності місії та нагорода за них.
//
// Складність — швидкий спосіб заповнити обидва поля нагороди при створенні слота,
// і водночас підказка гравцям, на який ЛЛ місія розрахована. Вона зберігається в слоті
// окремим полем, а не виводиться з чисел: числа тут ще змінюватимуться, і виведена
// мітка переписала б заднім числом усі старі слоти.
//
// Діапазони ЛЛ подані як у правилах і місцями перекриваються (ЛЛ7 є і в «Легка++»,
// і в «Середня»; ЛЛ11 — і у «Важка», і у «Важка+»). Це рекомендація для ГМа, а не
// перевірка, тож перекриття лишене як є.

export const DIFFICULTIES = [
  { key: 'easy', label: 'Легка', ll: 'LL2–3', mana: 300, pr: 10 },
  { key: 'easy+', label: 'Легка+', ll: 'LL4–5', mana: 375, pr: 13 },
  { key: 'easy++', label: 'Легка++', ll: 'LL6–7', mana: 450, pr: 15 },

  { key: 'mid', label: 'Середня', ll: 'LL7–8', mana: 500, pr: 20 },
  { key: 'mid+', label: 'Середня+', ll: 'LL8–9', mana: 600, pr: 25 },
  { key: 'mid++', label: 'Середня++', ll: 'LL9–10', mana: 700, pr: 30 },

  { key: 'hard', label: 'Важка', ll: 'LL10–11', mana: 800, pr: 35 },
  { key: 'hard+', label: 'Важка+', ll: 'LL11', mana: 1000, pr: 45 },
  { key: 'hard++', label: 'Важка++', ll: 'LL12', mana: 1200, pr: 50 },
];

// Групи для розкладки кнопок: три рядки по три.
export const DIFFICULTY_GROUPS = [
  DIFFICULTIES.slice(0, 3),
  DIFFICULTIES.slice(3, 6),
  DIFFICULTIES.slice(6, 9),
];

export function difficultyByKey(key) {
  if (!key) return null;
  return DIFFICULTIES.find((d) => d.key === key) || null;
}

// Підпис для картки слота: «Середня+ · рек. LL8–9».
export function difficultyLabel(key) {
  const d = difficultyByKey(key);
  return d ? `${d.label} · рек. ${d.ll}` : null;
}
