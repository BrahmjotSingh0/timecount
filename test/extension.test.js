'use strict';

// Loads the real extension entry point against a fake `vscode` module and drives
// it with events, to check the wiring end to end (events -> tracker -> store ->
// status bar / dashboard) without launching VS Code.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const mockTimers = test.mock.timers;
const T0 = new Date(2026, 8, 18, 10, 0, 0).getTime();

function makeEvent() {
  const listeners = new Set();
  const ev = (fn) => { listeners.add(fn); return { dispose: () => listeners.delete(fn) }; };
  ev.fire = (arg) => { for (const l of [...listeners]) l(arg); };
  return ev;
}

function makeFakeVscode(settings = {}) {
  const events = new Proxy({}, { get: (o, k) => o[k] || (o[k] = makeEvent()) });
  const commands = new Map();
  const items = [];
  const panels = [];
  const executed = [];
  const messages = [];

  const window = {
    state: { focused: true, active: true },
    activeTextEditor: undefined,
    onDidChangeWindowState: events.windowState,
    onDidChangeTextEditorSelection: events.selection,
    onDidChangeTextEditorVisibleRanges: events.visibleRanges,
    onDidChangeActiveTextEditor: events.activeEditor,
    onDidChangeActiveTerminal: events.terminal,
    createStatusBarItem: (id, alignment, priority) => {
      const item = { id, alignment, priority, text: '', tooltip: undefined, shown: false, disposed: false,
        show() { this.shown = true; }, dispose() { this.disposed = true; } };
      items.push(item);
      return item;
    },
    setStatusBarMessage: (m) => messages.push(m),
    showSaveDialog: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => 'Delete Everything',
    createWebviewPanel: (viewType, title) => {
      const posted = [];
      const handlers = { message: null, viewState: null, dispose: null };
      const panel = {
        viewType, title, visible: true, posted, disposed: false,
        webview: {
          html: '', cspSource: 'vscode-resource:',
          asWebviewUri: (u) => 'vscode-resource://' + u.path,
          postMessage: async (m) => { posted.push(m); return true; },
          onDidReceiveMessage: (fn) => { handlers.message = fn; return { dispose() {} }; },
        },
        onDidChangeViewState: (fn) => { handlers.viewState = fn; return { dispose() {} }; },
        onDidDispose: (fn) => { handlers.dispose = fn; return { dispose() {} }; },
        reveal() { panel.revealed = true; },
        dispose() { panel.disposed = true; if (handlers.dispose) handlers.dispose(); },
        handlers,
      };
      panels.push(panel);
      return panel;
    },
  };

  const api = {
    window,
    workspace: {
      workspaceFolders: [{ name: 'demo' }],
      name: 'demo',
      getConfiguration: () => ({ get: (k, d) => (k in settings ? settings[k] : d) }),
      getWorkspaceFolder: () => ({ name: 'demo' }),
      onDidChangeTextDocument: events.doc,
      onDidOpenTextDocument: events.openDoc,
      onDidSaveTextDocument: events.saveDoc,
      onDidChangeWorkspaceFolders: events.folders,
      onDidChangeConfiguration: events.config,
      fs: { writeFile: async () => {}, createDirectory: async () => {} },
    },
    debug: { onDidStartDebugSession: events.debugStart, onDidTerminateDebugSession: events.debugEnd },
    commands: {
      registerCommand: (id, fn) => { commands.set(id, fn); return { dispose() {} }; },
      executeCommand: async (id, ...args) => { executed.push(id); const fn = commands.get(id); return fn && fn(...args); },
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    MarkdownString: class { constructor() { this.value = ''; } appendMarkdown(s) { this.value += s; return this; } },
    Uri: {
      file: (p) => ({ fsPath: p, path: p }),
      joinPath: (base, ...parts) => ({ path: [base.path, ...parts].join('/') }),
    },
    ViewColumn: { Active: -1 },
    env: { openExternal: async () => true },
  };
  return { api, events, commands, items, panels, executed, messages };
}

/** Load a fresh copy of the extension wired to a fake vscode. */
function boot(t, settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timecount-ext-'));
  const fake = makeFakeVscode(settings);
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    return request === 'vscode' ? fake.api : originalLoad.call(this, request, ...rest);
  };
  for (const k of Object.keys(require.cache)) if (k.includes(path.sep + 'src' + path.sep)) delete require.cache[k];
  const ext = require('../src/extension');
  mockTimers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: T0 });
  t.after(() => {
    mockTimers.reset();
    Module._load = originalLoad;
    ext.deactivate();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const context = {
    subscriptions: [],
    globalStorageUri: { fsPath: dir },
    extensionUri: { path: '/ext' },
  };
  return { fake, ext, context, dir };
}

const statusText = (fake) => fake.items[fake.items.length - 1].text;
const ticks = (n) => { for (let i = 0; i < n; i++) mockTimers.tick(5000); };
const monthFile = (dir) => path.join(dir, '2026-09.json');

test('activate creates the status bar item and commands', async (t) => {
  const { fake, ext, context } = boot(t);
  await ext.activate(context);

  assert.equal(fake.items.length, 1);
  assert.equal(fake.items[0].id, 'timecount.status');
  assert.equal(fake.items[0].command, 'timecount.openDashboard');
  assert.equal(fake.items[0].alignment, 1);
  assert.equal(fake.items[0].shown, true);
  for (const id of ['openDashboard', 'togglePause', 'exportCsv', 'exportJson', 'openDataFolder', 'resetData']) {
    assert.ok(fake.commands.has('timecount.' + id), 'missing command ' + id);
  }
});

test('status bar updates and time is saved on blur', async (t) => {
  const { fake, ext, context, dir } = boot(t);
  await ext.activate(context);
  assert.match(statusText(fake), /Today 0m · Week 0m · Month 0m · Total 0m · Avg 0m/);

  ticks(6); // 30 s of active use
  assert.match(statusText(fake), /^\$\(pulse\) Today \d+s/);
  ticks(6);
  assert.match(statusText(fake), /Today 1m · Week 1m · Month 1m · Total 1m/);
  assert.match(fake.items[0].tooltip.value, /\| Today \| \*\*1m\*\* \|/);
  assert.match(fake.items[0].tooltip.value, /Top project \(week\) \| \*\*demo/);

  // Nothing written yet (the periodic save has not run)...
  assert.equal(fs.existsSync(monthFile(dir)), false);
  // ...but losing focus writes it straight away.
  fake.api.window.state = { focused: false, active: false };
  fake.events.windowState.fire(fake.api.window.state);
  const saved = JSON.parse(fs.readFileSync(monthFile(dir), 'utf8'));
  assert.equal(saved.days['2026-09-18'].total, 60);
  assert.equal(saved.days['2026-09-18'].projects.demo, 60);
  assert.match(statusText(fake), /^\$\(clock\)/);
});

test('periodic save', async (t) => {
  const { fake, ext, context, dir } = boot(t);
  await ext.activate(context);
  ticks(13); // > 60 s
  assert.equal(fs.existsSync(monthFile(dir)), true);
  assert.ok(JSON.parse(fs.readFileSync(monthFile(dir), 'utf8')).days['2026-09-18'].total >= 55);
  assert.ok(fake.items[0].shown);
});

test('output channel noise is not activity', async (t) => {
  const { fake, ext, context } = boot(t, { idleTimeoutSeconds: 30 });
  await ext.activate(context);
  fake.api.window.state = { focused: true, active: false };
  fake.events.windowState.fire(fake.api.window.state);

  // An extension logging to its output channel every 5 s for two minutes.
  for (let i = 0; i < 24; i++) {
    fake.events.doc.fire({ contentChanges: [{}], document: { uri: { scheme: 'output' } } });
    ticks(1);
  }
  assert.match(statusText(fake), /^\$\(clock\)/, 'idle despite the output noise');

  // A real edit wakes it up again.
  fake.events.doc.fire({ contentChanges: [{}], document: { uri: { scheme: 'file' } } });
  assert.match(statusText(fake), /^\$\(pulse\)/);
  // Saving a file that only changed its dirty flag (no content changes) is not an edit.
  ticks(20);
  fake.events.doc.fire({ contentChanges: [], document: { uri: { scheme: 'file' } } });
  assert.match(statusText(fake), /^\$\(clock\)/);
});

test('time goes to the active file\'s project and language', async (t) => {
  const { fake, ext, context, dir } = boot(t);
  fake.api.window.activeTextEditor = { document: { uri: { scheme: 'file' }, languageId: 'python' } };
  fake.api.workspace.getWorkspaceFolder = () => ({ name: 'backend' });
  await ext.activate(context);
  ticks(4);

  // Switch to the terminal / a webview: no text editor.
  fake.api.window.activeTextEditor = undefined;
  fake.events.activeEditor.fire(undefined);
  ticks(2);

  fake.api.window.state = { focused: false, active: false };
  fake.events.windowState.fire(fake.api.window.state);
  const day = JSON.parse(fs.readFileSync(monthFile(dir), 'utf8')).days['2026-09-18'];
  assert.equal(day.languages.python, 20);
  assert.equal(day.languages['(no editor)'], 10);
  assert.equal(day.projects.backend, 20);
  assert.equal(day.projects.demo, 10);
});

test('pause command', async (t) => {
  const { fake, ext, context } = boot(t);
  await ext.activate(context);
  ticks(6);
  await fake.api.commands.executeCommand('timecount.togglePause');
  assert.match(statusText(fake), /^\$\(debug-pause\)/);
  assert.ok(fake.items[0].backgroundColor);
  const before = statusText(fake);
  ticks(20);
  assert.equal(statusText(fake), before);
  await fake.api.commands.executeCommand('timecount.togglePause');
  assert.match(statusText(fake), /^\$\(pulse\)/);
  assert.equal(fake.items[0].backgroundColor, undefined);
});

test('status bar follows settings', async (t) => {
  const { fake, ext, context } = boot(t, {
    'statusBar.items': ['month', 'streak', 'goal', 'bogus'],
    'statusBar.alignment': 'right',
    dailyGoalMinutes: 60,
  });
  await ext.activate(context);
  assert.equal(fake.items[0].alignment, 2);
  assert.equal(statusText(fake), '$(pulse) Month 0m · $(flame) 0d · Goal 0%');
});

test('disabled status bar creates no item', async (t) => {
  const { fake, ext, context } = boot(t, { 'statusBar.enabled': false });
  await ext.activate(context);
  assert.equal(fake.items.length, 0);
});

test('dashboard panel', async (t) => {
  const { fake, ext, context } = boot(t);
  await ext.activate(context);
  ticks(6);

  await fake.api.commands.executeCommand('timecount.openDashboard');
  const panel = fake.panels[0];
  assert.equal(panel.viewType, 'timecount.dashboard');
  const html = panel.webview.html;
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'nonce-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(html, /connect-src|img-src|https?:\/\/[^"']*\.(js|css)/);
  const nonce = /script-src 'nonce-([^']+)'/.exec(html)[1];
  assert.ok(html.includes(`<script nonce="${nonce}"`));

  // The page announces itself and receives the numbers.
  panel.handlers.message({ type: 'ready' });
  const msg = panel.posted.find((m) => m.type === 'data');
  assert.ok(msg, 'data posted');
  assert.equal(msg.data.summary.today, 30);
  assert.equal(msg.data.tracking, 'active');
  assert.ok(msg.data.dataDir.includes('timecount-ext-'));
  assert.deepEqual(Object.keys(msg.data.ranges), ['7d', '30d', '90d', '1y', 'all']);

  // Opening it again just reveals the existing panel.
  await fake.api.commands.executeCommand('timecount.openDashboard');
  assert.equal(fake.panels.length, 1);
  assert.equal(panel.revealed, true);

  // It refreshes on a timer while visible...
  const count = panel.posted.length;
  mockTimers.tick(15000);
  assert.ok(panel.posted.length > count);
  // ...and stops when hidden.
  panel.visible = false;
  panel.handlers.viewState();
  const hiddenCount = panel.posted.length;
  mockTimers.tick(60000);
  assert.equal(panel.posted.length, hiddenCount);

  // The page can trigger only the listed actions.
  panel.handlers.message({ type: 'action', id: 'exportCsv' });
  panel.handlers.message({ type: 'action', id: 'workbench.action.quit' });
  panel.handlers.message({ type: 'action', id: 'timecount.resetData' });
  panel.handlers.message('garbage');
  panel.handlers.message(null);
  assert.ok(fake.executed.includes('timecount.exportCsv'));
  assert.ok(!fake.executed.includes('workbench.action.quit'));
  assert.ok(!fake.executed.includes('timecount.timecount.resetData'));
  assert.equal(fake.executed.filter((c) => c === 'timecount.resetData').length, 0);
});

test('reset command', async (t) => {
  const { fake, ext, context, dir } = boot(t);
  await ext.activate(context);
  ticks(13);
  assert.equal(fs.existsSync(monthFile(dir)), true);
  await fake.api.commands.executeCommand('timecount.resetData');
  assert.equal(fs.existsSync(monthFile(dir)), false);
  assert.match(statusText(fake), /Total 0m/);
});

test('deactivate saves', async (t) => {
  const { fake, ext, context, dir } = boot(t);
  await ext.activate(context);
  ticks(4); // 20 s, not yet flushed
  assert.equal(fs.existsSync(monthFile(dir)), false);
  ext.deactivate();
  assert.equal(JSON.parse(fs.readFileSync(monthFile(dir), 'utf8')).days['2026-09-18'].total, 20);
  assert.ok(fake);
});
