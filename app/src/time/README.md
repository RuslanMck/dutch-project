# time

Time as a dependency: services receive a clock instead of calling `Date.now()`, so tests can control it.

## Files

| File | What it does |
|---|---|
| `system-clock.js` | `createSystemClock`: the real clock, with `now()` in milliseconds. |
| `calendar-date-formatting.js` | `formatLocalCalendarDate`: a `Date` as the local calendar date `YYYY-MM-DD`. Pure. |
