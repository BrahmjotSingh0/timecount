'use strict';

// Decides when time counts and adds it to the store.
//
// Time counts while the window is focused, tracking is not paused, and there was
// some activity within the idle timeout. The timer only runs while time is
// counting, so an idle VS Code does no work.

const TICK_MS = 5000;
/** A tick that arrives later than this means the machine slept; that gap is not credited. */
const MAX_GAP_MS = 30 * 1000;

class Tracker {
  /**
   * @param {{ add(ts: number, secs: number, project: string|null, language: string|null): void }} store
   * @param {{ idleMs: number, onChange?: () => void }} options
   */
  constructor(store, { idleMs, onChange }) {
    this.store = store;
    this.idleMs = idleMs;
    this.onChange = onChange || (() => {});
    this.project = null;
    this.language = null;
    this.focused = false;
    this.userActive = false;
    this.paused = false;
    this.lastActivity = 0;
    this.lastTick = 0;
    this.carryMs = 0;
    this.timer = null;
  }

  /** True while time is being credited. */
  get counting() {
    return this.timer !== null;
  }

  /** Call on any activity. Runs on every keystroke, so keep it cheap. */
  touch() {
    this.lastActivity = Date.now();
    if (this.timer === null && this.focused && !this.paused) this._start(this.lastActivity);
  }

  setWindowState({ focused, active }) {
    this.userActive = active;
    if (!focused) {
      this.focused = false;
      this._halt();
      return;
    }
    this.focused = true;
    this.touch(); // focusing the window (or a change in activity) is itself activity
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this._halt();
    else this.touch();
    this.onChange();
  }

  setIdleTimeout(ms) {
    this.idleMs = ms;
  }

  dispose() {
    this._halt();
  }

  _start(now) {
    this.lastTick = now;
    this.carryMs = 0;
    this.timer = setInterval(() => this._tick(), TICK_MS);
    if (this.timer.unref) this.timer.unref();
    this.onChange();
  }

  _stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Credit the partial interval since the last tick, then stop. */
  _halt() {
    if (this.timer === null) return;
    this._advance(Date.now());
    this._stop();
    this.onChange();
  }

  _tick() {
    const now = Date.now();
    if (this.userActive) this.lastActivity = now;
    if (now - this.lastActivity > this.idleMs) {
      this._stop();
      this.onChange();
      return;
    }
    this._advance(now);
    this.onChange();
  }

  _advance(now) {
    const elapsed = now - this.lastTick;
    this.lastTick = now;
    if (elapsed <= 0 || elapsed > MAX_GAP_MS) return;
    this.carryMs += elapsed;
    const secs = Math.floor(this.carryMs / 1000);
    if (secs > 0) {
      this.carryMs -= secs * 1000;
      this.store.add(now, secs, this.project, this.language);
    }
  }
}

module.exports = { Tracker, TICK_MS, MAX_GAP_MS };
