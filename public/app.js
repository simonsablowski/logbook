// Data ---------------------------------------------------------------

let data;
try {
  const response = await fetch('api/data');
  if (!response.ok) throw new Error(`Loading the tickets failed (${response.status})`);
  data = await response.json();
} catch (error) {
  document.getElementById('view').innerHTML = '<div class="note empty">Could not load the tickets.</div>';
  throw error;
}
const { projects, tickets } = data;
const projectByPrefix = Object.fromEntries(projects.map((p) => [p.prefix, p]));
const projectOf = (ticket) => projectByPrefix[ticket.project];

const VIEWS = ['board', 'backlog', 'changelog'];
const COLUMNS = [
  ['idea', 'Idea'],
  ['planned', 'Planned'],
  ['in-progress', 'In progress'],
  ['completed', 'Completed'],
];
const STATUS_LABEL = Object.fromEntries(COLUMNS);
const WIP_LIMITS = { planned: 6, 'in-progress': 2 };
const PRIORITY_LABEL = { now: 'Now', next: 'Next', later: 'Later' };
const PRIORITY_RANK = { now: 0, next: 1, later: 2 };
const EFFORT_LABEL = { S: 'Small', M: 'Medium', L: 'Large' };
const EMPTY_TEXT = /^(not documented\.?|n\/a|tbd|-)?$/i;

const ICONS = {
  idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  planned: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  'in-progress': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  completed: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  type: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1"/>',
  effort: '<path d="M5 20v-6M12 20V9M19 20V4"/>',
  date: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
};

// Helpers ------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

