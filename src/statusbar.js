'use strict';

const vscode = require('vscode');
const { summarize, topOf } = require('./stats');
const T = require('./time');

const REFRESH_MS = 10 * 1000;
const fmt = (sec) => T.formatDuration(sec, 100);

// One entry per selectable status bar item. Returning null hides it.
const ITEMS = {
  today: (s) => 'Today ' + fmt(s.today),
  yesterday: (s) => 'Yesterday ' + fmt(s.yesterday),
  week: (s) => 'Week ' + fmt(s.week),
  month: (s) => 'Month ' + fmt(s.month),
  year: (s) => 'Year ' + fmt(s.year),
  total: (s) => 'Total ' + fmt(s.total),
  avg: (s) => 'Avg ' + fmt(s.avg),
  streak: (s) => '$(flame) ' + s.streak.current + 'd',
  session: (s) => 'Session ' + fmt(s.currentSession),
  goal: (s) => (s.goalSec > 0 ? 'Goal ' + Math.round(s.goalPct * 100) + '%' : null),
};

/** Escape text that comes from outside (folder names) before it goes into Markdown. */
const escMd = (s) => String(s).replace(/[\\`*_{}[\]()#+\-.!|<>~&]/g, '\\$&');

const dateLabel = (key) =>
  new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

class StatusBar {
  /**
   * @param {{ store: import('./store').Store, tracker: import('./tracker').Tracker, getConfig: () => any }} deps
   */
  constructor({ store, tracker, getConfig }) {
    this.store = store;
    this.tracker = tracker;
    this.getConfig = getConfig;
    this.item = null;
    this.lastAt = 0;
    this.lastState = '';
    this.lastText = '';
    this.lastTip = '';
    this.alignment = null;
  }

  state() {
    return this.tracker.paused ? 'paused' : this.tracker.counting ? 'active' : 'idle';
  }

  /** (Re)create the item when the enabled flag or alignment setting changed. */
  reconfigure() {
    const cfg = this.getConfig();
    if (!cfg.statusBarEnabled || this.alignment !== cfg.statusBarAlignment) this.dispose();
    if (cfg.statusBarEnabled && !this.item) {
      this.alignment = cfg.statusBarAlignment;
      const side = this.alignment === 'right' ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;
      this.item = vscode.window.createStatusBarItem('timecount.status', side, 100);
      this.item.name = 'TimeCount';
      this.item.command = 'timecount.openDashboard';
    }
    this.update(true);
  }

  /** Re-render if enough time has passed or the tracking state changed. */
  update(force = false) {
    if (!this.item) return;
    const now = Date.now();
    const state = this.state();
    if (!force && state === this.lastState && now - this.lastAt < REFRESH_MS) return;
    this.lastAt = now;
    this.lastState = state;

    const cfg = this.getConfig();
    const days = this.store.daysWith(this.tracker.held);
    const s = summarize(days, now, cfg);
    const icon = state === 'paused' ? '$(debug-pause)' : state === 'active' ? '$(pulse)' : '$(clock)';
    const parts = [];
    // Until history has loaded the totals would be wrong, so only show the icon.
    if (this.store.loaded) {
      for (const id of cfg.statusBarItems) {
        const text = ITEMS[id] && ITEMS[id](s);
        if (text) parts.push(text);
      }
    }
    const text = icon + ' ' + (parts.length ? parts.join(' · ') : 'TimeCount');

    if (text !== this.lastText) {
      this.lastText = text;
      this.item.text = text;
      this.item.accessibilityInformation = { label: 'TimeCount: ' + parts.join(', ').replace(/\$\([\w-]+\)\s*/g, ''), role: 'button' };
      this.item.backgroundColor = state === 'paused' ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    }

    const tip = this._tooltip(s, days, state, cfg);
    if (tip.value !== this.lastTip) {
      this.lastTip = tip.value;
      this.item.tooltip = tip;
    }
    this.item.show();
  }

  _tooltip(s, days, state, cfg) {
    const week = T.weekStartKey(s.todayKey, cfg.weekStartsOn);
    const top = topOf(days, week, s.todayKey);
    const rows = [
      ['Today', fmt(s.today)],
      ['Yesterday', fmt(s.yesterday)],
      ['This week', fmt(s.week)],
      ['This month', fmt(s.month)],
      ['This year', fmt(s.year)],
      ['All time', fmt(s.total)],
      ['Daily average', fmt(s.avg)],
    ];
    if (s.bestDay) rows.push(['Best day', fmt(s.bestDay.sec) + ' · ' + dateLabel(s.bestDay.key)]);
    rows.push(['Streak', s.streak.current + 'd (best ' + s.streak.longest + 'd)']);
    if (s.sessionsToday) rows.push(['Sessions today', s.sessionsToday + ' · longest ' + fmt(s.longestToday)]);
    if (s.goalSec > 0) rows.push(['Daily goal', Math.round(s.goalPct * 100) + '% of ' + fmt(s.goalSec)]);
    if (top.project) rows.push(['Top project (week)', escMd(top.project.name) + ' · ' + fmt(top.project.sec)]);
    if (top.language) rows.push(['Top language (week)', escMd(top.language.name) + ' · ' + fmt(top.language.sec)]);

    const stateText = { active: 'tracking', idle: 'idle', paused: 'paused' }[state];
    const md = new vscode.MarkdownString();
    md.isTrusted = { enabledCommands: ['timecount.openDashboard', 'timecount.togglePause'] };
    md.appendMarkdown('**TimeCount** · ' + stateText + '\n\n| | |\n|:--|--:|\n');
    for (const [k, v] of rows) md.appendMarkdown('| ' + k + ' | **' + v + '** |\n');
    md.appendMarkdown(
      '\n[Open dashboard](command:timecount.openDashboard) · [' +
      (state === 'paused' ? 'Resume' : 'Pause') + ' tracking](command:timecount.togglePause)'
    );
    return md;
  }

  dispose() {
    if (this.item) this.item.dispose();
    this.item = null;
    this.lastText = '';
    this.lastTip = '';
  }
}

module.exports = { StatusBar, ITEMS };
