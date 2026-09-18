'use strict';

// Launches a real VS Code with this extension loaded and runs integration/suite.js
// inside its extension host. Uses a throwaway profile, so your own settings and
// extensions are never touched.
//
//   npm run test:integration
//
// By default VS Code is downloaded into .vscode-test/. To reuse an installed copy:
//   set VSCODE_EXECUTABLE=C:\path\to\Code.exe   (Windows)
//   VSCODE_EXECUTABLE=/path/to/code npm run test:integration

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'timecount-it-'));
  const workspace = path.join(scratch, 'workspace');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'hello.js'), 'console.log("hello");\n');
  try {
    await runTests({
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE || undefined,
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, 'suite.js'),
      extensionTestsEnv: { TIMECOUNT_TEST_DATA_DIR: path.join(scratch, 'user-data') },
      launchArgs: [
        workspace,
        '--disable-extensions',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--user-data-dir', path.join(scratch, 'user-data'),
        '--extensions-dir', path.join(scratch, 'extensions'),
      ],
    });
  } finally {
    // VS Code can still be releasing files as it exits. Cleaning up must never mask the result.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      console.warn('Could not remove ' + scratch + ' (the OS will clear it from the temp folder).');
    }
  }
}

main().catch((err) => {
  console.error('Integration tests failed:', err && err.message ? err.message : err);
  process.exit(1);
});
