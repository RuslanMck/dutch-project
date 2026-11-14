// Ukrainian plural form by count, for texts the server writes. Pure.
// forms: [one, few, many]. 1, 21, 101 take one; 2–4, 22–24 take few; 0, 5–20, 11–14 and the rest take many.
// pluralize(5, ['слово', 'слова', 'слів']) is 'слів'.
export function pluralize(count, [one, few, many]) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}
