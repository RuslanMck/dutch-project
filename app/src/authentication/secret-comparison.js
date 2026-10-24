// Constant-time checks of secrets and bearer tokens. Pure apart from hashing.
import crypto from 'node:crypto';

// Timing-safe comparison of two strings; hashing first makes the lengths equal.
export function isSameSecret(givenSecret, expectedSecret) {
  return crypto.timingSafeEqual(hashText(givenSecret), hashText(expectedSecret));
}

// The token from an "Authorization: Bearer <token>" header, or null.
export function readBearerToken(request) {
  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) return null;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  return bearerMatch ? bearerMatch[1].trim() : null;
}

// The value of an "x-api-key" header, or null. claude.ai connectors send secrets this way, because they reserve
// the Authorization header for OAuth.
export function readApiKey(request) {
  const apiKeyHeader = request.headers['x-api-key'];
  return typeof apiKeyHeader === 'string' && apiKeyHeader.trim() !== '' ? apiKeyHeader.trim() : null;
}

// True when the request carries the expected bearer token. An empty expected token accepts nobody.
export function hasValidBearerToken(request, expectedToken) {
  const bearerToken = readBearerToken(request);
  return Boolean(expectedToken) && bearerToken !== null && isSameSecret(bearerToken, expectedToken);
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text)).digest();
}
