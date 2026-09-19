'use strict';

// Decides when time counts and adds it to the store.
//
// Time counts while the window is focused and tracking is not paused. Right after
// input it is added straight away. Once input has stopped for a while (reading,
// waiting for a build or an AI agent) the seconds are held back: if you are active
// again within the idle timeout they are counted, otherwise they are dropped, so
// time away from the keyboard does not count. The timer only runs while time is
// counting, so an idle VS Code does no work.

const TICK_MS = 5000;
/** A tick that arrives later than this means the machine slept; that gap is not credited. */
const MAX_GAP_MS = 30 * 1000;
/** Input this recent is counted straight away. */
const HOT_MS = 30 * 1000;

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
    /** @type {{ ts: number, secs: number, project: string|null, language: string|null }[]} */
    this.held = [];
  }

  /** True while time is being credited. */
  get counting() {
    return this.timer !== null;
  }

  /** Call on any activity. Runs on every keystroke, so keep it cheap. */
  touch() {
    this.lastActivity = Date.now();
    if (this.held.length) this._release();
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

  /** The user is back: count what was held. */
  _release() {
    for (const t of this.held) this.store.add(t.ts, t.secs, t.project, t.language);
    this.held = [];
  }

  /** Leaving the window, pausing or closing counts what was held (you were there), then stops. */
  _halt() {
    if (this.timer === null) return;
    this._release();
    this._advance(Date.now(), false);
    this._stop();
    this.onChange();
  }

  _tick() {
    const now = Date.now();
    if (this.userActive) this.lastActivity = now;
    const quiet = now - this.lastActivity;
    if (quiet > this.idleMs) {
      this.held = []; // away for too long: that time is not counted
      this._stop();
      this.onChange();
      return;
    }
    const hold = !this.userActive && quiet > Math.min(HOT_MS, this.idleMs);
    this._advance(now, hold);
    this.onChange();
  }

  _advance(now, hold) {
    const elapsed = now - this.lastTick;
    this.lastTick = now;
    if (elapsed <= 0 || elapsed > MAX_GAP_MS) return;
    this.carryMs += elapsed;
    const secs = Math.floor(this.carryMs / 1000);
    if (secs > 0) {
      this.carryMs -= secs * 1000;
      if (hold) this.held.push({ ts: now, secs, project: this.project, language: this.language });
      else this.store.add(now, secs, this.project, this.language);
    }
  }
}

module.exports = { Tracker, TICK_MS, MAX_GAP_MS, HOT_MS };
