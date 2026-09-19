# Contributing

Thanks for helping with TimeCount. Bug reports, ideas and pull requests are all welcome. Please read the [code of conduct](CODE_OF_CONDUCT.md) first.

## Reporting a bug or asking for a feature

Open an issue and fill in the form. For a bug, please include your TimeCount and VS Code versions, your operating system, what you expected and what happened.

To report a security problem, please do not open an issue. See [SECURITY.md](SECURITY.md).

## Working on the code

You need Node.js 22 or newer.

```
npm install
npm test
npm run typecheck
```

Press F5 in VS Code to start an Extension Development Host with TimeCount loaded.

`npm run test:integration` runs a few checks inside a real VS Code window. It needs VS Code installed and uses a temporary profile, so your own settings are not touched. If VS Code is not found, set `VSCODE_EXECUTABLE` to the path of its executable.

The code is plain JavaScript with no build step. Please keep the extension free of runtime dependencies and network access.

Places to look:

- `src/tracker.js` decides when time counts.
- `src/store.js` reads and writes the data files.
- `src/stats.js` turns the data into numbers.
- `media/dashboard.js` draws the dashboard.

## Easy ways to help

- Add names for more language ids in `src/languages.js`.
- Translate the dashboard and status bar text. Nothing is set up for this yet, so open an issue first to agree on how.
- Try it on macOS and Linux and tell me what does not work.

## Pull requests

- Keep each one small and focused, and say what changed and why.
- Add or update tests when behaviour changes.
- Make sure `npm test` and `npm run typecheck` pass. CI runs them on every pull request.
- Add a line to `CHANGELOG.md` for anything users will notice.
