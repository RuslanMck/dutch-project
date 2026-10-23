// The real clock. Services receive a clock so tests can control time.
export function createSystemClock() {
  return Object.freeze({
    now() {
      return Date.now();
    },
  });
}
