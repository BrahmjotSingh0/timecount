'use strict';

// One day of tracked time and the functions that work on it:
//
//   { total, hours: [24 numbers], projects: { name: secs },
//     languages: { id: secs }, sessions: [[start, end, activeSecs], ...] }
//
// Sessions are stored as intervals so that several windows writing the same day
// can be merged into the right sessions.

/** @typedef {{ total: number, hours: number[], projects: Record<string, number>, languages: Record<string, number>, sessions: number[][] }} DayRecord */

const SESSION_GAP_SEC = 15 * 60;
/** A day only counts as "active" (averages, streaks) once it reaches this. */
const MIN_ACTIVE_DAY_SEC = 60;

// Maps use a null prototype so a project named "constructor" or "__proto__" is just a key.
const newMap = () => Object.create(null);

function newDay() {
  return { total: 0, hours: new Array(24).fill(0), projects: newMap(), languages: newMap(), sessions: [] };
}

function bump(map, key, n) {
  map[key] = (map[key] || 0) + n;
}

/** Credit `secs` seconds of activity that ended at `endSec` (epoch seconds). */
function record(day, endSec, secs, hour, project, language) {
  day.total += secs;
  day.hours[hour] += secs;
  if (project) bump(day.projects, project, secs);
  if (language) bump(day.languages, language, secs);

  const s = day.sessions;
  const last = s[s.length - 1];
  if (last && endSec - last[1] <= SESSION_GAP_SEC) {
    if (endSec > last[1]) last[1] = endSec;
    last[2] += secs;
  } else {
    s.push([endSec - secs, endSec, secs]);
  }
}

/** Merge sessions that are within SESSION_GAP_SEC of each other. Returns fresh arrays. */
function coalesce(list) {
  const sorted = list.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] - last[1] <= SESSION_GAP_SEC) {
      if (s[1] > last[1]) last[1] = s[1];
      last[2] += s[2];
    } else {
      out.push([s[0], s[1], s[2]]);
    }
  }
  return out;
}

/** a += b (in place). Never aliases anything owned by `b`. */
function mergeDay(a, b) {
  a.total += b.total;
  for (let i = 0; i < 24; i++) a.hours[i] += b.hours[i];
  for (const k in b.projects) bump(a.projects, k, b.projects[k]);
  for (const k in b.languages) bump(a.languages, k, b.languages[k]);
  if (b.sessions.length) a.sessions = coalesce(a.sessions.concat(b.sessions));
  return a;
}

// Reading from disk. The files can be edited by hand, so nothing in them is trusted.

const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v) : 0);

function sanitizeMap(raw) {
  const out = newMap();
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      const v = num(raw[k]);
      if (v > 0) out[k.slice(0, 200)] = v;
    }
  }
  return out;
}

function sanitizeDay(raw) {
  const day = newDay();
  if (!raw || typeof raw !== 'object') return day;
  day.total = num(raw.total);
  if (Array.isArray(raw.hours)) for (let i = 0; i < 24; i++) day.hours[i] = num(raw.hours[i]);
  day.projects = sanitizeMap(raw.projects);
  day.languages = sanitizeMap(raw.languages);
  if (Array.isArray(raw.sessions)) {
    const list = [];
    for (const s of raw.sessions) {
      if (Array.isArray(s) && num(s[0]) > 0 && num(s[1]) >= num(s[0])) list.push([num(s[0]), num(s[1]), num(s[2])]);
    }
    day.sessions = coalesce(list);
  }
  return day;
}

module.exports = {
  SESSION_GAP_SEC, MIN_ACTIVE_DAY_SEC,
  newDay, record, coalesce, mergeDay, sanitizeDay,
};
