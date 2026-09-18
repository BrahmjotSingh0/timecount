'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/time');
const M = require('../src/model');
const S = require('../src/stats');
const { toCsv, csvCell } = require('../src/export');

const H = 3600;
// Friday 2026-09-18, 15:00 local.
const NOW = new Date(2026, 8, 18, 15, 0, 0).getTime();

/** Add `secs` of tracked time on `key` as one session starting at `hour`. */
function addDay(days, key, secs, { hour = 10, project = 'app', language = 'typescript' } = {}) {
  const [y, m, d] = key.split('-').map(Number);
  const end = Math.floor(new Date(y, m - 1, d, hour, 30, 0).getTime() / 1000);
  let day = days.get(key);
  if (!day) days.set(key, (day = M.newDay()));
  M.record(day, end, secs, hour, project, language);
}

function sample() {
  const days = new Map();
  addDay(days, '2026-08-18', 1 * H);
  addDay(days, '2026-08-25', 2 * H);
  addDay(days, '2026-09-01', 0.5 * H);
  for (const d of ['07', '08', '09', '10', '11']) addDay(days, '2026-09-' + d, 1 * H); // previous Mon to Fri
  addDay(days, '2026-09-14', 2 * H);
  addDay(days, '2026-09-15', 1 * H);
  addDay(days, '2026-09-17', 3 * H, { project: 'lib', language: 'python' });
  addDay(days, '2026-09-18', 0.5 * H);
  return days;
}

test('summarize totals', () => {
  const s = S.summarize(sample(), NOW, { weekStartsOn: 1, goalSec: 2 * H });
  assert.equal(s.todayKey, '2026-09-18');
  assert.equal(s.today, 0.5 * H);
  assert.equal(s.yesterday, 3 * H);
  assert.equal(s.week, 6.5 * H); // Mon 14th to Fri 18th
  assert.equal(s.weekPrev, 5 * H); // Mon 7th to Fri 11th, the same weekdays last week
  assert.equal(s.month, 12 * H);
  assert.equal(s.monthPrev, 1 * H); // Aug 1 to 18 only, not the 25th
  assert.equal(s.year, 15 * H);
  assert.equal(s.total, 15 * H);
  assert.equal(s.activeDays, 12);
  assert.equal(s.avg, (15 * H) / 12);
  assert.equal(s.avgPrior, (14.5 * H) / 11);
  assert.equal(s.firstKey, '2026-08-18');
  assert.deepEqual(s.bestDay, { key: '2026-09-17', sec: 3 * H });
  assert.equal(s.goalPct, 0.25);
});

test('summarize week start', () => {
  const days = sample();
  // Sunday-start week is Sun 13th to Fri 18th: same days as Monday-start here.
  assert.equal(S.summarize(days, NOW, { weekStartsOn: 0 }).week, 6.5 * H);
  // Saturday-start week begins Sat 12th: also nothing on 12th/13th.
  assert.equal(S.summarize(days, NOW, { weekStartsOn: 6 }).week, 6.5 * H);
  addDay(days, '2026-09-13', 1 * H); // a Sunday
  assert.equal(S.summarize(days, NOW, { weekStartsOn: 0 }).week, 7.5 * H);
  assert.equal(S.summarize(days, NOW, { weekStartsOn: 1 }).week, 6.5 * H);
});

test('summarize streaks', () => {
  const s = S.summarize(sample(), NOW);
  assert.deepEqual(s.streak, { current: 2, longest: 5 }); // 17th to 18th now; 7th to 11th was the best

  // Today not started yet: the streak is still alive through yesterday.
  const days = sample();
  days.delete('2026-09-18');
  assert.equal(S.summarize(days, NOW).streak.current, 1);

  // Nothing yesterday or today: broken.
  days.delete('2026-09-17');
  assert.equal(S.summarize(days, NOW).streak.current, 0);
  assert.equal(S.summarize(days, NOW).streak.longest, 5);
});

test('short days are not active days', () => {
  const days = new Map();
  addDay(days, '2026-09-17', 30);
  addDay(days, '2026-09-18', 30);
  const s = S.summarize(days, NOW);
  assert.equal(s.activeDays, 0);
  assert.equal(s.avg, 0);
  assert.equal(s.total, 60);
  assert.equal(s.streak.current, 0);
});

test('summarize sessions', () => {
  const days = new Map();
  const day = M.newDay();
  const sec = (h, m) => Math.floor(new Date(2026, 8, 18, h, m).getTime() / 1000);
  M.record(day, sec(9, 30), 1800, 9, 'p', 'l'); // ends 09:30
  M.record(day, sec(14, 55), 600, 14, 'p', 'l'); // new session, ended 5 min before NOW
  days.set('2026-09-18', day);
  const s = S.summarize(days, NOW);
  assert.equal(s.sessionsToday, 2);
  assert.equal(s.longestToday, 1800);
  assert.equal(s.currentSession, 600);

  const later = S.summarize(days, new Date(2026, 8, 18, 18, 0).getTime());
  assert.equal(later.currentSession, 0, 'no session in progress after a long gap');
});

