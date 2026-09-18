'use strict';

// Calendar helpers. Days are identified by local-date keys ("2026-09-18").
// All day arithmetic goes through an integer day number (days since 1970-01-01,
// computed in UTC) so DST changes can never skip or repeat a day.

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

/** Local calendar date key for a timestamp, e.g. "2026-09-18". */
function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** Integer day number for a day key. */
function dayNum(key) {
  return Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000);
}

/** Day key for an integer day number. */
function keyFromNum(n) {
  const d = new Date(n * 86400000);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

const addDays = (key, n) => keyFromNum(dayNum(key) + n);

/** 0 is Sunday, 6 is Saturday. 1970-01-01 was a Thursday. */
const weekdayOf = (key) => (dayNum(key) + 4) % 7;

const monthKeyOf = (key) => key.slice(0, 7);
const monthStartKey = (key) => key.slice(0, 8) + '01';
const yearStartKey = (key) => key.slice(0, 4) + '-01-01';

/** First day of the week containing `key`. `weekStartsOn`: 0 = Sunday, 1 = Monday, 6 = Saturday. */
function weekStartKey(key, weekStartsOn) {
  return addDays(key, -((weekdayOf(key) - weekStartsOn + 7) % 7));
}

/** Previous month's start key for a "YYYY-MM-DD" key. */
function prevMonthStartKey(key) {
  let y = +key.slice(0, 4);
  let m = +key.slice(5, 7) - 1;
  if (m === 0) { y--; m = 12; }
  return y + '-' + pad2(m) + '-01';
}

/**
 * Compact duration: 45s, 23m, 1h 5m, 2h, 210h. `dropMinutesFrom` hides the
 * minutes once the hour count reaches it, to keep the status bar short.
 */
function formatDuration(sec, dropMinutesFrom = Infinity) {
  sec = Math.max(0, Math.floor(sec) || 0);
  if (sec === 0) return '0m';
  if (sec < 60) return sec + 's';
  const totalMin = Math.floor(sec / 60);
  if (totalMin < 60) return totalMin + 'm';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 || h >= dropMinutesFrom ? h + 'h' : h + 'h ' + m + 'm';
}

module.exports = {
  dayKey, dayNum, keyFromNum, addDays, weekdayOf,
  monthKeyOf, monthStartKey, yearStartKey, weekStartKey, prevMonthStartKey,
  formatDuration,
};
