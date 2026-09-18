# TimeCount

Tracks how much time you spend in VS Code. The status bar shows today, this week, this month, your total and your daily average, and a dashboard has the details. Everything is stored on your own computer. There is no account and nothing is sent anywhere.

## Status bar

By default it shows Today, Week, Month, Total and Avg. Hover over it for more: yesterday, this year, best day, streak, sessions, and your top project and language this week. Click it to open the dashboard.

You can change what it shows with the `timecount.statusBar.items` setting. The options are `today`, `yesterday`, `week`, `month`, `year`, `total`, `avg`, `streak`, `session` and `goal`.

## Dashboard

Open it from the status bar or with **TimeCount: Open Dashboard**.

- Today so far, compared with your usual day, and progress towards an optional daily goal
- Today's sessions on a timeline
- Yesterday, this week, this month, this year, all time, daily average, average session, best day, longest session and streak
- A heatmap of the last 12 months
- Time per day, week or month, time of day, day of week, projects and languages, for the last 7 days, 30 days, 90 days, 1 year or all time
- A Tables view that shows the same numbers as tables

## How time is counted

Time counts while the VS Code window is focused and you are doing something in it: typing, moving the cursor, scrolling, switching files, saving, using the terminal. It keeps counting for a few minutes after your last input (3 by default), so reading code still counts, and then it stops. Switching to another app stops it straight away. If the computer goes to sleep, that gap is not counted.

Each bit of time is filed under a project (the workspace folder of the file you are in) and a language (the language of that file). Time when no editor is focused, such as in the terminal, is listed as "No editor".

To leave something out, pause tracking with **TimeCount: Pause / Resume Tracking**.

## Where the data is kept

In JSON files, one per month, in the extension's global storage folder. **TimeCount: Open Data Folder** opens it. On Windows that is `%APPDATA%\Code\User\globalStorage\<publisher>.timecount`.

A day looks like this:

```json
"2026-09-18": {
  "total": 8040,
  "hours": [0, 0, 0, 0, 0, 0, 0, 0, 0, 1800, 2400, 1200, 0, 900, 1740, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "projects": { "my-app": 6000, "docs": 2040 },
  "languages": { "typescript": 5000, "markdown": 1500, "(no editor)": 1540 },
  "sessions": [[1789718400, 1789723200, 3400], [1789730000, 1789734640, 4640]]
}
```

Times are in seconds. `hours` is the time spent in each hour of the day, and each session is `[start, end, active seconds]` with Unix timestamps. Only dates, seconds, folder names and language names are stored. No file names, file contents or keystrokes.

If you have several VS Code windows open they share the same folder. Only the focused window counts time, and each window merges what it tracked into the files instead of overwriting them.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `timecount.idleTimeoutSeconds` | `180` | Seconds without activity before time stops counting (30 to 3600). |
| `timecount.weekStartsOn` | `monday` | `monday`, `sunday` or `saturday`. |
| `timecount.dailyGoalMinutes` | `0` | Daily goal in minutes. `0` turns it off. |
| `timecount.statusBar.enabled` | `true` | Show the status bar item. |
| `timecount.statusBar.items` | `today`, `week`, `month`, `total`, `avg` | What to show, in order. |
| `timecount.statusBar.alignment` | `left` | `left` or `right`. |

## Commands

- **TimeCount: Open Dashboard**
- **TimeCount: Pause / Resume Tracking**
- **TimeCount: Export Daily Totals as CSV…**
- **TimeCount: Export All Data as JSON…**
- **TimeCount: Open Data Folder**
- **TimeCount: Reset All Data…**

## Notes

- It works in remote windows (SSH, WSL, containers). The extension runs on your local machine, so all your time ends up in one place.
- It does not work in VS Code for the Web, because it needs to write files.
- To move your history to another computer, copy the data folder while VS Code is closed.
- It needs VS Code 1.90 or newer.

## Development

```
npm install
npm test
npm run typecheck
npm run package
```

Press F5 in VS Code to try it in an Extension Development Host. `npm run test:integration` runs a few checks in a real VS Code window.

## License

MIT. Copyright (c) 2026 Brahmjot Singh.
