'use strict';

const vscode = require('vscode');
const crypto = require('crypto');
const { dashboardData } = require('./stats');

const REFRESH_MS = 15 * 1000;
/** The only actions the page may ask for. */
const ACTIONS = new Set(['exportCsv', 'exportJson', 'openDataFolder', 'resetData', 'togglePause']);

class Dashboard {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {{ store: import('./store').Store, tracker: import('./tracker').Tracker, getConfig: () => any }} deps
   */
  constructor(context, { store, tracker, getConfig }) {
    this.context = context;
    this.store = store;
    this.tracker = tracker;
    this.getConfig = getConfig;
    this.panel = null;
    this.timer = null;
  }

  show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel('timecount.dashboard', 'TimeCount', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [media],
    });
    this.panel = panel;
    panel.webview.html = this._html(panel.webview, media);
    panel.webview.onDidReceiveMessage((msg) => this._onMessage(msg));
    panel.onDidChangeViewState(() => this._syncTimer());
    panel.onDidDispose(() => {
      this._stopTimer();
      this.panel = null;
    });
    this._syncTimer();
  }

  /** Send fresh numbers to the page (no-op while it is closed or hidden). */
  push() {
    if (!this.panel || !this.panel.visible) return;
    const cfg = this.getConfig();
    const state = this.tracker.paused ? 'paused' : this.tracker.counting ? 'active' : 'idle';
    this.panel.webview.postMessage({
      type: 'data',
      data: {
        ...dashboardData(this.store.days, Date.now(), cfg),
        tracking: state,
        dataDir: this.store.dir,
      },
    });
  }

  _onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ready') this.push();
    else if (msg.type === 'action' && ACTIONS.has(msg.id)) vscode.commands.executeCommand('timecount.' + msg.id);
  }

  // The page only refreshes while it is actually on screen.
  _syncTimer() {
    this._stopTimer();
    if (this.panel && this.panel.visible) {
      this.timer = setInterval(() => this.push(), REFRESH_MS);
      this.push();
    }
  }

  _stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _html(webview, media) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const uri = (file) => webview.asWebviewUri(vscode.Uri.joinPath(media, file));
    // No network access of any kind: the page can only run its own script and style.
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('dashboard.css')}">
<title>TimeCount</title>
</head>
<body>
<div id="app" aria-live="off"><p class="loading">Loading...</p></div>
<script nonce="${nonce}" src="${uri('dashboard.js')}"></script>
</body>
</html>`;
  }

  dispose() {
    this._stopTimer();
    if (this.panel) this.panel.dispose();
    this.panel = null;
  }
}

module.exports = { Dashboard, ACTIONS };