test('summarize with no data', () => {
  const s = S.summarize(new Map(), NOW);
  assert.equal(s.total, 0);
  assert.equal(s.avg, 0);
  assert.equal(s.bestDay, null);
  assert.equal(s.firstKey, null);
  assert.deepEqual(s.streak, { current: 0, longest: 0 });
});

test('topOf skips no editor', () => {
  const days = sample();
  addDay(days, '2026-09-16', 5 * H, { project: 'app', language: '(no editor)' });
  const top = S.topOf(days, '2026-09-14', '2026-09-18');
  assert.deepEqual(top.project, { name: 'app', sec: 8.5 * H }); // includes the non-editor time
  // 5h of "no editor" is the biggest language bucket, yet it is never reported as a language.
  assert.deepEqual(top.language, { name: 'TypeScript', sec: 3.5 * H });
});

test('rangeData buckets and totals', () => {
  const days = new Map();
  const start = T.dayNum('2025-07-01');
  for (let n = start; n <= T.dayNum('2026-09-18'); n++) addDay(days, T.keyFromNum(n), 3600);

  const d = (from) => S.rangeData(days, from, '2026-09-18', 1);
  const r7 = d('2026-09-12');
  assert.equal(r7.bucket, 'day');
  assert.equal(r7.points.length, 7);
  const r90 = d('2026-06-21');
  assert.equal(r90.bucket, 'day');
  assert.equal(r90.points.length, 90);
  const r1y = d('2025-09-19');
  assert.equal(r1y.bucket, 'week');
  const rAll = d('2025-07-01');
  assert.equal(rAll.bucket, 'month');
  assert.equal(rAll.points.length, 15); // Jul 2025 to Sep 2026

  for (const r of [r7, r90, r1y, rAll]) {
    assert.equal(r.points.reduce((s, p) => s + p.s, 0), r.total);
    assert.equal(r.hours.reduce((s, v) => s + v, 0), r.total);
    assert.equal(r.weekdayTotals.reduce((s, v) => s + v, 0), r.total);
    assert.equal(r.weekdayCounts.reduce((s, v) => s + v, 0), T.dayNum(r.to) - T.dayNum(r.from) + 1);
    assert.equal(r.projects[0].sec, r.total);
  }
  assert.equal(r7.hours[10], r7.total); // everything was recorded in the 10 o'clock hour
});

test('rangeData groups the tail as Other', () => {
  const days = new Map();
  for (let i = 0; i < 12; i++) addDay(days, '2026-09-18', 100 * (i + 1), { project: 'p' + i, language: 'l' + i });
  const r = S.rangeData(days, '2026-09-18', '2026-09-18', 1);
  assert.equal(r.projects.length, 9);
  assert.equal(r.projects[0].name, 'p11'); // biggest first
  const other = r.projects[8];
  assert.equal(other.name, 'Other');
  assert.equal(other.other, 4);
  assert.equal(r.projects.reduce((s, p) => s + p.sec, 0), r.total);
});

test('dashboardData', () => {
  const days = sample();
  const data = S.dashboardData(days, NOW, { weekStartsOn: 1, goalSec: 0 });
  // 52 whole weeks + Mon to Fri of this week.
  assert.equal(data.heat.values.length, 52 * 7 + 5);
  assert.equal(data.heat.start, '2025-09-15');
  assert.equal(data.heat.values[data.heat.values.length - 1], 0.5 * H);
  assert.equal(data.months.length, 12);
  assert.equal(data.months[0].k, '2026-09-01');
  assert.equal(data.months[0].s, 12 * H);
  assert.equal(data.months[1].k, '2026-08-01');
  assert.equal(data.months[1].s, 3 * H);
  assert.equal(data.months[11].k, '2025-10-01');
  assert.equal(data.todaySessions.length, 1);
  assert.equal(data.longestSession.sec, 3 * H);
  assert.equal(data.longestSession.key, '2026-09-17');
  assert.equal(data.dayStart, new Date(2026, 8, 18).getTime() / 1000);
  assert.deepEqual(Object.keys(data.ranges), ['7d', '30d', '90d', '1y', 'all']);
  assert.equal(data.ranges.all.from, '2026-08-18');
  // The payload must survive structured cloning / JSON (it is posted to the webview).
  assert.doesNotThrow(() => JSON.stringify(data));
});

test('dashboardData with almost no data', () => {
  const days = new Map();
  addDay(days, '2026-09-18', 600);
  const data = S.dashboardData(days, NOW);
  assert.equal(data.ranges.all.from, '2026-09-12');
  assert.equal(data.ranges.all.points.length, 7);
});

test('toCsv', () => {
  const days = new Map();
  addDay(days, '2026-09-18', 5400, { project: 'my,project', language: 'typescript' });
  addDay(days, '2026-09-17', 3600, { project: '=HYPERLINK("http://evil")', language: 'python' });
  addDay(days, '2026-09-16', 0);
  const lines = toCsv(days).trim().split('\n');
  assert.equal(lines[0], 'date,seconds,hours,sessions,top_project,top_language');
  assert.equal(lines.length, 3); // header + two days; the empty day is skipped
  assert.equal(lines[2], '2026-09-18,5400,1.50,1,"my,project",TypeScript');
  assert.ok(lines[1].includes(`"'=HYPERLINK(""http://evil"")"`), lines[1]);
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('@sum'), "'@sum");
});
