// Shared by the domain services: optional text that is missing or only whitespace is stored as NULL. Pure.
export function mapBlankTextToNull(text) {
  if (text === undefined || text === null) return null;
  if (typeof text === 'string' && text.trim() === '') return null;
  return text;
}
