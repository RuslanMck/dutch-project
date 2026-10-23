// The signed browser session cookie. Its value is "<expiresAtMilliseconds>.<hex HMAC-SHA256 of that, keyed with
// the session secret>", so the server keeps no session state.
import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'dutch_session';
export const SESSION_MAXIMUM_AGE_SECONDS = 15552000;   // 180 days

export function createSessionCookie({ sessionSecret, clock }) {
  function createSessionValue() {
    const expiresAtText = String(clock.now() + SESSION_MAXIMUM_AGE_SECONDS * 1000);
    return `${expiresAtText}.${signText(expiresAtText)}`;
  }

  function isValidSessionValue(sessionValue) {
    if (typeof sessionValue !== 'string') return false;
    const separatorIndex = sessionValue.indexOf('.');
    if (separatorIndex < 0) return false;
    const expiresAtText = sessionValue.slice(0, separatorIndex);
    const signature = sessionValue.slice(separatorIndex + 1);
    if (!/^\d+$/.test(expiresAtText) || !(Number(expiresAtText) > clock.now())) return false;
    const expectedSignature = signText(expiresAtText);
    return signature.length === expectedSignature.length
      && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  // The session cookie's value from the Cookie header, or undefined.
  function readSessionValue(request) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;
    for (const cookiePart of cookieHeader.split(';')) {
      const separatorIndex = cookiePart.indexOf('=');
      if (separatorIndex >= 0 && cookiePart.slice(0, separatorIndex).trim() === SESSION_COOKIE_NAME) {
        return cookiePart.slice(separatorIndex + 1).trim();
      }
    }
    return undefined;
  }

  function signText(text) {
    return crypto.createHmac('sha256', sessionSecret).update(text).digest('hex');
  }

  return Object.freeze({ createSessionValue, isValidSessionValue, readSessionValue });
}
