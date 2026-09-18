'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/model');

const at = (h, m = 0, s = 0) => Math.floor(new Date(2026, 8, 18, h, m, s).getTime() / 1000);

test('record adds up time', () => {
  const day = M.newDay();
  M.record(day, at(9, 0, 5), 5, 9, 'app', 'typescript');
  M.record(day, at(9, 0, 10), 5, 9, 'app', 'typescript');
  M.record(day, at(10, 0, 5), 5, 10, 'lib', 'python');
  assert.equal(day.total, 15);
  assert.equal(day.hours[9], 10);
  assert.equal(day.hours[10], 5);
  assert.deepEqual({ ...day.projects }, { app: 10, lib: 5 });
  assert.deepEqual({ ...day.languages }, { typescript: 10, python: 5 });
});

test('record splits sessions on long gaps', () => {
  const day = M.newDay();
  M.record(day, at(9, 0, 5), 5, 9, 'p', 'l');
  M.record(day, at(9, 0, 10), 5, 9, 'p', 'l');
  assert.deepEqual(day.sessions, [[at(9, 0, 0), at(9, 0, 10), 10]]);

  M.record(day, at(9, 10, 0), 5, 9, 'p', 'l'); // 10 min gap: still the same session
  assert.equal(day.sessions.length, 1);
  assert.equal(day.sessions[0][1], at(9, 10, 0));

  M.record(day, at(11, 0, 0), 5, 11, 'p', 'l'); // 2 h gap: new session
  assert.equal(day.sessions.length, 2);
  assert.deepEqual(day.sessions[1], [at(11, 0, 0) - 5, at(11, 0, 0), 5]);
});

test('names like constructor are ordinary keys', () => {
  const day = M.newDay();
  M.record(day, at(9), 5, 9, 'constructor', '__proto__');
  M.record(day, at(9, 0, 5), 5, 9, 'constructor', '__proto__');
  M.record(day, at(9, 0, 10), 5, 9, 'toString', 'hasOwnProperty');
  assert.equal(day.projects.constructor, 10);
  assert.equal(day.languages.__proto__, 10);
  assert.equal(day.projects.toString, 5);
  const copy = M.sanitizeDay(JSON.parse(JSON.stringify(day)));
  assert.equal(copy.projects.constructor, 10);
  assert.equal(copy.total, 15);
});

test('coalesce merges nearby sessions', () => {
  const a = [[at(10, 0), at(10, 10), 500]];
  const b = [[at(10, 12), at(10, 20), 400], [at(14, 0), at(14, 30), 1000]];
  const merged = M.coalesce(a.concat(b));
  assert.deepEqual(merged, [[at(10, 0), at(10, 20), 900], [at(14, 0), at(14, 30), 1000]]);
  merged[0][2] = 1;
  assert.equal(a[0][2], 500);
  assert.equal(b[0][2], 400);
});

test('coalesce handles unsorted input', () => {
  const merged = M.coalesce([[at(11, 0), at(11, 5), 60], [at(10, 0), at(10, 30), 100], [at(10, 20), at(10, 40), 50]]);
  assert.deepEqual(merged, [[at(10, 0), at(10, 40), 150], [at(11, 0), at(11, 5), 60]]);
});

test('mergeDay adds days together', () => {
  const a = M.newDay();
  const b = M.newDay();
  M.record(a, at(9, 0, 10), 10, 9, 'app', 'ts');
  M.record(b, at(9, 5, 0), 20, 9, 'app', 'py');
  M.record(b, at(9, 5, 5), 5, 9, 'lib', 'py');
  M.mergeDay(a, b);
  assert.equal(a.total, 35);
  assert.equal(a.hours[9], 35);
  assert.deepEqual({ ...a.projects }, { app: 30, lib: 5 });
  assert.deepEqual({ ...a.languages }, { ts: 10, py: 25 });
  assert.equal(a.sessions.length, 1);
  assert.equal(a.sessions[0][2], 35);
  assert.equal(b.total, 25); // untouched
  a.sessions[0][2] = 0;
  assert.equal(b.sessions[0][2], 25);
});

test('sanitizeDay survives junk', () => {
  assert.deepEqual(M.sanitizeDay(null), M.newDay());
  assert.deepEqual(M.sanitizeDay('nope'), M.newDay());
  const d = M.sanitizeDay({
    total: -5,
    hours: 'x',
    projects: { good: 10, bad: 'ten', neg: -1, nan: NaN },
    languages: [1, 2],
    sessions: [[1, 2, 3], 'x', [5, 1, 1], [100, 200, 'z'], null],
  });
  assert.equal(d.total, 0);
  assert.equal(d.hours.length, 24);
  assert.deepEqual({ ...d.projects }, { good: 10 });
  assert.equal(d.sessions.length, 1); // three malformed entries dropped; the two valid ones are close together and merge
});
