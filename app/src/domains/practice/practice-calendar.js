// Calendar dates (YYYY-MM-DD) and day boundaries in a time zone. Pure: no clock, no I/O.
const MILLISECONDS_PER_SECOND = 1000;

// Building an Intl.DateTimeFormat is slow, and a list of words formats one date per word, so each formatter is
// built once per time zone and reused. The formatters never change, so the caches cannot change any result.
const dateFormatterByTimeZone = new Map();
const partFormatterByTimeZone = new Map();

// The calendar date the time zone shows at the instant, e.g. '2026-10-25'.
export function formatCalendarDateInTimeZone(timestamp, timeZone) {
  return findOrCreateFormatter(dateFormatterByTimeZone, timeZone, createDateFormatter).format(new Date(timestamp));
}

// UTC milliseconds of 00:00 in the time zone on the calendar date. Days can be 23 or 25 hours long across DST.
export function findStartOfDay(calendarDate, timeZone) {
  const [year, month, day] = parseCalendarDate(calendarDate);
  const wallClockMilliseconds = Date.UTC(year, month - 1, day);
  const firstGuess = wallClockMilliseconds - calculateZoneOffsetMilliseconds(wallClockMilliseconds, timeZone);
  // The offset at the first guess can differ from the offset at midnight when a transition falls between them.
  const secondGuess = wallClockMilliseconds - calculateZoneOffsetMilliseconds(firstGuess, timeZone);
  return formatCalendarDateInTimeZone(secondGuess, timeZone) === calendarDate ? secondGuess : firstGuess;
}

// Adds whole days to a calendar date using UTC arithmetic only, so no time zone is involved.
export function addDaysToCalendarDate(calendarDate, dayCount) {
  const [year, month, day] = parseCalendarDate(calendarDate);
  const shiftedDate = new Date(Date.UTC(year, month - 1, day + dayCount));
  return shiftedDate.toISOString().slice(0, 10);
}

// The hour (0–23) the time zone shows at the instant.
export function findHourInTimeZone(timestamp, timeZone) {
  const partFormatter = findOrCreateFormatter(partFormatterByTimeZone, timeZone, createPartFormatter);
  const hourPart = partFormatter.formatToParts(new Date(timestamp)).find(part => part.type === 'hour');
  return Number(hourPart.value) % 24;
}

function parseCalendarDate(calendarDate) {
  return calendarDate.split('-').map(Number);
}

function findOrCreateFormatter(formatterByTimeZone, timeZone, createFormatter) {
  if (!formatterByTimeZone.has(timeZone)) formatterByTimeZone.set(timeZone, createFormatter(timeZone));
  return formatterByTimeZone.get(timeZone);
}

function createDateFormatter(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function createPartFormatter(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
}

// Offset of the time zone from UTC at the instant, in milliseconds (Amsterdam in summer: 7200000).
function calculateZoneOffsetMilliseconds(timestamp, timeZone) {
  const partFormatter = findOrCreateFormatter(partFormatterByTimeZone, timeZone, createPartFormatter);
  const valueByPartType = Object.fromEntries(
    partFormatter.formatToParts(new Date(timestamp)).map(part => [part.type, Number(part.value)]),
  );
  const wallClockAsUtcMilliseconds = Date.UTC(
    valueByPartType.year,
    valueByPartType.month - 1,
    valueByPartType.day,
    valueByPartType.hour,
    valueByPartType.minute,
    valueByPartType.second,
  );
  const wholeSecondTimestamp = Math.floor(timestamp / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND;
  return wallClockAsUtcMilliseconds - wholeSecondTimestamp;
}
