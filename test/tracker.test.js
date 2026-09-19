'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Tracker, TICK_MS } = require('../src/tracker');

const mockTimers = test.mock.timers;
const T0 = new Date(2026, 8, 18, 10, 0, 0).getTime();

// Ticks are 5 s apart. Input less than 30 s old is counted straight away, later
// quiet time is held until the user comes back or the idle timeout passes.
function setup(t, idleMs = 60 * 1000) {
  mockTimers.enable({ apis: ['setInterval', 'Date'], now: T0 });
  t.after(() => mockTimers.reset());
  const store = {
    calls: [],
    add(ts, secs, project, language) { this.calls.push({ ts, secs, project, language }); },
    get total() { return this.calls.reduce((s, c) => s + c.secs, 0); },
  };
  let changes = 0;
  const tracker = new Tracker(store, { idleMs, onChange: () => changes++ });
  tracker.project = 'app';
  tracker.language = 'typescript';
  return { store, tracker, changes: () => changes };
}

const ticks = (n) => { for (let i = 0; i < n; i++) mockTimers.tick(TICK_MS); };

test('no time before focus', (t) => {
  const { store, tracker } = setup(t);
  tracker.touch();
  assert.equal(tracker.counting, false);
  ticks(4);
  assert.equal(store.total, 0);
});

test('an active window is credited', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: true });
  assert.equal(tracker.counting, true);
  ticks(3);
  assert.equal(store.total, 15);
  assert.deepEqual(store.calls[0], { ts: T0 + 5000, secs: 5, project: 'app', language: 'typescript' });
  tracker.dispose();
});

test('user activity keeps it counting', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: true });
  ticks(120); // 10 minutes, far beyond the 60 s idle timeout
  assert.equal(tracker.counting, true);
  assert.equal(store.total, 600);
  tracker.dispose();
});

test('quiet time is held, then counted when activity comes back', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: false });
  ticks(6); // input was recent for the first 30 s
  assert.equal(store.total, 30);
  ticks(4); // 20 s with no input: held back
  assert.equal(store.total, 30);
  assert.equal(tracker.held.length, 4);
  tracker.touch(); // back within the timeout
  assert.equal(store.total, 50);
  assert.equal(tracker.held.length, 0);
  tracker.dispose();
});

test('held time keeps its original timestamps', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: false });
  ticks(8);
  const before = store.calls.length;
  tracker.touch();
  const released = store.calls.slice(before);
  assert.deepEqual(released.map((c) => c.ts), [T0 + 35000, T0 + 40000]);
  assert.deepEqual(released.map((c) => c.secs), [5, 5]);
  tracker.dispose();
});

test('quiet time past the timeout is dropped', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: false });
  ticks(11);
  assert.equal(tracker.counting, true);
  assert.equal(tracker.held.length, 5);
  ticks(2); // 65 s without input
  assert.equal(tracker.counting, false, 'timer stopped');
  assert.equal(tracker.held.length, 0);
  assert.equal(store.total, 30);
  ticks(50);
  assert.equal(store.total, 30);
  tracker.touch();
  assert.equal(store.total, 30, 'dropped time does not come back');
  tracker.dispose();
});

test('activity restarts counting after the timeout', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: false });
  ticks(13);
  assert.equal(tracker.counting, false);
  const before = store.total;
  tracker.touch(); // e.g. an edit
  assert.equal(tracker.counting, true);
  ticks(6);
  assert.equal(store.total, before + 30);
  tracker.dispose();
});

test('a short timeout never holds time', (t) => {
  const { store, tracker } = setup(t, 20 * 1000);
  tracker.setWindowState({ focused: true, active: false });
  ticks(4);
  assert.equal(tracker.held.length, 0);
  assert.equal(store.total, 20);
  ticks(1);
  assert.equal(tracker.counting, false);
  assert.equal(store.total, 20);
});

test('losing focus stops counting', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: true });
  ticks(1);
  mockTimers.tick(2000);
  tracker.setWindowState({ focused: false, active: false });
  assert.equal(tracker.counting, false);
  assert.equal(store.total, 7);
  ticks(10);
  assert.equal(store.total, 7);
  tracker.touch(); // events in an unfocused window (e.g. a background edit) do not count
  assert.equal(tracker.counting, false);
});

test('leaving the window counts the held time', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: false });
  ticks(10);
  assert.equal(store.total, 30);
  tracker.setWindowState({ focused: false, active: false });
  assert.equal(store.total, 50);
  assert.equal(tracker.held.length, 0);
  assert.equal(tracker.counting, false);
});

test('regaining focus resumes', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: true });
  ticks(2);
  tracker.setWindowState({ focused: false, active: false });
  ticks(20);
  tracker.setWindowState({ focused: true, active: true });
  ticks(2);
  assert.equal(store.total, 20);
  tracker.dispose();
});

test('pause and resume', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: true });
  ticks(2);
  tracker.setPaused(true);
  assert.equal(tracker.counting, false);
  tracker.touch();
  ticks(10);
  assert.equal(store.total, 10, 'nothing is counted while paused, even with activity');
  tracker.setPaused(false);
  assert.equal(tracker.counting, true);
  ticks(2);
  assert.equal(store.total, 20);
  tracker.dispose();
});

test('pausing counts the held time', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: false });
  ticks(10);
  tracker.setPaused(true);
  assert.equal(store.total, 50);
  assert.equal(tracker.held.length, 0);
});

test('closing counts the held time', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: false });
  ticks(10);
  tracker.dispose();
  assert.equal(store.total, 50);
});

test('sleep gap is not counted', (t) => {
  const { store, tracker } = setup(t);
  tracker.setWindowState({ focused: true, active: true });
  ticks(2);
  mockTimers.setTime(Date.now() + 8 * 60 * 60 * 1000); // slept for 8 hours
  tracker._tick();
  assert.equal(store.total, 10);
  ticks(1); // and counting carries on normally afterwards
  assert.equal(store.total, 15);
  tracker.dispose();
});

test('idle timeout change', (t) => {
  const { store, tracker } = setup(t, 600 * 1000);
  tracker.setWindowState({ focused: true, active: false });
  ticks(20);
  assert.equal(tracker.counting, true);
  assert.equal(tracker.held.length, 14);
  tracker.setIdleTimeout(30 * 1000);
  ticks(1);
  assert.equal(tracker.counting, false);
  assert.equal(store.total, 30);
});

test('onChange fires when counting starts and stops', (t) => {
  const { tracker, changes } = setup(t);
  tracker.setWindowState({ focused: true, active: true });
  const afterStart = changes();
  assert.ok(afterStart >= 1);
  tracker.setWindowState({ focused: false, active: false });
  assert.ok(changes() > afterStart);
});
