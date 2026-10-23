// Decides whether a dictionary entry is a single word or an expression. Pure.
const MINIMUM_EXPRESSION_TOKEN_COUNT = 3;

// 'expression' when the text has three or more whitespace-separated tokens or ends with '?' or '.'.
export function detectWordKind(dutchText) {
  const trimmedText = String(dutchText ?? '').trim();
  const tokenCount = trimmedText.split(/\s+/).filter(Boolean).length;
  return tokenCount >= MINIMUM_EXPRESSION_TOKEN_COUNT || /[?.]$/.test(trimmedText) ? 'expression' : 'word';
}
