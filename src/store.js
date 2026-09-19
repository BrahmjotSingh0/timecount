'use strict';

// Local storage: one JSON file per month inside `dir` (2026-09.json, ...) and a
// short-lived .lock file.
//
// Several VS Code windows share these files, so a window never writes its whole
// state. It keeps only what it tracked since its last write (`pending`) and merges
// that into the file while holding the lock, so other windows' data is kept.

const fs = require('fs');
const path = require('path');
const { dayKey, monthKeyOf } = require('./time');
const { newDay, record, mergeDay, sanitizeDay } = require('./model');

const FILE_VERSION = 1;
const FLUSH_MS = 60 * 1000;
const RETRY_MS = 10 * 1000;
const LOCK_STALE_MS = 10 * 1000;
const MONTH_FILE = /^(\d{4}-\d{2})\.json$/;
const CONTENDED = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Text of a month file -> Map(dayKey -> DayRecord), or null if it is not valid. */
function parseMonth(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object') return null;
  const days = new Map();
  for (const key of Object.keys(raw.days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) days.set(key, sanitizeDay(raw.days[key]));
  }
  return days;
}

/** One line per day keeps the files diff-able and easy to inspect by hand. */
function serializeMonth(days) {
  const rows = [...days.keys()].sort().map((k) => JSON.stringify(k) + ':' + JSON.stringify(days.get(k)));
  return '{"version":' + FILE_VERSION + ',"days":{\n' + rows.join(',\n') + '\n}}\n';
}

class Store {
  constructor(dir) {
    this.dir = dir;
    /** dayKey -> DayRecord. Everything known, including this window's unflushed time. */
    this.days = new Map();
    /** dayKey -> DayRecord. Only what this window tracked since its last flush. */
    this.pending = new Map();
    this.mtimes = new Map(); // monthKey -> mtime of the file version we hold
    this.flushTimer = null;
    this.lastError = null;
    /** False until load() has finished, so callers can avoid showing partial totals. */
    this.loaded = false;
  }

  // reading

  /** Load every month file without blocking the extension host. */
  async load() {
    try {
      this._ensureDir();
      let names = [];
      try { names = await fs.promises.readdir(this.dir); } catch { /* empty */ }
      const loaded = [];
      await Promise.all(names.map(async (name) => {
        const m = MONTH_FILE.exec(name);
        if (!m) return;
        const file = path.join(this.dir, name);
        try {
          const mtime = (await fs.promises.stat(file)).mtimeMs;
          const days = parseMonth(await fs.promises.readFile(file, 'utf8'));
          if (days) loaded.push([m[1], days, mtime]);
          else loaded.push([m[1], ...this._readMonthSync(m[1])]); // slow path: retry, then quarantine
        } catch (err) {
          this.lastError = err;
        }
      }));
      for (const [mk, days, mtime] of loaded) {
        // A flush that ran while we were reading is newer than what we read.
        if (this.mtimes.has(mk)) continue;
        this._adopt(mk, days, mtime);
      }
    } finally {
      this.loaded = true;
    }
  }

  /**
   * Pick up changes other windows wrote (call when this window gains focus).
   * Returns true if anything changed.
   */
  refresh() {
    let names;
    try { names = fs.readdirSync(this.dir); } catch { return false; }
    let changed = false;
    const seen = new Set();
    for (const name of names) {
      const m = MONTH_FILE.exec(name);
      if (!m) continue;
      const mk = m[1];
      seen.add(mk);
      let mtime;
      try { mtime = fs.statSync(path.join(this.dir, name)).mtimeMs; } catch { continue; }
      if (this.mtimes.get(mk) === mtime) continue;
      try {
        const [days, mt] = this._readMonthSync(mk);
        this._adopt(mk, days, mt);
        changed = true;
      } catch (err) {
        this.lastError = err;
      }
    }
    // Month files that vanished (another window reset the data).
    for (const mk of [...this.mtimes.keys()]) {
      if (seen.has(mk)) continue;
      this._adopt(mk, new Map(), 0);
      this.mtimes.delete(mk);
      changed = true;
    }
    return changed;
  }

  /** Replace what we hold for a month with `days` (disk state) + our own unflushed time. */
  _adopt(mk, days, mtime) {
    for (const k of [...this.days.keys()]) if (monthKeyOf(k) === mk) this.days.delete(k);
    for (const [k, p] of this.pending) {
      if (monthKeyOf(k) === mk) days.set(k, mergeDay(days.get(k) || newDay(), p));
    }
    for (const [k, d] of days) this.days.set(k, d);
    if (mtime) this.mtimes.set(mk, mtime);
  }

