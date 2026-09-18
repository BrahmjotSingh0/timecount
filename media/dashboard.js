(function () {
  'use strict';

  // The extension sends a data object and this file draws it. The DOM is built with
  // h() instead of innerHTML because project names come from folder names on disk.

  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  const RANGES = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['1y', '1 year'], ['all', 'All time']];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'g', 'rect', 'path', 'line', 'text']);

  const saved = vscode.getState() || {};
  const ui = {
    view: saved.view === 'tables' ? 'tables' : 'charts',
    range: RANGES.some((r) => r[0] === saved.range) ? saved.range : '30d',
  };
  let data = null;
  let lastKey = '';
  let charts = [];
  let drawnWidth = 0;

  // helpers

  function h(tag, attrs, ...kids) {
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'style') for (const p of Object.keys(v)) el.style.setProperty(p, v[p]); // CSP forbids style attributes
        else if (k === 'tip') el._tip = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  function dur(sec) {
    sec = Math.max(0, Math.floor(sec) || 0);
    if (sec === 0) return '0m';
    if (sec < 60) return sec + 's';
    const m = Math.floor(sec / 60);
    if (m < 60) return m + 'm';
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? hh + 'h ' + mm + 'm' : hh + 'h';
  }
  const signed = (sec) => (sec >= 0 ? '+' : '-') + dur(Math.abs(sec));
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

  const dateOf = (key) => new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  const keyOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const addDaysKey = (key, n) => keyOf(new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + n));
  const fmtDate = (key, opts) => dateOf(key).toLocaleDateString(undefined, opts);
  const fmtClock = (sec) => new Date(sec * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const weekdayName = (wd, style) => new Date(2024, 0, 7 + wd).toLocaleDateString(undefined, { weekday: style }); // 2024-01-07 was a Sunday
  const FULL_DATE = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };

  /** Round the y-axis up to a clean number of minutes/hours with about four gridlines. */
  const TICK_STEPS_MIN = [5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440, 2880, 7200, 14400, 43200];
  function niceScale(maxSec) {
    const maxMin = Math.max(maxSec, 300) / 60;
    const step = TICK_STEPS_MIN.find((s) => maxMin / s <= 4) || TICK_STEPS_MIN[TICK_STEPS_MIN.length - 1];
    const top = Math.ceil(maxMin / step) * step;
    const ticks = [];
    for (let v = 0; v <= top; v += step) ticks.push(v * 60);
    return { ticks, max: top * 60 };
  }

  const act = (id) => vscode.postMessage({ type: 'action', id });

  // tooltip

  const tip = h('div', { id: 'tip', role: 'tooltip', hidden: true },
    h('div', { class: 'tip-title' }), h('div', { class: 'tip-value' }), h('div', { class: 'tip-note' }));
  document.body.append(tip);

  function showTip(t, x, y) {
    tip.children[0].textContent = t.title || '';
    tip.children[1].textContent = t.value || '';
    tip.children[2].textContent = t.note || '';
    tip.hidden = false;
    const w = tip.offsetWidth;
    const hh = tip.offsetHeight;
    let left = x + 14;
    let top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + hh > window.innerHeight - 8) top = y - hh - 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  app.addEventListener('pointermove', (e) => {
    const el = e.target instanceof Element ? e.target.closest('.mark') : null;
    if (el && el._tip) showTip(el._tip, e.clientX, e.clientY);
    else hideTip();
  });
  app.addEventListener('pointerleave', hideTip);

  /** Arrow keys walk the marks of a chart and show the same tooltip as hover. */
  function makeNavigable(box, label) {
    box.tabIndex = 0;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', label + '. Use the arrow keys to move between values, or switch to the Tables view.');
    let idx = -1;
    box.addEventListener('keydown', (e) => {
      const marks = Array.from(box.querySelectorAll('.mark'));
      if (!marks.length) return;
      const stepX = Number(box.dataset.stepx || 1);
      const moves = { ArrowRight: stepX, ArrowLeft: -stepX, ArrowDown: 1, ArrowUp: -1 };
      if (e.key === 'Escape') { hideTip(); return; }
      let next;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = marks.length - 1;
      else if (e.key in moves) next = (idx < 0 ? (moves[e.key] > 0 ? 0 : marks.length - 1) : idx + moves[e.key]);
      else return;
      e.preventDefault();
      idx = Math.max(0, Math.min(marks.length - 1, next));
      marks.forEach((m, i) => m.classList.toggle('active', i === idx));
      const r = marks[idx].getBoundingClientRect();
      if (marks[idx]._tip) showTip(marks[idx]._tip, r.left + r.width / 2, r.top);
    });
    box.addEventListener('blur', () => {
      hideTip();
      box.querySelectorAll('.mark.active').forEach((m) => m.classList.remove('active'));
      idx = -1;
    });
  }

  // pieces

  function segmented(label, options, current, onPick) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': label },
      options.map(([id, text]) => h('button', {
        type: 'button', class: id === current ? 'on' : '', 'aria-pressed': String(id === current), onclick: () => onPick(id),
      }, text)));
  }

  function table(headers, rows) {
    return h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, headers.map((t, i) => h('th', { class: i > 0 ? 'num' : '' }, t)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: i > 0 ? 'num' : '' }, c))))));
  }

  /** A chart card: title, subtitle and a box that drawAll() fills in. */
  function chartCard(title, subtitle, entry, { wide = false, scroll = false, cls = '' } = {}) {
    const box = h('div', { class: 'chart-box' + (scroll ? ' scroll' : '') });
    if (entry.stepx) box.dataset.stepx = String(entry.stepx);
    if (entry.nav) makeNavigable(box, title);
    charts.push({ box, draw: entry.draw, table: entry.table });
    return h('section', { class: 'card chart-card ' + cls + (wide ? ' wide' : '') },
      h('h2', null, title), h('p', { class: 'subtitle' }, subtitle || ''), box);
  }

  /** Vertical bars. items = [{ value, label, tip }]. Bars are at most 24px wide. */
  function columnChart(width, { items, ariaLabel, height = 190, labelEvery = 0, labelW = 46, goal = 0 }) {
    const m = { l: 46, r: 10, t: 20, b: 24 };
    const max = Math.max(0, ...items.map((i) => i.value), goal);
    const scale = niceScale(max);
    const plotW = Math.max(40, width - m.l - m.r);
    const plotH = height - m.t - m.b;
    const band = plotW / items.length;
    const barW = Math.max(1, Math.min(24, band - 2));
    const y = (v) => m.t + plotH - (v / scale.max) * plotH;

    const svg = h('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel });
    for (const t of scale.ticks) {
      svg.append(
        h('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.l, x2: width - m.r, y1: y(t), y2: y(t) }),
        h('text', { class: 'axis', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, t === 0 ? '0' : dur(t)));
    }

    const stride = labelEvery || Math.max(1, Math.ceil(labelW / band));
    let peak = -1;
    items.forEach((it, i) => { if (it.value > 0 && (peak < 0 || it.value > items[peak].value)) peak = i; });

    items.forEach((it, i) => {
      const x = m.l + i * band;
      const bx = x + (band - barW) / 2;
      const bh = it.value > 0 ? Math.max(2, plotH - (y(it.value) - m.t)) : 0;
      const g = h('g', { class: 'mark', tip: it.tip }, h('rect', { class: 'hit', x, y: m.t, width: band, height: plotH }));
      if (bh > 0) {
        const r = Math.min(4, barW / 2, bh);
        const top = m.t + plotH - bh;
        g.append(h('path', {
          class: 'bar',
          d: `M${bx},${top + bh}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + barW - r}Q${bx + barW},${top} ${bx + barW},${top + r}V${top + bh}Z`,
        }));
      }
      svg.append(g);
      if (it.label && i % stride === 0 && x + band / 2 + labelW / 2 <= width) {
        svg.append(h('text', { class: 'axis', x: x + band / 2, y: height - 6, 'text-anchor': 'middle' }, it.label));
      }
    });

    // Only the highest bar gets a label.
    if (peak >= 0 && band >= 14) {
      const cx = Math.min(width - m.r - 22, Math.max(m.l + 22, m.l + peak * band + band / 2));
      svg.append(h('text', { class: 'value-label', x: cx, y: y(items[peak].value) - 6, 'text-anchor': 'middle' }, dur(items[peak].value)));
    }
    if (goal > 0) {
      svg.append(
        h('line', { class: 'goal-line', x1: m.l, x2: width - m.r, y1: y(goal), y2: y(goal) }),
        h('text', { class: 'axis', x: width - m.r, y: y(goal) - 4, 'text-anchor': 'end' }, 'Goal ' + dur(goal)));
    }
    return svg;
  }

  // sections

  function header() {
    const st = data.tracking;
    const label = st === 'active' ? 'Tracking now' : st === 'paused' ? 'Paused' : 'Idle';
    return h('header', { class: 'head' },
      h('h1', null, 'TimeCount'),
      h('span', { class: 'pill ' + st }, h('span', { class: 'dot', 'aria-hidden': 'true' }), label),
      h('span', { class: 'spacer' }),
      segmented('View', [['charts', 'Charts'], ['tables', 'Tables']], ui.view, (v) => { ui.view = v; persist(); render(); }),
      h('button', { type: 'button', class: 'btn', onclick: () => act('togglePause') }, st === 'paused' ? 'Resume tracking' : 'Pause tracking'));
  }

  function heroCard() {
    const s = data.summary;
    const kids = [h('div', { class: 'label' }, 'Today'), h('div', { class: 'hero-value' }, dur(s.today))];
    if (s.avgPrior > 0) {
      const diff = s.today - s.avgPrior;
      kids.push(h('div', { class: 'sub' }, Math.abs(diff) < 60
        ? 'About your usual ' + dur(s.avgPrior)
        : signed(diff) + ' vs your usual ' + dur(s.avgPrior)));
    } else if (s.total === 0) {
      kids.push(h('div', { class: 'sub' }, 'Nothing tracked yet.'));
    }
    if (s.sessionsToday > 0) {
      kids.push(h('div', { class: 'sub' },
        s.sessionsToday + (s.sessionsToday === 1 ? ' session' : ' sessions') + ' · longest ' + dur(s.longestToday)
        + (s.currentSession > 0 ? ' · current ' + dur(s.currentSession) : '')));
    }
    if (s.goalSec > 0) {
      const done = s.goalPct >= 1;
      const fill = h('div', { class: 'fill' });
      fill.style.setProperty('width', Math.min(100, s.goalPct * 100) + '%');
      kids.push(
        h('div', {
          class: 'meter' + (done ? ' done' : ''), role: 'progressbar', 'aria-label': 'Daily goal',
          'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, Math.round(s.goalPct * 100)),
        }, fill),
        h('div', { class: 'sub' }, done
          ? '✓ Daily goal of ' + dur(s.goalSec) + ' reached'
          : Math.round(s.goalPct * 100) + '% of your ' + dur(s.goalSec) + ' goal'));
    }
    return h('section', { class: 'card' }, ...kids);
  }

  function sessionsCard() {
    const list = data.todaySessions;
    const card = h('section', { class: 'card' }, h('h2', null, "Today's sessions"));
    if (!list.length) {
      card.append(h('p', { class: 'subtitle' }, ''), h('p', { class: 'empty' }, 'No activity yet today.'));
      return card;
    }
    card.append(h('p', { class: 'subtitle' }, 'Sessions are separated by breaks of 15 minutes or more.'));
    const box = h('div', { class: 'chart-box' });
    makeNavigable(box, "Today's sessions");
    card.append(box);
    charts.push({
      box,
      draw: (w) => h('div', null, timeline(w, list), sessionList(list)),
      table: () => table(['Session', 'Active'], list.map((s) => [fmtClock(s[0]) + ' to ' + fmtClock(s[1]), dur(s[2])])),
    });
    return card;
  }

  /** A 24-hour lane with one bar per session. */
  function timeline(width, list) {
    const m = { l: 6, r: 6 };
    const plotW = width - m.l - m.r;
    const svg = h('svg', { width, height: 50, viewBox: `0 0 ${width} 50`, role: 'img', 'aria-label': "Today's sessions on a 24-hour timeline" });
    svg.append(h('rect', { class: 'lane', x: m.l, y: 8, width: plotW, height: 16, rx: 4 }));
    for (const hr of [0, 6, 12, 18, 24]) {
      const x = m.l + (hr / 24) * plotW;
      svg.append(h('text', { class: 'axis', x, y: 44, 'text-anchor': hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle' }, pad2(hr) + ':00'));
    }
    for (const s of list) {
      const start = Math.max(0, s[0] - data.dayStart);
      const end = Math.min(86400, s[1] - data.dayStart);
      const x = m.l + (start / 86400) * plotW;
      const w = Math.max(3, ((end - start) / 86400) * plotW);
      svg.append(h('g', {
        class: 'mark',
        tip: { title: fmtClock(s[0]) + ' to ' + fmtClock(s[1]), value: dur(s[2]) + ' active', note: '' },
      }, h('rect', { class: 'seg-bar', x, y: 8, width: w, height: 16, rx: 3 })));
    }
    return svg;
  }

  function sessionList(list) {
    const recent = list.slice(-4).reverse();
    return h('ul', { class: 'sessions' },
      recent.map((s) => h('li', null, h('span', null, fmtClock(s[0]) + ' to ' + fmtClock(s[1])), h('b', null, dur(s[2])))),
      list.length > recent.length ? h('li', null, h('span', null, '+ ' + (list.length - recent.length) + ' earlier')) : null);
  }

  function tiles() {
    const s = data.summary;
    const delta = (cur, prev, what) => {
      if (prev <= 0) return cur > 0 ? 'Nothing tracked on ' + what : null;
      return Math.abs(cur - prev) < 60 ? 'No change vs ' + what : signed(cur - prev) + ' vs ' + what;
    };
    const tile = (label, value, sub) => h('div', { class: 'card tile' },
      h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
    const ls = data.longestSession;
    return [
      tile('Yesterday', dur(s.yesterday)),
      tile('This week', dur(s.week), delta(s.week, s.weekPrev, 'the same days last week')),
      tile('This month', dur(s.month), delta(s.month, s.monthPrev, 'the same days last month')),
      tile('This year', dur(s.year)),
      tile('All time', dur(s.total), s.firstKey ? 'Since ' + fmtDate(s.firstKey, { month: 'short', day: 'numeric', year: 'numeric' }) : null),
      tile('Daily average', dur(s.avg), s.activeDays + (s.activeDays === 1 ? ' active day' : ' active days')),
      tile('Average session', dur(data.avgSession)),
      tile('Best day', s.bestDay ? dur(s.bestDay.sec) : 'n/a', s.bestDay ? fmtDate(s.bestDay.key, { month: 'short', day: 'numeric', year: 'numeric' }) : null),
      tile('Longest session', ls ? dur(ls.sec) : 'n/a', ls ? fmtDate(ls.key, { month: 'short', day: 'numeric' }) + ' · ' + fmtClock(ls.start) : null),
      tile('Current streak', s.streak.current + (s.streak.current === 1 ? ' day' : ' days'), 'Best: ' + s.streak.longest + (s.streak.longest === 1 ? ' day' : ' days')),
    ];
  }

  function heatmapCard() {
    const total = data.months.reduce((a, m) => a + m.s, 0);
    const card = chartCard('Last 12 months', dur(total) + ' tracked · more color means more time', {
      nav: true, stepx: 7, draw: heatmap,
      table: () => table(['Month', 'Time', 'Active days'], data.months.map((m) => [fmtDate(m.k, { month: 'long', year: 'numeric' }), dur(m.s), String(m.d)])),
    }, { scroll: true, cls: 'heat-card' });
    return card;
  }

  function heatmap(width) {
    const { start, values } = data.heat;
    const cols = Math.ceil(values.length / 7);
    const left = 30;
    const top = 18;
    const pitch = Math.max(11, Math.min(18, (width - left) / cols));
    const cell = pitch - 2;
    const svg = h('svg', {
      width: left + cols * pitch, height: top + 7 * pitch + 26, role: 'img',
      viewBox: `0 0 ${left + cols * pitch} ${top + 7 * pitch + 26}`, 'aria-label': 'Calendar heatmap of the last 12 months',
    });

    // Levels are quartiles of your active days once there are enough of them, otherwise
    // a share of your best day.
    const active = values.filter((v) => v > 0).sort((a, b) => a - b);
    const best = active[active.length - 1] || 1;
    const q = (p) => active[Math.min(active.length - 1, Math.floor(p * active.length))];
    const [t1, t2, t3] = active.length >= 8 ? [q(0.25), q(0.5), q(0.75)] : [best * 0.25, best * 0.5, best * 0.75];
    const level = (v) => (v <= 0 ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4);

    // Label Monday, Wednesday and Friday, wherever the week starts.
    for (const wd of [1, 3, 5]) {
      const row = (wd - data.weekStartsOn + 7) % 7;
      svg.append(h('text', { class: 'axis', x: left - 6, y: top + row * pitch + cell - 2, 'text-anchor': 'end' }, weekdayName(wd, 'short')));
    }
    let lastMonth = -1;
    let lastCol = -9;
    for (let c = 0; c < cols; c++) {
      const month = dateOf(addDaysKey(start, c * 7)).getMonth();
      if (month !== lastMonth && c - lastCol >= 3) {
        svg.append(h('text', { class: 'axis', x: left + c * pitch, y: 10 }, fmtDate(addDaysKey(start, c * 7), { month: 'short' })));
        lastCol = c;
      }
      lastMonth = month;
    }

    values.forEach((v, i) => {
      const key = addDaysKey(start, i);
      const c = Math.floor(i / 7);
      const r = i % 7;
      svg.append(h('g', {
        class: 'mark',
        tip: { title: fmtDate(key, FULL_DATE), value: v > 0 ? dur(v) : 'No activity', note: '' },
      }, h('rect', { class: 'cell l' + level(v), x: left + c * pitch, y: top + r * pitch, width: cell, height: cell, rx: 2, 'pointer-events': 'all' })));
    });

    // Scale legend
    const ly = top + 7 * pitch + 10;
    const lx = left + cols * pitch;
    svg.append(h('text', { class: 'axis', x: lx - 5 * (cell + 3) - 32, y: ly + cell - 2, 'text-anchor': 'end' }, 'Less'));
    for (let l = 0; l <= 4; l++) svg.append(h('rect', { class: 'cell l' + l, x: lx - (5 - l) * (cell + 3) - 26, y: ly, width: cell, height: cell, rx: 2 }));
    svg.append(h('text', { class: 'axis', x: lx - 22 + 4, y: ly + cell - 2 }, 'More'));
    return svg;
  }

  function filterBar(r) {
    const crossesYear = r.from.slice(0, 4) !== r.to.slice(0, 4);
    const span = fmtDate(r.from, crossesYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })
      + ' to ' + fmtDate(r.to, { month: 'short', day: 'numeric', year: 'numeric' });
    return h('div', { class: 'filters' },
      h('span', { class: 'filters-label' }, 'Range'),
      segmented('Date range', RANGES, ui.range, (id) => { ui.range = id; persist(); render(); }),
      h('span', { class: 'filters-note' }, span + ' · ' + dur(r.total) + ' · ' + r.activeDays + (r.activeDays === 1 ? ' active day' : ' active days')));
  }

  function timeCard(r) {
    const unit = r.bucket;
    const last = r.points.length - 1;
    const items = r.points.map((p, i) => {
      let title;
      let label;
      if (unit === 'day') {
        title = fmtDate(p.k, FULL_DATE);
        label = fmtDate(p.k, r.points.length <= 8 ? { weekday: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
      } else if (unit === 'week') {
        title = 'Week of ' + fmtDate(p.k, { month: 'short', day: 'numeric', year: 'numeric' });
        label = fmtDate(p.k, { month: 'short', day: 'numeric' });
      } else {
        title = fmtDate(p.k, { month: 'long', year: 'numeric' });
        label = fmtDate(p.k, { month: 'short' }) + (i === 0 || p.k.slice(5, 7) === '01' ? ' ' + p.k.slice(0, 4) : '');
      }
      const goalNote = unit === 'day' && data.summary.goalSec > 0
        ? (p.s >= data.summary.goalSec ? '✓ Goal reached' : pct(p.s, data.summary.goalSec) + '% of goal') : '';
      const note = i === last ? (goalNote ? 'In progress · ' + goalNote : 'In progress') : goalNote;
      return { value: p.s, label, tip: { title, value: dur(p.s), note }, title };
    });
    const name = { day: 'Time per day', week: 'Time per week', month: 'Time per month' }[unit];
    const avg = r.activeDays > 0 ? ' · ' + dur(r.total / r.activeDays) + ' per active day' : '';
    return chartCard(name, dur(r.total) + ' total' + avg, {
      nav: true,
      draw: (w) => columnChart(w, { items, ariaLabel: name, goal: unit === 'day' ? data.summary.goalSec : 0, labelW: unit === 'month' ? 62 : 46 }),
      table: () => table([unit === 'day' ? 'Day' : unit === 'week' ? 'Week starting' : 'Month', 'Time'], items.slice().reverse().map((i) => [i.title, dur(i.value)])),
    }, { wide: true });
  }

  function hoursCard(r) {
    const total = r.hours.reduce((a, b) => a + b, 0);
    const peak = r.hours.indexOf(Math.max(...r.hours));
    const items = r.hours.map((v, hr) => ({
      value: v, label: pad2(hr),
      tip: { title: pad2(hr) + ':00 to ' + pad2((hr + 1) % 24) + ':00', value: dur(v), note: pct(v, total) + '% of the total' },
    }));
    return chartCard('Time of day', total > 0 ? 'Most active around ' + pad2(peak) + ':00' : 'When during the day you work', {
      nav: true,
      draw: (w) => columnChart(w, { items, ariaLabel: 'Time tracked by hour of day', labelEvery: 3, labelW: 20, height: 170 }),
      table: () => table(['Hour', 'Time', 'Share'], items.map((i, hr) => [pad2(hr) + ':00', dur(i.value), pct(i.value, total) + '%'])),
    });
  }

  function weekdayCard(r) {
    const order = Array.from({ length: 7 }, (_, i) => (data.weekStartsOn + i) % 7);
    const items = order.map((wd) => {
      const n = r.weekdayCounts[wd];
      const avg = n > 0 ? r.weekdayTotals[wd] / n : 0;
      return {
        value: avg, label: weekdayName(wd, 'short'),
        tip: { title: weekdayName(wd, 'long') + (n === 1 ? '' : 's'), value: dur(avg) + ' on average', note: dur(r.weekdayTotals[wd]) + ' across ' + n + (n === 1 ? ' day' : ' days') },
      };
    });
    return chartCard('Day of week', 'Average per day, counting days off', {
      nav: true,
      draw: (w) => columnChart(w, { items, ariaLabel: 'Average time by day of the week', labelW: 30, height: 170 }),
      table: () => table(['Day', 'Average', 'Total'], order.map((wd, i) => [weekdayName(wd, 'long'), dur(items[i].value), dur(r.weekdayTotals[wd])])),
    });
  }

  function listCard(title, subtitle, rows, total) {
    const name = (row) => (row.other ? 'Other (' + row.other + ' more)' : row.name);
    return chartCard(title, subtitle, {
      draw: () => {
        if (!rows.length) return h('p', { class: 'empty' }, 'Nothing tracked in this range yet.');
        const max = Math.max(...rows.map((r) => r.sec));
        return h('ul', { class: 'rows' }, rows.map((row) => {
          const fill = h('span', { class: 'fill' });
          fill.style.setProperty('width', Math.max(1, (row.sec / max) * 100) + '%');
          return h('li', { class: row.other ? 'other' : '' },
            h('span', { class: 'name', title: name(row) }, name(row)),
            h('span', { class: 'track' }, fill),
            h('span', { class: 'time' }, dur(row.sec)),
            h('span', { class: 'share' }, pct(row.sec, total) + '%'));
        }));
      },
      table: () => table([title.slice(0, -1) === 'Language' ? 'Language' : 'Project', 'Time', 'Share'], rows.map((row) => [name(row), dur(row.sec), pct(row.sec, total) + '%'])),
    });
  }

  function footer() {
    const btn = (text, id, cls) => h('button', { type: 'button', class: 'btn ' + (cls || ''), onclick: () => act(id) }, text);
    return h('footer', { class: 'foot' },
      h('p', null, 'All data stays on this computer.'),
      h('p', null, 'Data folder: ', h('code', null, data.dataDir)),
      h('div', { class: 'actions' },
        btn('Open data folder', 'openDataFolder'), btn('Export CSV', 'exportCsv'), btn('Export JSON', 'exportJson'), btn('Reset all data…', 'resetData', 'danger')));
  }

  // rendering

  function persist() { vscode.setState({ view: ui.view, range: ui.range }); }

  function render() {
    if (!data) return;
    hideTip();
    charts = [];
    const r = data.ranges[ui.range];
    const scrollY = window.scrollY;
    app.replaceChildren(
      header(),
      h('div', { class: 'top' }, heroCard(), sessionsCard()),
      h('div', { class: 'tiles' }, ...tiles()),
      heatmapCard(),
      filterBar(r),
      h('div', { class: 'grid' },
        timeCard(r),
        hoursCard(r),
        weekdayCard(r),
        listCard('Projects', 'By workspace folder', r.projects, r.total),
        listCard('Languages', 'By the language of the open file', r.languages, r.total)),
      footer());
    drawAll();
    window.scrollTo(0, scrollY);
  }

  function drawAll() {
    drawnWidth = app.clientWidth;
    for (const c of charts) {
      const w = Math.max(220, Math.floor(c.box.clientWidth));
      c.box.replaceChildren(ui.view === 'tables' ? c.table() : c.draw(w));
    }
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || msg.type !== 'data' || !msg.data) return;
    // Skip the redraw when nothing but the clock moved, so hover and focus survive.
    const key = JSON.stringify(Object.assign({}, msg.data, { now: 0 }));
    if (key === lastKey) return;
    lastKey = key;
    data = msg.data;
    render();
  });

  let resizeTimer = 0;
  new ResizeObserver(() => {
    if (!charts.length || app.clientWidth === drawnWidth) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawAll, 100);
  }).observe(app);

  vscode.postMessage({ type: 'ready' });
})();
