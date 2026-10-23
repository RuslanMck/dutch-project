// Maps fields of the artifact export to the app's values. Pure.

// "5.5 · прикметник" -> code 5.5, category прикметник; "Д1 · дієслово" -> Д1; "5.5" -> 5.5.
const RULE_TOPIC_PATTERN = /^(\S+)(?:\s*·\s*(.+))?$/;
const EXAMPLE_SEPARATOR = ' — ';

// Returns { code, category, isParsed }. An unparsable topic keeps the rule's export id as its code.
export function parseRuleTopic(exportedRule) {
  const topicMatch = RULE_TOPIC_PATTERN.exec(String(exportedRule.topic ?? '').trim());
  if (!topicMatch) return { code: exportedRule.id, category: null, isParsed: false };
  return { code: topicMatch[1], category: topicMatch[2]?.trim() || null, isParsed: true };
}

// "Dutch — Ukrainian" is split on the first separator; an example without one is Dutch only.
export function splitExample(exampleText) {
  const trimmedExample = (exampleText ?? '').trim();
  if (!trimmedExample) return { exampleDutch: null, exampleUkrainian: null };
  const separatorIndex = trimmedExample.indexOf(EXAMPLE_SEPARATOR);
  if (separatorIndex < 0) return { exampleDutch: trimmedExample, exampleUkrainian: null };
  return {
    exampleDutch: trimmedExample.slice(0, separatorIndex).trim() || null,
    exampleUkrainian: trimmedExample.slice(separatorIndex + EXAMPLE_SEPARATOR.length).trim() || null,
  };
}

// 'YYYY-MM-DD' -> milliseconds at UTC midnight, or null when the date is not valid.
export function parseCalendarDateToTimestamp(calendarDate) {
  const timestamp = Date.parse(`${calendarDate}T00:00:00Z`);
  return Number.isNaN(timestamp) ? null : timestamp;
}