  /**
   * [days, mtime] for a month, quarantining the file if it stays unreadable.
   * @returns {[Map<string, import('./model').DayRecord>, number]}
   */
  _readMonthSync(mk) {
    const file = this._file(mk);
    for (let attempt = 0; attempt < 2; attempt++) {
      let text, mtime;
      try {
        mtime = fs.statSync(file).mtimeMs;
        text = fs.readFileSync(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return [new Map(), 0];
        throw err;
      }
      const days = parseMonth(text);
      if (days) return [days, mtime];
      sleepSync(40); // we may have caught another window mid-write
    }
    try { fs.renameSync(file, file + '.corrupt-' + Date.now()); } catch { /* best effort */ }
    return [new Map(), 0];
  }

  // writing

  /** Credit `secs` seconds ending at `ts` (epoch ms). */
  add(ts, secs, project, language) {
    const endSec = Math.floor(ts / 1000);
    const key = dayKey(ts);
    const hour = new Date(ts).getHours();
    record(this._dayIn(this.days, key), endSec, secs, hour, project, language);
    record(this._dayIn(this.pending, key), endSec, secs, hour, project, language);
    this._scheduleFlush(FLUSH_MS);
  }

  /** The days as they will look once `ticks` (time the tracker is holding back) is counted. */
  daysWith(ticks) {
    if (!ticks.length) return this.days;
    const days = new Map(this.days);
    const copied = new Set();
    for (const t of ticks) {
      const key = dayKey(t.ts);
      if (!copied.has(key)) {
        days.set(key, mergeDay(newDay(), days.get(key) || newDay()));
        copied.add(key);
      }
      record(days.get(key), Math.floor(t.ts / 1000), t.secs, new Date(t.ts).getHours(), t.project, t.language);
    }
    return days;
  }

  _dayIn(map, key) {
    let d = map.get(key);
    if (!d) map.set(key, (d = newDay()));
    return d;
  }

  _scheduleFlush(ms) {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, ms);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  /**
   * Write this window's unflushed time to disk. Synchronous on purpose, so it is
   * safe to call from deactivate(). Returns true when nothing is left pending.
   */
  flush(retries = 3) {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pending.size === 0) return true;

    const byMonth = new Map();
    for (const k of this.pending.keys()) {
      const mk = monthKeyOf(k);
      if (!byMonth.has(mk)) byMonth.set(mk, []);
      byMonth.get(mk).push(k);
    }

    let ok = true;
    let locked = false;
    try {
      this._ensureDir();
      locked = this._withLock(retries, () => {
        for (const [mk, keys] of byMonth) {
          try {
            this._flushMonth(mk, keys);
          } catch (err) {
            this.lastError = err;
            ok = false;
          }
        }
      });
    } catch (err) {
      this.lastError = err;
      ok = false;
    }
    if (!locked || !ok) {
      this._scheduleFlush(RETRY_MS);
      return false;
    }
    return true;
  }

  _flushMonth(mk, keys) {
    const [days] = this._readMonthSync(mk);
    for (const k of keys) days.set(k, mergeDay(days.get(k) || newDay(), this.pending.get(k)));
    const file = this._file(mk);
    const text = serializeMonth(days);
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, text);
    try {
      fs.renameSync(tmp, file);
    } catch {
      // Windows can refuse to replace a file that a scanner/indexer has open.
      fs.writeFileSync(file, text);
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
    for (const k of keys) this.pending.delete(k);
    this._adopt(mk, days, fs.statSync(file).mtimeMs);
  }

  /** Run `fn` while holding the shared lock. Returns false if the lock could not be taken. */
  _withLock(retries, fn) {
    const lock = path.join(this.dir, '.lock');
    let fd = -1;
    for (let i = 0; i <= retries && fd < 0; i++) {
      try {
        fd = fs.openSync(lock, 'wx');
      } catch (err) {
        if (!CONTENDED.has(err.code)) throw err;
        try {
          if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lock); // left by a crashed window
        } catch { /* it was released meanwhile */ }
        if (i < retries) sleepSync(Math.min(20 * (i + 1), 100));
      }
    }
    if (fd < 0) return false;
    try {
      fs.closeSync(fd);
      fn();
    } finally {
      try { fs.unlinkSync(lock); } catch { /* ignore */ }
    }
    return true;
  }

  // housekeeping

  /** Delete all tracked data (memory and disk). Returns false if the disk part could not be done. */
  reset() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pending.clear();
    this.days.clear();
    this.mtimes.clear();
    this._ensureDir();
    return this._withLock(20, () => {
      for (const name of fs.readdirSync(this.dir)) {
        if (MONTH_FILE.test(name) || /\.(corrupt-\d+|tmp)$/.test(name)) {
          try { fs.unlinkSync(path.join(this.dir, name)); } catch { /* ignore */ }
        }
      }
    });
  }

  /** Everything, as a plain object suitable for JSON export. */
  toJSON() {
    const days = {};
    for (const k of [...this.days.keys()].sort()) days[k] = this.days.get(k);
    return { version: FILE_VERSION, exportedAt: new Date().toISOString(), days };
  }

  _file(mk) {
    return path.join(this.dir, mk + '.json');
  }

  _ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true });
  }
}

module.exports = { Store, parseMonth, serializeMonth };
