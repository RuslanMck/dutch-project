// Middleware: lets a request through with a valid session cookie or bearer token. Otherwise /api/* gets 401 JSON
// and any page request is redirected to /login.
import { hasValidBearerToken } from './secret-comparison.js';

export function createRequireAuthentication({ apiToken, sessionCookie }) {
  return function requireAuthentication(request, response, next) {
    const isAuthenticated = hasValidBearerToken(request, apiToken)
      || sessionCookie.isValidSessionValue(sessionCookie.readSessionValue(request));
    if (isAuthenticated) return next();
    if (request.path === '/api' || request.path.startsWith('/api/')) {
      return response.status(401).json({ error: 'unauthorized' });
    }
    return response.redirect(303, '/login');
  };
}