const formatDate = (date) => {
  if (!date) return '';
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return date;
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const byPriority = (a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || a.id.localeCompare(b.id);
const byCompletion = (a, b) => b.completed.localeCompare(a.completed) || b.id.localeCompare(a.id);

const summaryOf = (ticket) => (ticket.body.split('## Summary')[1] || '').split('##')[0].trim();

// Markdown subset: "## Heading" sections and paragraphs. Empty and placeholder sections are skipped.
const paragraphs = (text) => text.split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`).join('');

function renderBody(body) {
  const [intro, ...sections] = body.split(/^## /m);
  let html = EMPTY_TEXT.test(intro.trim()) ? '' : paragraphs(intro.trim());
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const title = (newline < 0 ? section : section.slice(0, newline)).trim();
    const text = newline < 0 ? '' : section.slice(newline + 1).trim();
    if (!EMPTY_TEXT.test(text)) html += `<h4 class="heading">${esc(title)}</h4>${paragraphs(text)}`;
  }
  return html;
}

// View state, kept in the URL hash (#v=changelog&p=MTV&t=MTV-023) ------

const state = { view: 'board', project: '', ticket: '' };

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (VIEWS.includes(params.get('v'))) state.view = params.get('v');
  if (projectByPrefix[params.get('p')]) state.project = params.get('p');
  state.ticket = params.get('t') || '';
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.view !== 'board') params.set('v', state.view);
  if (state.project) params.set('p', state.project);
  if (state.ticket) params.set('t', state.ticket);
  history.replaceState(null, '', `#${params}`);
}

// Templates ----------------------------------------------------------

const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const fact = (iconName, label, text) =>
  `<span class="fact" title="${label}">${icon(iconName)}<span class="sr">${label}: </span>${esc(text)}</span>`;

const priorityDot = (priority) => (PRIORITY_LABEL[priority] ? `<span class="dot ${priority}" aria-hidden="true"></span>` : '');

const priorityFact = (priority) =>
  PRIORITY_LABEL[priority]
    ? `<span class="fact" title="Priority">${priorityDot(priority)}<span class="sr">Priority: </span>${PRIORITY_LABEL[priority]}</span>`
    : '';

const effortFact = (ticket) =>
  ticket.effort
    ? `<span class="fact" title="Effort: ${EFFORT_LABEL[ticket.effort]}">${icon('effort')}<span class="sr">Effort: ${EFFORT_LABEL[ticket.effort]}</span><span aria-hidden="true">${ticket.effort}</span></span>`
    : '';

const card = (ticket) => `
  <button class="card${ticket.id === state.ticket ? ' selected' : ''}" data-id="${ticket.id}">
    <div class="id">${ticket.id}</div>
    <div class="card-title">${esc(ticket.title)}</div>
    <div class="meta">${ticket.completed ? fact('date', 'Completed', formatDate(ticket.completed)) : priorityFact(ticket.priority)}<span class="spacer"></span>${effortFact(ticket)}</div>
  </button>`;

const backlogRow = (ticket) => `
  <button class="row" data-id="${ticket.id}">
    <span class="id">${ticket.id}</span>
    <span class="row-title">${esc(ticket.title)}</span>
    <span class="meta">${fact(ticket.status, 'Status', STATUS_LABEL[ticket.status])}${effortFact(ticket)}</span>
  </button>`;

const changelogEntry = (ticket) => {
  const summary = summaryOf(ticket);
  return `
  <button class="entry" data-id="${ticket.id}">
    <div class="entry-date">${formatDate(ticket.completed)}</div>
    <div>
      <div class="entry-title">${esc(ticket.title)}</div>
      ${EMPTY_TEXT.test(summary) ? '' : `<p>${esc(summary)}</p>`}
      <div class="meta"><span>${ticket.id}</span></div>
    </div>
  </button>`;
};

// Views --------------------------------------------------------------

function renderColumn([status, label], visible) {
  const limit = WIP_LIMITS[status];
  const total = tickets.filter((t) => t.status === status).length;
  const items = status === 'completed' ? visible.sort(byCompletion) : visible.sort(byPriority);
  const limitClass = limit && total > limit ? ' over-limit' : limit && total === limit ? ' at-limit' : '';
  const count = limit
    ? `<span class="limit" title="WIP limit ${limit}, counted across all projects">${total} / ${limit}</span>`
    : `<span>${items.length}</span>`;
  const overflowView = status === 'completed' ? 'changelog' : 'backlog';
  return `
  <section class="column${limitClass}">
    <h2 class="heading"><span>${label}</span>${count}</h2>
    <div class="cards">${items.map(card).join('') || '<div class="note">Empty</div>'}</div>
    <div class="note more" data-view-name="${overflowView}" hidden></div>
  </section>`;
}

// The board never scrolls: every column shows as many cards as fit and summarises the rest.
function fitBoard() {
  for (const column of document.querySelectorAll('.column')) {
    const cards = column.querySelector('.cards');
    const note = column.querySelector('.more');
    const items = [...cards.querySelectorAll('.card')];
    for (const item of items) item.hidden = false;
    note.hidden = true;
    if (cards.scrollHeight <= cards.clientHeight) continue;

    note.textContent = '+ 99 more';
    note.hidden = false;
    const room = cards.clientHeight;
    const bottoms = items.map((item) => item.offsetTop + item.offsetHeight);
    const hiddenCount = bottoms.filter((bottom) => bottom > room).length;
    items.slice(items.length - hiddenCount).forEach((item) => { item.hidden = true; });
    note.textContent = `+ ${hiddenCount} more in the ${note.dataset.viewName}`;
  }
}

const renderBoard = (visible) =>
  `<div class="board">${COLUMNS.map((column) => renderColumn(column, visible.filter((t) => t.status === column[0]))).join('')}</div>`;

const renderBacklog = (visible) =>
  Object.keys(PRIORITY_LABEL)
    .map((priority) => {
      const open = visible.filter((t) => t.priority === priority && t.status !== 'completed').sort(byPriority);
      return `
      <div class="group heading">${priorityDot(priority)} ${PRIORITY_LABEL[priority]} · ${open.length}</div>
      ${open.map(backlogRow).join('') || '<div class="note empty">Nothing open</div>'}`;
    })
    .join('');

const renderChangelog = (visible) =>
  visible.filter((t) => t.status === 'completed').sort(byCompletion).map(changelogEntry).join('') ||
  '<div class="note empty">Nothing completed yet.</div>';

const RENDERERS = { board: renderBoard, backlog: renderBacklog, changelog: renderChangelog };

// Detail drawer ------------------------------------------------------

function renderDetail() {
  const ticket = tickets.find((t) => t.id === state.ticket);
  $('detail').classList.toggle('open', Boolean(ticket));
  $('backdrop').classList.toggle('open', Boolean(ticket));
  if (!ticket) return;

  const facts = [
    fact(ticket.status, 'Status', STATUS_LABEL[ticket.status]),
    fact('type', 'Type', capitalize(ticket.type)),
    ticket.effort ? fact('effort', 'Effort', EFFORT_LABEL[ticket.effort]) : '',
    ticket.completed ? fact('date', 'Completed', formatDate(ticket.completed)) : '',
    priorityFact(ticket.priority),
  ].join('');

  const repo = projectOf(ticket).repo;
  const commits = ticket.commits
    .map((c) => `<li><a class="sha" href="https://github.com/${esc(repo)}/commit/${esc(c.sha)}" target="_blank" rel="noopener">${esc(c.sha)}</a><span>${esc(c.subject)}</span></li>`)
    .join('');

  $('detail').innerHTML = `
  <div class="panel">
    <div class="panel-top">
      <div><div class="id">${ticket.id}</div><h2>${esc(ticket.title)}</h2></div>
      <button id="close" aria-label="Close ticket">Close</button>
    </div>
    <div class="facts">${facts}</div>
    ${renderBody(ticket.body)}
    ${commits ? `<h4 class="heading">Commits</h4><ul class="commits">${commits}</ul>` : ''}
  </div>`;
  $('close').onclick = closeDetail;
}

function closeDetail() {
  if (!state.ticket) return;
  state.ticket = '';
  render();
}

// Rendering and events -----------------------------------------------

function render() {
  for (const tab of document.querySelectorAll('.tab')) {
    const selected = tab.dataset.view === state.view;
    tab.setAttribute('aria-selected', selected);
    tab.tabIndex = selected ? 0 : -1;
  }
  $('view').setAttribute('aria-labelledby', `tab-${state.view}`);
  $('view').innerHTML = RENDERERS[state.view](tickets.filter((t) => !state.project || t.project === state.project));
  for (const el of $('view').querySelectorAll('[data-id]')) {
    el.onclick = () => {
      state.ticket = el.dataset.id;
      render();
      $('close').focus();
    };
  }
  document.body.classList.toggle('board-view', state.view === 'board');
  if (state.view === 'board') fitBoard();
  renderDetail();
  writeHash();
}

function setupTabs() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.onclick = () => {
      state.view = tab.dataset.view;
      render();
    };
    tab.onkeydown = (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      state.view = VIEWS[(VIEWS.indexOf(state.view) + step + VIEWS.length) % VIEWS.length];
      render();
      $(`tab-${state.view}`).focus();
    };
  }
}

function setupProjectFilter() {
  const select = $('project');
  select.innerHTML =
    '<option value="">All projects</option>' +
    projects.map((p) => `<option value="${p.prefix}">${p.prefix} · ${esc(p.name)}</option>`).join('');
  select.value = state.project;
  select.onchange = () => {
    state.project = select.value;
    render();
  };
}

readHash();
setupTabs();
setupProjectFilter();
$('backdrop').onclick = closeDetail;
document.addEventListener('keydown', (event) => event.key === 'Escape' && closeDetail());
window.addEventListener('resize', () => state.view === 'board' && requestAnimationFrame(fitBoard));
render();
document.fonts.ready.then(() => state.view === 'board' && fitBoard());
