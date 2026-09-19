# Changelog

All notable changes to TimeCount are listed here, newest first.

## 0.1.1 - 2026-09-19

- Time spent reading or waiting with no input (for example while a build or an AI agent runs) now counts, as long as you are active again within the idle timeout. Longer gaps are still not counted.
- The default idle timeout is now 5 minutes instead of 3.
- The status bar and dashboard include this waiting time as it happens.
- Added a link to the source code and issue tracker on GitHub.
- New README with screenshots, install steps and a table of what counts as time.
- More search keywords.

## 0.1.0 - 2026-09-19

First release.

- Time tracking while VS Code is focused and you are active, with an idle timeout and a pause command.
- Status bar with today, week, month, total and average time. The items are configurable.
- Dashboard with a 12 month heatmap, sessions timeline, time per day, week and month, time of day, day of week, projects and languages.
- Tables view for every chart.
- Optional daily goal.
- CSV and JSON export, open data folder and reset commands.
- Data is stored locally in one JSON file per month and is safe to use with several VS Code windows open.
