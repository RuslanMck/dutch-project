// Formats a Date as the local calendar date YYYY-MM-DD. Pure.
export function formatLocalCalendarDate(date) {
  const padToTwoDigits = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${padToTwoDigits(date.getMonth() + 1)}-${padToTwoDigits(date.getDate())}`;
}
