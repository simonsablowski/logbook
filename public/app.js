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
const TYPES = ['feature', 'change', 'content', 'bug', 'chore', 'docs', 'idea'];
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

// Markdown subset: "## Heading" sections, paragraphs and lists ("- item", "1. item"; "*" and "+" are
// shown as bullets too). Empty and placeholder sections are skipped.
const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+(.*)$/;

function paragraphs(text) {
  const html = [];
  let paragraph = [];
  let list = null; // { tag, items }

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(esc).join(' ')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag} class="list">${list.items.map((item) => `<li>${esc(item)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of text.split('\n')) {
    const item = line.match(LIST_ITEM);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (item) {
      flushParagraph();
      const tag = /\d/.test(item[1]) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(item[2]);
    } else if (list && /^\s/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join('');
}

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

const state = { view: 'board', project: '', ticket: '', editing: false, creating: false };

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

// Session and saving -------------------------------------------------
// Viewing is public. Changing tickets needs a sign-in through Cloudflare Access, which only
// protects the /api/tickets paths; the session check below tells whether this browser has one.

let user = ''; // signed-in editor, empty when only viewing

const rememberEditor = (on) => {
  try {
    if (on) localStorage.setItem('logbook-editor', '1');
    else localStorage.removeItem('logbook-editor');
  } catch {}
};

// Visitors who never signed in are not sent to Access at all.
async function checkSession() {
  let remembered = false;
  try {
    remembered = localStorage.getItem('logbook-editor') === '1';
  } catch {}
  if (!remembered) return;
  try {
    const response = await fetch('api/tickets/session', { redirect: 'manual' });
    user = response.ok ? (await response.json()).user : '';
  } catch {
    user = '';
  }
  if (!user) rememberEditor(false);
}

const initials = (name) => {
  const local = name.split('@')[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  return ((parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2)) || '?').toUpperCase();
};

function updateSessionBar() {
  $('signin').hidden = Boolean(user);
  $('account').hidden = !user;
  $('avatar').textContent = initials(user);
  $('avatar').title = user;
  $('avatar').setAttribute('aria-label', `Account of ${user}`);
  $('who').textContent = user;
  if (!user) closeAccountMenu();
}

function closeAccountMenu() {
  $('account-menu').hidden = true;
  $('avatar').setAttribute('aria-expanded', 'false');
}

function toggleAccountMenu() {
  const open = $('account-menu').hidden;
  $('account-menu').hidden = !open;
  $('avatar').setAttribute('aria-expanded', String(open));
}

function startCreating() {
  state.creating = true;
  state.editing = false;
  state.ticket = '';
  render();
  $('edit-form').querySelector('[name=project]').focus();
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 5000);
}

// Sends a change to the API. Resolves to { result } on success or { error } with a message to show.
async function send(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: 'Could not reach the server.' };
  }
  if (response.type === 'opaqueredirect' || response.status === 401) {
    user = '';
    rememberEditor(false);
    updateSessionBar();
    return { error: 'Your session has expired. Sign in again to save.' };
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { error: result.error || `Saving failed (${response.status})` };
  return { result };
}

// Applies a change to a ticket. Returns an error message, or '' on success.
async function saveTicket(id, patch) {
  const { error, result } = await send('PATCH', `api/tickets/${id}`, patch);
  if (error) return error;
  Object.assign(tickets.find((t) => t.id === id), result);
  return '';
}

// Creates a ticket. Resolves to { ticket } or { error }.
async function createTicket(input) {
  const { error, result } = await send('POST', 'api/tickets', input);
  if (error) return { error };
  tickets.push(result);
  return { ticket: result };
}

async function moveTicket(id, status) {
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket || ticket.status === status) return;
  const patch = { status };
  if (status !== 'completed' && !ticket.priority) patch.priority = 'later';
  const error = await saveTicket(id, patch);
  if (error) toast(error);
  render();
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
  <div class="card${ticket.id === state.ticket ? ' selected' : ''}" data-id="${ticket.id}" role="button" tabindex="0"${user ? ' draggable="true"' : ''}>
    <div class="id">${ticket.id}</div>
    <div class="card-title" title="${esc(ticket.title)}">${esc(ticket.title)}</div>
    <div class="meta">${ticket.completed ? fact('date', 'Completed', formatDate(ticket.completed)) : priorityFact(ticket.priority)}<span class="spacer"></span>${effortFact(ticket)}</div>
  </div>`;

const options = (items, selected, none) =>
  (none ? [`<option value=""${selected ? '' : ' selected'}>${none}</option>`] : [])
    .concat(items.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`))
    .join('');

const blankTicket = () => ({ project: state.project, title: '', status: 'idea', priority: 'later', effort: null, type: 'feature', body: '## Summary\n\n' });

const editForm = (ticket, creating = false) => `
  <form id="edit-form" class="edit" novalidate>
    ${creating ? `<label>Project<select name="project">${options(projects.map((p) => [p.prefix, `${p.prefix} · ${p.name}`]), ticket.project, 'Choose a project')}</select></label>` : ''}
    <label>Title<input name="title" value="${esc(ticket.title)}" placeholder="Add footer newsletter form"></label>
    <div class="edit-row">
      <label>Status<select name="status">${options(COLUMNS, ticket.status)}</select></label>
      <label>Priority<select name="priority">${options(Object.entries(PRIORITY_LABEL), ticket.priority, 'None')}</select></label>
      <label>Effort<select name="effort">${options(Object.entries(EFFORT_LABEL), ticket.effort, 'None')}</select></label>
      <label>Type<select name="type">${options(TYPES.map((t) => [t, capitalize(t)]), ticket.type)}</select></label>
    </div>
    <label>Text (Markdown, sections start with ##)<textarea name="body" rows="14">${esc(ticket.body)}</textarea></label>
    <p id="edit-error" class="edit-error" role="alert" hidden></p>
    <div class="edit-actions"><button type="submit" class="primary">${creating ? 'Create' : 'Save'}</button><button type="button" id="cancel-edit">Cancel</button></div>
  </form>`;

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
  // New tickets start as ideas, so the button to create one sits in the Idea column.
  const add = status === 'idea' && user ? '<button class="add" type="button" title="New ticket" aria-label="New ticket">+</button>' : '';
  return `
  <section class="column${limitClass}" data-status="${status}">
    <h2 class="heading"><span>${label}</span><span class="col-end">${add}${count}</span></h2>
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
  const creating = state.creating && Boolean(user);
  const ticket = creating ? blankTicket() : tickets.find((t) => t.id === state.ticket);
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

  const repo = creating ? '' : projectOf(ticket).repo;
  const commits = (ticket.commits || [])
    .map((c) => `<li><a class="sha" href="https://github.com/${esc(repo)}/commit/${esc(c.sha)}" target="_blank" rel="noopener">${esc(c.sha)}</a><span>${esc(c.subject)}</span></li>`)
    .join('');

  const editing = creating || (state.editing && Boolean(user));
  const heading = creating
    ? '<div class="id">New ticket</div><h2>Create a ticket</h2>'
    : `<div class="id">${ticket.id}</div><h2>${esc(ticket.title)}</h2>`;
  $('detail').innerHTML = `
  <div class="panel">
    <div class="panel-top">
      <div>${heading}</div>
      <div class="panel-actions">
        ${user && !editing ? '<button id="edit">Edit</button>' : ''}
        <button id="close" aria-label="Close">Close</button>
      </div>
    </div>
    ${editing
      ? editForm(ticket, creating)
      : `<div class="facts">${facts}</div>
    ${renderBody(ticket.body)}
    ${commits ? `<h4 class="heading">Commits</h4><ul class="commits">${commits}</ul>` : ''}`}
  </div>`;
  $('close').onclick = closeDetail;
  if ($('edit')) {
    $('edit').onclick = () => {
      state.editing = true;
      render();
      $('edit-form').querySelector('[name=title]').focus();
    };
  }
  if (editing) bindEditForm(ticket, creating);
}

function bindEditForm(ticket, creating) {
  const showError = (message) => {
    $('edit-error').textContent = message;
    $('edit-error').hidden = false;
  };
  $('cancel-edit').onclick = () => {
    state.editing = false;
    state.creating = false;
    render();
  };
  $('edit-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const fields = {
      title: form.get('title').trim(),
      status: form.get('status'),
      priority: form.get('priority') || null,
      effort: form.get('effort') || null,
      type: form.get('type'),
      body: form.get('body').replace(/\r\n/g, '\n').trim(),
    };
    if (creating && !form.get('project')) return showError('Choose a project.');
    if (!fields.title) return showError('Enter a title.');
    if (fields.status !== 'completed' && !fields.priority) return showError('Choose a priority for tickets that are not completed.');

    const submit = event.target.querySelector('[type=submit]');
    submit.disabled = true;
    const outcome = creating
      ? await createTicket({ project: form.get('project'), ...fields })
      : { error: await saveTicket(ticket.id, fields) };
    if (outcome.error) {
      submit.disabled = false;
      return showError(outcome.error);
    }
    if (creating) state.ticket = outcome.ticket.id;
    state.editing = false;
    state.creating = false;
    render();
  };
}

function closeDetail() {
  if (!state.ticket && !state.creating) return;
  state.ticket = '';
  state.editing = false;
  state.creating = false;
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
    const open = () => {
      state.ticket = el.dataset.id;
      state.editing = false;
      state.creating = false;
      render();
      $('close').focus();
    };
    el.onclick = open;
    el.onkeydown = (event) => {
      if (event.target !== el || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      open();
    };
  }
  document.body.classList.toggle('board-view', state.view === 'board');
  if (state.view === 'board') fitBoard();
  updateSessionBar();
  renderDetail();
  writeHash();
}

// Cards can be dragged to another column to change their status, once signed in.
function setupDragAndDrop() {
  const view = $('view');
  let dragged = '';
  const clearDropTargets = () => view.querySelectorAll('.drop, .dragging').forEach((el) => el.classList.remove('drop', 'dragging'));

  view.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.('.card');
    if (!card || !user) return event.preventDefault();
    dragged = card.dataset.id;
    event.dataTransfer.setData('text/plain', dragged);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  view.addEventListener('dragover', (event) => {
    const column = event.target.closest?.('.column');
    if (!column || !dragged) return;
    event.preventDefault();
    view.querySelectorAll('.drop').forEach((el) => el !== column && el.classList.remove('drop'));
    column.classList.add('drop');
  });
  view.addEventListener('drop', (event) => {
    const column = event.target.closest?.('.column');
    if (!column || !dragged) return;
    event.preventDefault();
    const id = dragged;
    dragged = '';
    clearDropTargets();
    moveTicket(id, column.dataset.status);
  });
  view.addEventListener('dragend', () => {
    dragged = '';
    clearDropTargets();
  });
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

function cancelOrClose() {
  if (state.editing) {
    state.editing = false;
    render();
  } else {
    closeDetail();
  }
}

readHash();
setupTabs();
setupProjectFilter();
setupDragAndDrop();
$('signin').onclick = () => {
  rememberEditor(true);
  location.href = `api/tickets/login?next=${encodeURIComponent(location.hash)}`;
};
$('view').addEventListener('click', (event) => event.target.closest('.add') && startCreating());
$('avatar').onclick = toggleAccountMenu;
$('signout').onclick = () => {
  rememberEditor(false);
  location.href = `/cdn-cgi/access/logout?returnTo=${encodeURIComponent(`${location.origin}/`)}`;
};
document.addEventListener('click', (event) => !event.target.closest('#account') && closeAccountMenu());
$('backdrop').onclick = () => !state.editing && !state.creating && closeDetail();
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!$('account-menu').hidden) closeAccountMenu();
  else cancelOrClose();
});
window.addEventListener('resize', () => state.view === 'board' && requestAnimationFrame(fitBoard));
render();
checkSession().then(render);
document.fonts.ready.then(() => state.view === 'board' && fitBoard());
