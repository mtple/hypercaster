/**
 * Display formatting, matching the upstream interface's conventions:
 * "5m" / "3h" / "2d" relative times and "1.2K" / "631K" counts.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Short distance from now, rounded down. Empty when the time is unknown. */
function timeAgo(timestampMs: number | null, now: number = Date.now()): string {
  if (timestampMs === null) {
    return '';
  }
  const elapsed = Math.max(0, now - timestampMs);
  if (elapsed < MINUTE) {
    return `${Math.floor(elapsed / SECOND)}s`;
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h`;
  }
  if (elapsed < MONTH) {
    return `${Math.floor(elapsed / DAY)}d`;
  }
  if (elapsed < YEAR) {
    return `${Math.floor(elapsed / MONTH)}mo`;
  }
  return `${Math.floor(elapsed / YEAR)}y`;
}

/** "11:18:00 AM · 11/15/2026" in the reader's locale. */
function exactTime(timestampMs: number | null): string {
  if (timestampMs === null) {
    return 'Time unknown';
  }
  const date = new Date(timestampMs);
  return `${date.toLocaleTimeString()} · ${date.toLocaleDateString()}`;
}

const UNITS = ['', 'K', 'M', 'B', 'T'];

/**
 * One decimal below ten thousand ("1.2K"), none above ("12K", "2M").
 */
function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  if (value < 1000) {
    return String(Math.floor(value));
  }
  let scaled = value;
  let unit = 0;
  while (scaled >= 1000 && unit < UNITS.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  const precision = value < 10000 ? 1 : 0;
  let rounded = Number(scaled.toFixed(precision));
  // 999.6K rounds to 1000K: carry into the next unit.
  if (rounded >= 1000 && unit < UNITS.length - 1) {
    rounded = Number((rounded / 1000).toFixed(precision));
    unit += 1;
  }
  return `${rounded}${UNITS[unit]}`;
}

const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

export { exactTime, formatCount, pluralize, timeAgo };
