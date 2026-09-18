'use strict';

const { languageName } = require('./languages');

/** Quote a CSV field, and defuse spreadsheet formulas in names we don't control. */
function csvCell(value) {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function top(map) {
  let id = '';
  let sec = 0;
  for (const k in map) if (map[k] > sec) { id = k; sec = map[k]; }
  return id;
}

/** One row per day: date, seconds, hours, sessions, top project, top language. */
function toCsv(days) {
  const rows = ['date,seconds,hours,sessions,top_project,top_language'];
  for (const key of [...days.keys()].sort()) {
    const d = days.get(key);
    if (d.total <= 0) continue;
    const lang = top(d.languages);
    rows.push([
      key,
      d.total,
      (d.total / 3600).toFixed(2),
      d.sessions.length,
      csvCell(top(d.projects)),
      csvCell(lang ? languageName(lang) : ''),
    ].join(','));
  }
  return rows.join('\n') + '\n';
}

module.exports = { toCsv, csvCell };
