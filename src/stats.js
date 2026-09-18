'use strict';

// Pure functions that turn day records into numbers. No I/O and no VS Code API.

const T = require('./time');
const { MIN_ACTIVE_DAY_SEC, SESSION_GAP_SEC } = require('./model');
const { NO_EDITOR, languageName } = require('./languages');

const PROJECT_LIST_LIMIT = 8;

/** Sum of tracked seconds over an inclusive range of day keys. */
function sumRange(days, fromKey, toKey) {
  let total = 0;
  for (let n = T.dayNum(fromKey), end = T.dayNum(toKey); n <= end; n++) {
    const d = days.get(T.keyFromNum(n));
    if (d) total += d.total;
  }
  return total;
}

/**
 * The headline numbers. Cheap enough to run every few seconds (one pass over
 * all days plus a handful of short range sums).
 *
 * @param {Map<string, import('./model').DayRecord>} days
 * @param {number} nowMs
 * @param {{ weekStartsOn?: number, goalSec?: number }} [opts]
 */
function summarize(days, nowMs, { weekStartsOn = 1, goalSec = 0 } = {}) {
  const todayKey = T.dayKey(nowMs);
  const yesterdayKey = T.addDays(todayKey, -1);
  const weekStart = T.weekStartKey(todayKey, weekStartsOn);
  const monthStart = T.monthStartKey(todayKey);
  const todayN = T.dayNum(todayKey);

  // All-time totals, active days and streaks in a single pass.
  let total = 0;
  let activeDays = 0;
  let firstKey = null;
  let bestKey = null;
  let bestSec = 0;
  const activeNums = [];
  for (const [key, d] of days) {
    total += d.total;
    if (d.total > 0 && (firstKey === null || key < firstKey)) firstKey = key;
    if (d.total >= MIN_ACTIVE_DAY_SEC) {
      activeDays++;
      activeNums.push(T.dayNum(key));
      if (d.total > bestSec) {
        bestSec = d.total;
        bestKey = key;
      }
    }
  }
  activeNums.sort((a, b) => a - b);
  let run = 0;
  let longestStreak = 0;
  let prev = -Infinity;
  for (const n of activeNums) {
    run = n === prev + 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = n;
  }
  // A streak is only broken once a whole day has passed without activity.
  const lastActive = activeNums[activeNums.length - 1];
  const currentStreak = lastActive === todayN || lastActive === todayN - 1 ? run : 0;

  const todayRec = days.get(todayKey);
  const todayTotal = todayRec ? todayRec.total : 0;
  const yesterdayRec = days.get(yesterdayKey);

  // Averages before today, so today can be compared against them fairly.
  const todayActive = todayTotal >= MIN_ACTIVE_DAY_SEC;
  const priorDays = activeDays - (todayActive ? 1 : 0);
  const avgPrior = priorDays > 0 ? (total - todayTotal) / priorDays : 0;

  // "To date" comparisons: this week so far vs the same weekdays last week, etc.
  const lastWeekStart = T.addDays(weekStart, -7);
  const lastMonthStart = T.prevMonthStartKey(todayKey);
  const lastMonthEnd = T.addDays(monthStart, -1);
  const lastMonthTo = T.addDays(lastMonthStart, todayN - T.dayNum(monthStart));

  let sessionsToday = 0;
  let longestToday = 0;
  let currentSession = 0;
  if (todayRec) {
    sessionsToday = todayRec.sessions.length;
    for (const s of todayRec.sessions) if (s[2] > longestToday) longestToday = s[2];
    const last = todayRec.sessions[sessionsToday - 1];
    if (last && Math.floor(nowMs / 1000) - last[1] <= SESSION_GAP_SEC) currentSession = last[2];
  }

  return {
    todayKey,
    today: todayTotal,
    yesterday: yesterdayRec ? yesterdayRec.total : 0,
    week: sumRange(days, weekStart, todayKey),
    weekPrev: sumRange(days, lastWeekStart, T.addDays(lastWeekStart, todayN - T.dayNum(weekStart))),
    month: sumRange(days, monthStart, todayKey),
    monthPrev: sumRange(days, lastMonthStart, lastMonthTo < lastMonthEnd ? lastMonthTo : lastMonthEnd),
    year: sumRange(days, T.yearStartKey(todayKey), todayKey),
    total,
    activeDays,
    avg: activeDays > 0 ? total / activeDays : 0,
    avgPrior,
    firstKey,
    bestDay: bestKey ? { key: bestKey, sec: bestSec } : null,
    streak: { current: currentStreak, longest: longestStreak },
    sessionsToday,
    longestToday,
    currentSession,
    goalSec,
    goalPct: goalSec > 0 ? todayTotal / goalSec : 0,
  };
}

/** Top-N rows plus an aggregated "Other" row. */
function topList(map, limit, nameOf) {
  /** @type {{ id: string, name: string, sec: number, other?: number }[]} */
  const rows = Object.keys(map)
    .map((id) => ({ id, name: nameOf(id), sec: map[id] }))
    .sort((a, b) => b.sec - a.sec || (a.name < b.name ? -1 : 1));
  if (rows.length <= limit) return rows;
  const head = rows.slice(0, limit);
  const rest = rows.slice(limit);
  head.push({ id: '', name: 'Other', sec: rest.reduce((s, r) => s + r.sec, 0), other: rest.length });
  return head;
}

/**
 * Everything the dashboard charts need for one date range: the time series
 * (bucketed by day / week / month depending on the span), the hour-of-day and
 * weekday distributions and the project / language breakdowns.
 */
