'use strict';

const vscode = require('vscode');
const os = require('os');
const path = require('path');
const { Store } = require('./store');
const { Tracker } = require('./tracker');
const { StatusBar } = require('./statusbar');
const { Dashboard } = require('./dashboard');
const { readConfig } = require('./config');
const { NO_EDITOR } = require('./languages');
const { toCsv } = require('./export');

/** Documents that are not "work": output channels, debug console, input boxes. */
const IGNORED_SCHEMES = new Set(['output', 'debug', 'vscode-terminal', 'vscode-scm', 'comment', 'vscode-chat-input']);
const NO_PROJECT = '(no project)';

/** @type {Store | undefined} */
let store;
/** @type {Tracker | undefined} */
let tracker;

function activate(context) {
  let config = readConfig();
  const getConfig = () => config;

  store = new Store(context.globalStorageUri.fsPath);
  /** @type {StatusBar} */
  let status;
  tracker = new Tracker(store, { idleMs: config.idleMs, onChange: () => status.update() });
  status = new StatusBar({ store, tracker, getConfig });
  const dashboard = new Dashboard(context, { store, tracker, getConfig });

  // project and language of the file being edited (cached so ticks do no lookups)

  const workspaceLabel = () => {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length === 1) return folders[0].name;
    return vscode.workspace.name || NO_PROJECT;
  };

  const syncContext = () => {
    const editor = vscode.window.activeTextEditor;
    const doc = editor && editor.document;
    if (doc && !IGNORED_SCHEMES.has(doc.uri.scheme)) {
      const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
      tracker.project = folder ? folder.name : workspaceLabel();
      tracker.language = doc.languageId;
    } else {
      tracker.project = workspaceLabel();
      tracker.language = NO_EDITOR;
    }
  };

  // activity

  const touch = () => tracker.touch();
  const isWork = (doc) => !IGNORED_SCHEMES.has(doc.uri.scheme);
  let focused = vscode.window.state.focused;

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      const focusChanged = state.focused !== focused;
      focused = state.focused;
      if (focusChanged && state.focused) store.refresh(); // pick up time other windows tracked
      tracker.setWindowState(state);
      if (focusChanged && !state.focused) store.flush(); // hand our time over to other windows
      if (focusChanged) status.update(true);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => { if (e.contentChanges.length && isWork(e.document)) touch(); }),
    vscode.window.onDidChangeTextEditorSelection((e) => { if (isWork(e.textEditor.document)) touch(); }),
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => { if (isWork(e.textEditor.document)) touch(); }),
    vscode.window.onDidChangeActiveTextEditor(() => { syncContext(); touch(); }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      // A language-mode change re-opens the document.
      if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === doc) syncContext();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(syncContext),
    vscode.workspace.onDidSaveTextDocument(touch),
    vscode.window.onDidChangeActiveTerminal(touch),
    vscode.debug.onDidStartDebugSession(touch),
    vscode.debug.onDidTerminateDebugSession(touch),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('timecount')) return;
      config = readConfig();
      tracker.setIdleTimeout(config.idleMs);
      status.reconfigure();
      dashboard.push();
    })
  );

  // commands

  const register = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand('timecount.' + id, fn));

  register('openDashboard', () => dashboard.show());

  register('togglePause', () => {
    tracker.setPaused(!tracker.paused);
    status.update(true);
    dashboard.push();
    vscode.window.setStatusBarMessage(tracker.paused ? 'TimeCount: tracking paused' : 'TimeCount: tracking resumed', 3000);
  });

  register('exportCsv', async () => {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), 'timecount.csv')),
      filters: { CSV: ['csv'] },
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(toCsv(store.days), 'utf8'));
    vscode.window.showInformationMessage('TimeCount: daily totals exported to ' + uri.fsPath);
  });

  register('exportJson', async () => {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), 'timecount.json')),
      filters: { JSON: ['json'] },
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(store.toJSON(), null, 1), 'utf8'));
    vscode.window.showInformationMessage('TimeCount: all data exported to ' + uri.fsPath);
  });

  register('openDataFolder', async () => {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(store.dir));
    vscode.env.openExternal(vscode.Uri.file(store.dir));
  });

  register('resetData', async () => {
    const yes = 'Delete Everything';
    const pick = await vscode.window.showWarningMessage(
      'Delete all tracked time on this machine? This cannot be undone.',
      { modal: true },
      yes
    );
    if (pick !== yes) return;
    const done = store.reset();
    status.update(true);
    dashboard.push();
    if (done) vscode.window.showInformationMessage('TimeCount: all data deleted.');
    else vscode.window.showWarningMessage('TimeCount: another window is using the data files; try again in a moment.');
  });

  context.subscriptions.push({ dispose: () => dashboard.dispose() }, { dispose: () => status.dispose() });

  status.reconfigure();
  syncContext();
  tracker.setWindowState(vscode.window.state);
  // History loads in the background. Until it is in, the status bar shows only its icon.
  return store.load().then(
    () => {
      status.update(true);
      dashboard.push();
    },
    (err) => console.error('TimeCount: could not load data', err)
  );
}

function deactivate() {
  if (tracker) tracker.dispose(); // credits the last partial tick
  if (store) store.flush(20); // synchronous, so it completes before the host exits
}

module.exports = { activate, deactivate };
