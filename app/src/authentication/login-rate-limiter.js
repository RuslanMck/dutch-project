// Counts failed logins per client address, in memory: after MAXIMUM_FAILED_LOGINS within the window, logins from
// that address are refused until the window ends.
const MAXIMUM_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MILLISECONDS = 15 * 60_000;

export function createLoginRateLimiter({ clock }) {
  const failedLoginsByAddress = new Map();   // address -> { count, resetAt }

  function isLimited(address) {
    const failedLogins = failedLoginsByAddress.get(address);
    if (!failedLogins) return false;
    if (clock.now() >= failedLogins.resetAt) {
      failedLoginsByAddress.delete(address);
      return false;
    }
    return failedLogins.count >= MAXIMUM_FAILED_LOGINS;
  }

  function recordFailedLogin(address) {
    const now = clock.now();
    let failedLogins = failedLoginsByAddress.get(address);
    if (!failedLogins || now >= failedLogins.resetAt) {
      failedLogins = { count: 0, resetAt: now + FAILED_LOGIN_WINDOW_MILLISECONDS };
      failedLoginsByAddress.set(address, failedLogins);
    }
    failedLogins.count += 1;
  }

  function clearFailedLogins(address) {
    failedLoginsByAddress.delete(address);
  }

  return Object.freeze({ isLimited, recordFailedLogin, clearFailedLogins });
}
