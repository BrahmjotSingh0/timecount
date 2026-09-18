'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/time');

test('dayKey', () => {
  assert.equal(T.dayKey(new Date(2026, 8, 18, 0, 0, 1).getTime()), '2026-09-18');
  assert.equal(T.dayKey(new Date(2026, 8, 18, 23, 59, 59).getTime()), '2026-09-18');
  assert.equal(T.dayKey(new Date(2026, 0, 1, 12).getTime()), '2026-01-01');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(T.addDays('2026-09-18', 1), '2026-09-19');
  assert.equal(T.addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(T.addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(T.addDays('2028-02-28', 1), '2028-02-29'); // leap year
  assert.equal(T.addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(T.addDays('2026-09-18', -365), '2025-09-18');
});

test('addDays across DST changes', () => {
  const saved = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    // Clocks go forward on 2026-03-08 and back on 2026-11-01.
    assert.equal(T.addDays('2026-03-07', 1), '2026-03-08');
    assert.equal(T.addDays('2026-03-08', 1), '2026-03-09');
    assert.equal(T.addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(T.addDays('2026-11-01', 1), '2026-11-02');
    assert.equal(T.dayNum('2026-03-09') - T.dayNum('2026-03-08'), 1);
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test('weekdayOf', () => {
  assert.equal(T.weekdayOf('1970-01-01'), 4); // Thursday
  assert.equal(T.weekdayOf('2026-09-18'), 5); // Friday
  assert.equal(T.weekdayOf('2026-09-20'), 0); // Sunday
});

test('weekStartKey', () => {
  // 2026-09-18 is a Friday.
  assert.equal(T.weekStartKey('2026-09-18', 1), '2026-09-14'); // Monday
  assert.equal(T.weekStartKey('2026-09-18', 0), '2026-09-13'); // Sunday
  assert.equal(T.weekStartKey('2026-09-18', 6), '2026-09-12'); // Saturday
  assert.equal(T.weekStartKey('2026-09-14', 1), '2026-09-14'); // already a Monday
  assert.equal(T.weekStartKey('2026-09-20', 1), '2026-09-14'); // Sunday belongs to the week starting Monday
  assert.equal(T.weekStartKey('2027-01-01', 1), '2026-12-28'); // across a year boundary
});

test('month and year helpers', () => {
  assert.equal(T.monthStartKey('2026-09-18'), '2026-09-01');
  assert.equal(T.yearStartKey('2026-09-18'), '2026-01-01');
  assert.equal(T.prevMonthStartKey('2026-09-18'), '2026-08-01');
  assert.equal(T.prevMonthStartKey('2026-01-05'), '2025-12-01');
  assert.equal(T.monthKeyOf('2026-09-18'), '2026-09');
});

test('formatDuration', () => {
  assert.equal(T.formatDuration(0), '0m');
  assert.equal(T.formatDuration(45), '45s');
  assert.equal(T.formatDuration(60), '1m');
  assert.equal(T.formatDuration(59 * 60 + 59), '59m');
  assert.equal(T.formatDuration(3600), '1h');
  assert.equal(T.formatDuration(3600 + 5 * 60), '1h 5m');
  assert.equal(T.formatDuration(23 * 3600 + 59 * 60), '23h 59m');
  assert.equal(T.formatDuration(210 * 3600 + 5 * 60), '210h 5m');
  assert.equal(T.formatDuration(210 * 3600 + 5 * 60, 100), '210h');
  assert.equal(T.formatDuration(99 * 3600 + 5 * 60, 100), '99h 5m');
  assert.equal(T.formatDuration(-5), '0m');
  assert.equal(T.formatDuration(NaN), '0m');
});
