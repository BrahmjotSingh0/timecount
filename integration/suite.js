'use strict';

// Runs inside the extension host of a real VS Code (see run.js). Checks what the
// unit tests cannot: that the manifest is valid, the extension activates against
// the real API, and the commands and the dashboard webview really work.

const assert = require('assert');
const vscode = require('vscode');
const pkg = require('../package.json');

const EXTENSION_ID = pkg.publisher + '.' + pkg.name;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(check, what, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error('Timed out waiting for ' + what);
}

const dashboardTab = () => vscode.window.tabGroups.all
  .flatMap((g) => g.tabs)
  .find((t) => t.input instanceof vscode.TabInputWebview && /timecount\.dashboard/.test(t.input.viewType));

const steps = [
  ['the extension is installed and activates', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, 'extension ' + EXTENSION_ID + ' not found');
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  }],

  ['every contributed command is registered', async () => {
    const registered = await vscode.commands.getCommands(true);
    for (const c of pkg.contributes.commands) assert.ok(registered.includes(c.command), 'missing ' + c.command);
  }],

  ['settings have their documented defaults', async () => {
    const cfg = vscode.workspace.getConfiguration('timecount');
    assert.strictEqual(cfg.get('idleTimeoutSeconds'), 180);
    assert.strictEqual(cfg.get('weekStartsOn'), 'monday');
    assert.strictEqual(cfg.get('dailyGoalMinutes'), 0);
    assert.strictEqual(cfg.get('statusBar.enabled'), true);
    assert.strictEqual(cfg.get('statusBar.alignment'), 'left');
    assert.deepStrictEqual(cfg.get('statusBar.items'), ['today', 'week', 'month', 'total', 'avg']);
  }],

  ['the dashboard opens as a webview tab and only once', async () => {
    await vscode.commands.executeCommand('timecount.openDashboard');
    const tab = await until(dashboardTab, 'the dashboard tab');
    assert.strictEqual(tab.label, 'TimeCount');
    await vscode.commands.executeCommand('timecount.openDashboard');
    const count = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputWebview).length;
    assert.strictEqual(count, 1, 'a second dashboard was opened');
  }],

  ['pausing and resuming does not throw', async () => {
    await vscode.commands.executeCommand('timecount.togglePause');
    await vscode.commands.executeCommand('timecount.togglePause');
  }],

  ['editing and switching documents does not throw', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'javascript', content: 'const a = 1;\n' });
    const editor = await vscode.window.showTextDocument(doc);
    await editor.edit((b) => b.insert(new vscode.Position(1, 0), 'const b = 2;\n'));
    await vscode.commands.executeCommand('workbench.action.output.toggleOutput');
    await sleep(300);
  }],

  ['changing settings applies live', async () => {
    const cfg = vscode.workspace.getConfiguration('timecount');
    await cfg.update('statusBar.items', ['month', 'streak'], vscode.ConfigurationTarget.Global);
    await cfg.update('statusBar.alignment', 'right', vscode.ConfigurationTarget.Global);
    await cfg.update('dailyGoalMinutes', 90, vscode.ConfigurationTarget.Global);
    await sleep(300);
    await cfg.update('statusBar.items', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('statusBar.alignment', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('dailyGoalMinutes', undefined, vscode.ConfigurationTarget.Global);
    await cfg.update('statusBar.enabled', false, vscode.ConfigurationTarget.Global);
    await sleep(200);
    await cfg.update('statusBar.enabled', undefined, vscode.ConfigurationTarget.Global);
  }],

  ['the extension is still healthy afterwards', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.strictEqual(ext.isActive, true);
    assert.ok(dashboardTab(), 'the dashboard tab disappeared');
  }],
];

async function run() {
  let failed = 0;
  for (const [name, fn] of steps) {
    try {
      await fn();
      console.log('  ok   ' + name);
    } catch (err) {
      failed++;
      console.log('  FAIL ' + name + '\n       ' + (err && err.stack ? err.stack : err));
    }
  }
  console.log('VS Code ' + vscode.version + ', window focused: ' + vscode.window.state.focused);
  if (failed) throw new Error(failed + ' integration step(s) failed');
}

module.exports = { run };
