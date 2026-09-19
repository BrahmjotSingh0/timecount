'use strict';

const vscode = require('vscode');

const WEEK_START = { sunday: 0, monday: 1, saturday: 6 };
const DEFAULT_ITEMS = ['today', 'week', 'month', 'total', 'avg'];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

function readConfig() {
  const c = vscode.workspace.getConfiguration('timecount');
  const items = c.get('statusBar.items', DEFAULT_ITEMS);
  return {
    idleMs: clamp(c.get('idleTimeoutSeconds', 300), 30, 3600) * 1000,
    weekStartsOn: WEEK_START[c.get('weekStartsOn', 'monday')] ?? 1,
    goalSec: clamp(c.get('dailyGoalMinutes', 0), 0, 24 * 60) * 60,
    statusBarEnabled: c.get('statusBar.enabled', true),
    statusBarItems: Array.isArray(items) ? items : DEFAULT_ITEMS,
    statusBarAlignment: c.get('statusBar.alignment') === 'right' ? 'right' : 'left',
  };
}

module.exports = { readConfig };