function rangeData(days, fromKey, toKey, weekStartsOn) {
  const fromN = T.dayNum(fromKey);
  const toN = T.dayNum(toKey);
  const bucket = toN - fromN + 1 <= 92 ? 'day' : toN - fromN + 1 <= 380 ? 'week' : 'month';

  const hours = new Array(24).fill(0);
  const weekdayTotals = new Array(7).fill(0);
  const weekdayCounts = new Array(7).fill(0);
  const projects = Object.create(null);
  const languages = Object.create(null);
  const points = new Map();
  let total = 0;
  let activeDays = 0;

  for (let n = fromN; n <= toN; n++) {
    const key = T.keyFromNum(n);
    const d = days.get(key);
    const sec = d ? d.total : 0;
    const wd = (n + 4) % 7;
    weekdayCounts[wd]++;
    weekdayTotals[wd] += sec;

    const bk = bucket === 'day' ? key : bucket === 'week' ? T.weekStartKey(key, weekStartsOn) : T.monthStartKey(key);
    points.set(bk, (points.get(bk) || 0) + sec);

    if (!d) continue;
    total += sec;
    if (sec >= MIN_ACTIVE_DAY_SEC) activeDays++;
    for (let h = 0; h < 24; h++) hours[h] += d.hours[h];
    for (const k in d.projects) projects[k] = (projects[k] || 0) + d.projects[k];
    for (const k in d.languages) languages[k] = (languages[k] || 0) + d.languages[k];
  }

  return {
    from: fromKey,
    to: toKey,
    bucket,
    total,
    activeDays,
    points: [...points].map(([k, s]) => ({ k, s })),
    hours,
    weekdayTotals,
    weekdayCounts,
    projects: topList(projects, PROJECT_LIST_LIMIT, (id) => id),
    languages: topList(languages, PROJECT_LIST_LIMIT, languageName),
  };
}

/** Top project and language for a range (used by the status bar tooltip). */
function topOf(days, fromKey, toKey) {
  const projects = Object.create(null);
  const languages = Object.create(null);
  for (let n = T.dayNum(fromKey), end = T.dayNum(toKey); n <= end; n++) {
    const d = days.get(T.keyFromNum(n));
    if (!d) continue;
    for (const k in d.projects) projects[k] = (projects[k] || 0) + d.projects[k];
    for (const k in d.languages) languages[k] = (languages[k] || 0) + d.languages[k];
  }
  const best = (map, skip) => {
    let id = null;
    let sec = 0;
    for (const k in map) if (k !== skip && map[k] > sec) { id = k; sec = map[k]; }
    return id === null ? null : { id, sec };
  };
  const project = best(projects);
  const language = best(languages, NO_EDITOR);
  return {
    project: project && { name: project.id, sec: project.sec },
    language: language && { name: languageName(language.id), sec: language.sec },
  };
}

/** The full payload for the dashboard webview. */
function dashboardData(days, nowMs, opts = {}) {
  const weekStartsOn = opts.weekStartsOn === undefined ? 1 : opts.weekStartsOn;
  const summary = summarize(days, nowMs, opts);
  const today = summary.todayKey;
  const soonest = T.addDays(today, -6); // ranges always span at least a week
  const first = summary.firstKey && summary.firstKey < soonest ? summary.firstKey : soonest;

  const ranges = {
    '7d': rangeData(days, T.addDays(today, -6), today, weekStartsOn),
    '30d': rangeData(days, T.addDays(today, -29), today, weekStartsOn),
    '90d': rangeData(days, T.addDays(today, -89), today, weekStartsOn),
    '1y': rangeData(days, T.addDays(today, -364), today, weekStartsOn),
    all: rangeData(days, first, today, weekStartsOn),
  };

  // Calendar heatmap: whole weeks, 53 columns ending with the current week.
  const heatStart = T.addDays(T.weekStartKey(today, weekStartsOn), -52 * 7);
  const heat = [];
  for (let n = T.dayNum(heatStart), end = T.dayNum(today); n <= end; n++) {
    const d = days.get(T.keyFromNum(n));
    heat.push(d ? d.total : 0);
  }

  // Twelve calendar months ending with this one (the heatmap's table view).
  const months = [];
  let monthKey = T.monthStartKey(today);
  for (let i = 0; i < 12; i++) {
    const end = i === 0 ? today : T.addDays(T.monthStartKey(T.addDays(monthKey, 32)), -1);
    let sec = 0;
    let active = 0;
    for (let n = T.dayNum(monthKey), stop = T.dayNum(end); n <= stop; n++) {
      const d = days.get(T.keyFromNum(n));
      if (d) {
        sec += d.total;
        if (d.total >= MIN_ACTIVE_DAY_SEC) active++;
      }
    }
    months.push({ k: monthKey, s: sec, d: active });
    monthKey = T.prevMonthStartKey(monthKey);
  }

  let longest = null;
  let sessions = 0;
  let sessionSec = 0;
  for (const [key, d] of days) {
    for (const s of d.sessions) {
      sessions++;
      sessionSec += s[2];
      if (!longest || s[2] > longest.sec) longest = { key, sec: s[2], start: s[0] };
    }
  }

  const todayRec = days.get(today);
  const [y, m, d] = today.split('-').map(Number);

  return {
    now: nowMs,
    weekStartsOn,
    summary,
    heat: { start: heatStart, values: heat },
    months,
    longestSession: longest,
    avgSession: sessions > 0 ? sessionSec / sessions : 0,
    dayStart: new Date(y, m - 1, d).getTime() / 1000,
    todaySessions: todayRec ? todayRec.sessions : [],
    ranges,
  };
}

module.exports = { summarize, rangeData, topOf, dashboardData, sumRange };
