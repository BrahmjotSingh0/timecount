'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');

const ts = (d, h, m = 0, s = 0) => new Date(2026, 8, d, h, m, s).getTime();

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timecount-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A store that never leaves a timer behind. */
function open(t, dir) {
  const s = new Store(dir);
  t.after(() => { if (s.flushTimer) clearTimeout(s.flushTimer); });
  return s;
}

test('saved time is loaded again', async (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  a.add(ts(18, 9, 0, 5), 5, 'app', 'typescript');
  a.add(ts(18, 9, 0, 10), 5, 'app', 'typescript');
  assert.equal(a.days.get('2026-09-18').total, 10); // visible immediately, before any flush
  assert.equal(a.flush(), true);
  assert.equal(a.pending.size, 0);

  const b = open(t, dir);
  await b.load();
  assert.equal(b.loaded, true);
  const day = b.days.get('2026-09-18');
  assert.equal(day.total, 10);
  assert.equal(day.projects.app, 10);
  assert.equal(day.languages.typescript, 10);
  assert.equal(day.hours[9], 10);
});

test('one file per month', (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  a.add(new Date(2026, 7, 31, 23, 59, 55).getTime(), 5, 'p', 'l');
  a.add(new Date(2026, 8, 1, 0, 0, 5).getTime(), 5, 'p', 'l');
  a.flush();
  assert.deepEqual(fs.readdirSync(dir).sort(), ['2026-08.json', '2026-09.json']);
});

test('two windows keep each other\'s time', async (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  const b = open(t, dir);
  await a.load();
  await b.load();

  a.add(ts(18, 9, 0, 5), 100, 'app', 'ts');
  b.add(ts(18, 9, 30, 0), 50, 'lib', 'py');
  a.flush();
  b.flush(); // b never saw a's write: its flush must merge into it, not replace it

  const onDisk = new Store(dir);
  await onDisk.load();
  const day = onDisk.days.get('2026-09-18');
  assert.equal(day.total, 150);
  assert.equal(day.projects.app, 100);
  assert.equal(day.projects.lib, 50);

  // b now knows about a's time too, and a picks up b's on refresh.
  assert.equal(b.days.get('2026-09-18').total, 150);
  assert.equal(a.refresh(), true);
  assert.equal(a.days.get('2026-09-18').total, 150);
  assert.equal(a.refresh(), false); // nothing new
});

test('refresh keeps unsaved time', async (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  const b = open(t, dir);
  await a.load();
  await b.load();

  b.add(ts(18, 10, 0, 0), 60, 'lib', 'py');
  b.flush();
  a.add(ts(18, 11, 0, 0), 30, 'app', 'ts'); // not flushed yet
  a.refresh();
  assert.equal(a.days.get('2026-09-18').total, 90);
  a.flush();
  const check = new Store(dir);
  await check.load();
  assert.equal(check.days.get('2026-09-18').total, 90);
});

test('sessions from two windows merge', async (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  const b = open(t, dir);
  a.add(ts(18, 10, 0, 0), 600, 'p', 'l'); // 09:50 to 10:00
  b.add(ts(18, 10, 5, 0), 300, 'p', 'l'); // 10:00 to 10:05, adjacent, same session
  b.add(ts(18, 15, 0, 0), 300, 'p', 'l'); // hours later, a second session
  a.flush();
  b.flush();
  const check = new Store(dir);
  await check.load();
  const sessions = check.days.get('2026-09-18').sessions;
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0][2], 900);
  assert.equal(sessions[1][2], 300);
});

test('a corrupt file is moved aside on save', async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-09.json'), '{ this is not json');
  const a = open(t, dir);
  a.add(ts(18, 9, 0, 5), 5, 'p', 'l');
  assert.equal(a.flush(), true);
  const files = fs.readdirSync(dir);
  assert.ok(files.some((f) => /^2026-09\.json\.corrupt-\d+$/.test(f)), 'corrupt copy kept: ' + files);
  const b = open(t, dir);
  await b.load();
  assert.equal(b.days.get('2026-09-18').total, 5);
});

test('load skips a corrupt file', async (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  a.add(new Date(2026, 7, 10, 9).getTime(), 40, 'p', 'l');
  a.flush();
  fs.writeFileSync(path.join(dir, '2026-09.json'), 'garbage');
  const b = open(t, dir);
  await b.load();
  assert.equal(b.days.get('2026-08-10').total, 40);
  assert.equal(b.days.has('2026-09-18'), false);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')));
});

test('bad data in a file does not break loading', async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-09.json'), JSON.stringify({
    version: 1,
    days: {
      '2026-09-01': { total: 'lots', hours: null, projects: { a: 5, b: 'x' }, languages: 7, sessions: 'no' },
      'not-a-date': { total: 999 },
      '2026-09-02': { total: 120, hours: new Array(24).fill(5), projects: {}, languages: {}, sessions: [] },
    },
  }));
  const s = open(t, dir);
  await s.load();
  assert.equal(s.days.get('2026-09-01').total, 0);
  assert.equal(s.days.get('2026-09-01').projects.a, 5);
  assert.equal(s.days.get('2026-09-02').total, 120);
  assert.equal(s.days.has('not-a-date'), false);
});

test('lock handling', (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  a.add(ts(18, 9, 0, 5), 5, 'p', 'l');

  const lock = path.join(dir, '.lock');
  fs.writeFileSync(lock, '');
  assert.equal(a.flush(1), false);
  assert.equal(a.pending.size, 1, 'nothing may be dropped while locked');
  assert.ok(a.flushTimer, 'a retry is scheduled');

  const old = new Date(Date.now() - 60 * 1000);
  fs.utimesSync(lock, old, old);
  assert.equal(a.flush(1), true);
  assert.equal(a.pending.size, 0);
  assert.equal(fs.existsSync(lock), false, 'lock released');
});

test('reset clears everything', async (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  const b = open(t, dir);
  a.add(ts(18, 9, 0, 5), 5, 'p', 'l');
  a.flush();
  await b.load();
  assert.equal(b.days.size, 1);

  assert.equal(a.reset(), true);
  assert.equal(a.days.size, 0);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.json')), []);
  assert.equal(b.refresh(), true);
  assert.equal(b.days.size, 0);
});

test('temp files are ignored', async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-09.json.1234.tmp'), '{"half":');
  const s = open(t, dir);
  await s.load();
  assert.equal(s.days.size, 0);
});

test('toJSON includes unsaved time', (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  a.add(ts(18, 9, 0, 5), 5, 'p', 'l');
  const out = a.toJSON();
  assert.equal(out.version, 1);
  assert.equal(out.days['2026-09-18'].total, 5);
});

test('daysWith shows held time without changing the store', (t) => {
  const dir = tmpDir(t);
  const a = open(t, dir);
  a.add(ts(18, 9, 0, 5), 60, 'app', 'ts');
  const held = [
    { ts: ts(18, 9, 1, 5), secs: 60, project: 'app', language: 'ts' },
    { ts: ts(19, 0, 0, 30), secs: 30, project: 'lib', language: 'py' },
  ];
  const days = a.daysWith(held);
  assert.equal(days.get('2026-09-18').total, 120);
  assert.equal(days.get('2026-09-18').sessions.length, 1);
  assert.equal(days.get('2026-09-19').total, 30);
  assert.equal(a.days.get('2026-09-18').total, 60);
  assert.equal(a.days.has('2026-09-19'), false);
  assert.equal(a.daysWith([]), a.days);
});
