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
const { projects, tickets, colours } = data;
const projectByPrefix = Object.fromEntries(projects.map((p) => [p.prefix, p]));
const projectOf = (ticket) => projectByPrefix[ticket.project];

const VIEWS = ['projects', 'board', 'backlog', 'changelog'];
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
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
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
// Newest first by the time of completion; tickets that only know their day come after the timed ones of that day.
const completionKey = (ticket) => ticket.completedAt || `${ticket.completed}T00:00:00.000Z`;
const byCompletion = (a, b) => completionKey(b).localeCompare(completionKey(a)) || b.id.localeCompare(a.id);

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

const state = { view: 'board', project: '', ticket: '', editing: false, creating: false, projectForm: null };

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

// The colour of the project of a ticket, as the custom property that tints cards and changelog entries.
const tintStyle = (ticket) => (projectOf(ticket).color ? ` style="--tint:${projectOf(ticket).color}"` : '');

const card = (ticket) => `
  <div class="card${ticket.id === state.ticket ? ' selected' : ''}" data-id="${ticket.id}" role="button" tabindex="0"${user ? ' draggable="true"' : ''}${tintStyle(ticket)}>
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
  <button class="row" data-id="${ticket.id}"${tintStyle(ticket)}>
    <span class="id">${ticket.id}</span>
    <span class="row-title">${esc(ticket.title)}</span>
    <span class="meta">${fact(ticket.status, 'Status', STATUS_LABEL[ticket.status])}${effortFact(ticket)}</span>
  </button>`;

const changelogEntry = (ticket) => {
  const summary = summaryOf(ticket);
  return `
  <button class="entry" data-id="${ticket.id}"${tintStyle(ticket)}>
    <div class="entry-date">${formatDate(ticket.completed)}</div>
    <div>
      <div class="entry-title">${esc(ticket.title)}</div>
      ${EMPTY_TEXT.test(summary) ? '' : `<p>${esc(summary)}</p>`}
      <div class="meta"><span>${ticket.id}</span></div>
    </div>
  </button>`;
};

// Projects: order and colours ----------------------------------------
// The order of the project list is set by drag and drop and stored in the bucket. It is also the
// order of the project filter.

const PROJECT_COLUMNS = ['Colour', 'Prefix', 'Name', 'Live site', 'Repository'];

const colourName = (hex) => colours.find((c) => c.hex === hex)?.name;

const swatch = (project) => {
  const name = colourName(project.color) || 'No colour';
  const attributes = `class="swatch${project.color ? '' : ' none'}"${project.color ? ` style="background:${project.color}"` : ''}`;
  return user
    ? `<button ${attributes} type="button" data-pick="${project.prefix}" title="${name}" aria-label="Colour of ${project.prefix}: ${name}. Change it"></button>`
    : `<span ${attributes} title="${name}" role="img" aria-label="Colour of ${project.prefix}: ${name}"></span>`;
};

const renderProjects = () => {
  const head = (user ? ['', ...PROJECT_COLUMNS, ''] : PROJECT_COLUMNS).map((label) => `<th scope="col">${label}</th>`).join('');
  const rows = projects
    .map((p) => `
      <tr data-prefix="${p.prefix}"${user ? ' draggable="true"' : ''}>
        ${user ? `<td class="grip-cell"><button class="grip" type="button" data-grip="${p.prefix}" title="Drag to reorder, or use the arrow keys" aria-label="Move ${p.prefix}. Use the up and down arrow keys">${icon('grip')}</button></td>` : ''}
        <td>${swatch(p)}</td>
        <td class="prefix">${esc(p.prefix)}</td>
        <td>${esc(p.name)}</td>
        <td>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\//, ''))}</a>` : '<span class="muted">none</span>'}</td>
        <td><a href="https://github.com/${esc(p.repo)}" target="_blank" rel="noopener">github.com/${esc(p.repo)}</a></td>
        ${user ? `<td class="actions"><button class="icon-button" type="button" data-edit-project="${p.prefix}" title="Edit ${esc(p.name)}" aria-label="Edit ${esc(p.name)}">${icon('edit')}</button></td>` : ''}
      </tr>`)
    .join('');
  const add = user ? `<button class="add-card add-project" type="button" data-add-project>${icon('plus')}New project</button>` : '';
  return `<section class="lane"><div class="table-wrap"><table class="projects"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>${add}</section>`;
};

// Adding and editing a project --------------------------------------
// The prefix is chosen once, when the project is added, and cannot be changed later: it is part of
// every ticket ID and of the commit messages in the repositories.

// First three consonants of the name, then the next variants: "courses.simsab.net" gives CRS, CRE, ...
function prefixCandidates(name) {
  const letters = [...name.split('.')[0].toUpperCase().replace(/[^A-Z]/g, '')];
  const consonants = letters.filter((letter) => !'AEIOU'.includes(letter));
  const pool = consonants.length >= 3 ? consonants : letters;
  const found = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) found.push(pool[i] + pool[j] + pool[k]);
    }
  }
  return [...new Set(found)];
}

const suggestPrefix = (name) => prefixCandidates(name).find((prefix) => !projectByPrefix[prefix]) ?? '';

function prefixProblem(prefix) {
  if (!/^[A-Z]{3}$/.test(prefix)) return 'Use exactly three capital letters.';
  const used = projectByPrefix[prefix];
  return used ? `${prefix} is already used by ${used.name}.` : '';
}

const projectFormHtml = (creating, project) => `
  <form id="project-form" class="edit" novalidate>
    <label>Name<input name="name" value="${esc(project.name)}" placeholder="shop.example.com" autocomplete="off"></label>
    ${creating
      ? `<label>Prefix<input name="prefix" maxlength="3" autocomplete="off" spellcheck="false" placeholder="ABC"></label>
    <p id="prefix-hint" class="hint"></p>`
      : `<p class="hint">The prefix ${esc(project.prefix)} cannot be changed. It is part of every ticket ID and commit message.</p>`}
    <label>Live site<input name="url" value="${esc(project.url ?? '')}" placeholder="https://example.com" autocomplete="off"></label>
    <label>Repository on GitHub<input name="repo" value="${esc(project.repo)}" placeholder="owner/name" autocomplete="off" spellcheck="false"></label>
    <p id="edit-error" class="edit-error" role="alert" hidden></p>
    <div class="edit-actions"><button type="submit" class="primary">${creating ? 'Add project' : 'Save'}</button><button type="button" id="cancel-edit">Cancel</button></div>
  </form>`;

function renderProjectForm() {
  const creating = state.projectForm.mode === 'create';
  const project = creating ? { prefix: '', name: '', repo: '' } : projectByPrefix[state.projectForm.prefix];
  $('detail').classList.add('open');
  $('backdrop').classList.add('open');
  $('detail').innerHTML = `
  <div class="panel">
    <div class="panel-top">
      <div><div class="id">${creating ? 'New project' : esc(project.prefix)}</div><h2>${creating ? 'Add a project' : esc(project.name)}</h2></div>
      <div class="panel-actions"><button id="close" type="button" aria-label="Close">Close</button></div>
    </div>
    ${projectFormHtml(creating, project)}
  </div>`;
  $('close').onclick = closeDetail;
  bindProjectForm(creating, project);
}

function bindProjectForm(creating, project) {
  const form = $('project-form');
  const field = (name) => form.elements.namedItem(name);
  const showError = (message) => {
    $('edit-error').textContent = message;
    $('edit-error').hidden = false;
  };
  let touched = false; // once the prefix is typed by hand, it is no longer suggested

  const checkPrefix = () => {
    const prefix = field('prefix').value;
    const problem = prefix || touched ? prefixProblem(prefix) : '';
    $('prefix-hint').classList.toggle('bad', Boolean(problem) && touched);
    $('prefix-hint').textContent =
      problem || (prefix ? `${prefix} is free${touched ? '' : ', suggested from the name'}.` : 'The prefix is suggested from the name. You can type your own: three capital letters.');
  };

  if (creating) {
    field('name').addEventListener('input', () => {
      if (!touched) field('prefix').value = suggestPrefix(field('name').value);
      checkPrefix();
    });
    field('prefix').addEventListener('input', () => {
      touched = true;
      field('prefix').value = field('prefix').value.toUpperCase().replace(/[^A-Z]/g, '');
      checkPrefix();
    });
    checkPrefix();
  }

  $('cancel-edit').onclick = closeDetail;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const fields = { name: field('name').value.trim(), url: field('url').value.trim(), repo: field('repo').value.trim() };
    if (!fields.name) return showError('Enter a name.');
    if (creating) {
      const problem = prefixProblem(field('prefix').value);
      if (problem) {
        touched = true;
        checkPrefix();
        return showError(problem);
      }
    }
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    const { error, result } = creating
      ? await send('POST', 'api/tickets/projects', { prefix: field('prefix').value, ...fields })
      : await send('PATCH', `api/tickets/projects/${project.prefix}`, fields);
    if (error) {
      submit.disabled = false;
      return showError(error);
    }
    if (creating) {
      projects.push(result);
      projectByPrefix[result.prefix] = result;
    } else {
      for (const key of Object.keys(project)) delete project[key];
      Object.assign(project, result);
    }
    state.projectForm = null;
    render();
  };
}

function openProjectForm(form) {
  state.projectForm = form;
  state.ticket = '';
  state.creating = false;
  state.editing = false;
  render();
  $('project-form').elements.namedItem('name').focus();
}

// Puts the projects in the order of the given prefixes, in place.
const applyOrder = (order) => projects.sort((a, b) => order.indexOf(a.prefix) - order.indexOf(b.prefix));

// Shows the new order at once and stores it; the old order returns when storing fails.
async function reorderProjects(order) {
  const previous = projects.map((p) => p.prefix);
  applyOrder(order);
  render();
  const { error } = await send('PUT', 'api/tickets/projects/order', { order });
  if (error) {
    applyOrder(previous);
    toast(error);
    render();
  }
}

function moveProject(prefix, target, after) {
  if (prefix === target) return;
  const order = projects.map((p) => p.prefix).filter((p) => p !== prefix);
  order.splice(order.indexOf(target) + (after ? 1 : 0), 0, prefix);
  reorderProjects(order);
}

function moveProjectByOne(prefix, step) {
  const order = projects.map((p) => p.prefix);
  const from = order.indexOf(prefix);
  const to = from + step;
  if (to < 0 || to >= order.length) return;
  order.splice(to, 0, order.splice(from, 1)[0]);
  reorderProjects(order);
  $('view').querySelector(`[data-grip="${prefix}"]`)?.focus();
}

let paletteFor = ''; // prefix of the project whose colour is being chosen

function closePalette() {
  paletteFor = '';
  $('palette').hidden = true;
}

function openPalette(button) {
  const project = projectByPrefix[button.dataset.pick];
  paletteFor = project.prefix;
  const choices = colours
    .map((c) => `<button class="swatch${c.hex === project.color ? ' current' : ''}" type="button" data-colour="${c.hex}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`)
    .join('');
  $('palette').innerHTML = `<div class="palette-title">Colour of ${esc(project.prefix)}</div>
    <div class="swatches">${choices}<button class="swatch none${project.color ? '' : ' current'}" type="button" data-colour="" title="No colour" aria-label="No colour"></button></div>`;
  const box = button.getBoundingClientRect();
  $('palette').style.top = `${box.bottom + 8}px`;
  $('palette').style.left = `${Math.max(8, Math.min(box.left, innerWidth - 240))}px`;
  $('palette').hidden = false;
}

async function setProjectColour(prefix, hex) {
  closePalette();
  const { error, result } = await send('PATCH', `api/tickets/projects/${prefix}`, { color: hex || null });
  if (error) return toast(error);
  const project = projectByPrefix[prefix];
  if (result.color) project.color = result.color;
  else delete project.color;
  render();
}

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
  // New tickets start as ideas, so a placeholder card to create one sits at the top of the Idea column.
  const add = status === 'idea' && user ? `<button class="add-card" type="button">${icon('plus')}New ticket</button>` : '';
  const cards = items.map(card).join('') || (add ? '' : '<div class="note">Empty</div>');
  return `
  <section class="column${limitClass}" data-status="${status}">
    <h2 class="heading"><span>${label}</span>${count}</h2>
    <div class="cards">${add}${cards}</div>
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
      <section class="lane">
        <div class="group heading">${priorityDot(priority)} ${PRIORITY_LABEL[priority]} · ${open.length}</div>
        ${open.map(backlogRow).join('') || '<div class="note">Nothing open</div>'}
      </section>`;
    })
    .join('');

const renderChangelog = (visible) =>
  `<section class="lane">${
    visible.filter((t) => t.status === 'completed').sort(byCompletion).map(changelogEntry).join('') ||
    '<div class="note">Nothing completed yet.</div>'
  }</section>`;

const RENDERERS = { projects: renderProjects, board: renderBoard, backlog: renderBacklog, changelog: renderChangelog };

// Detail drawer ------------------------------------------------------

function renderDetail() {
  if (state.projectForm && user) return renderProjectForm();
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
  if (!state.ticket && !state.creating && !state.projectForm) return;
  state.ticket = '';
  state.editing = false;
  state.creating = false;
  state.projectForm = null;
  render();
}

// Rendering and events -----------------------------------------------

function render() {
  closePalette();
  if (state.view !== 'projects') state.projectForm = null;
  for (const tab of document.querySelectorAll('.tab')) {
    const selected = tab.dataset.view === state.view;
    tab.setAttribute('aria-selected', selected);
    tab.tabIndex = selected ? 0 : -1;
  }
  $('view').setAttribute('aria-labelledby', `tab-${state.view}`);
  fillProjectFilter();
  $('project').hidden = state.view === 'projects';
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
// Project rows can be dragged to another place in the list, once signed in.
function setupProjectDragAndDrop() {
  const view = $('view');
  let dragged = '';
  const clearMarks = () => view.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  const rowOf = (event) => event.target.closest?.('tr[data-prefix]');

  view.addEventListener('dragstart', (event) => {
    const row = rowOf(event);
    if (!row || !user) return;
    dragged = row.dataset.prefix;
    event.dataTransfer.setData('text/plain', dragged);
    event.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  view.addEventListener('dragover', (event) => {
    const row = rowOf(event);
    if (!row || !dragged) return;
    event.preventDefault();
    clearMarks();
    const box = row.getBoundingClientRect();
    row.classList.add(event.clientY > box.top + box.height / 2 ? 'drop-after' : 'drop-before');
  });
  view.addEventListener('drop', (event) => {
    const row = rowOf(event);
    if (!row || !dragged) return;
    event.preventDefault();
    const moved = dragged;
    const after = row.classList.contains('drop-after');
    dragged = '';
    clearMarks();
    moveProject(moved, row.dataset.prefix, after);
  });
  view.addEventListener('dragend', () => {
    dragged = '';
    clearMarks();
    view.querySelector('.dragging')?.classList.remove('dragging');
  });
  view.addEventListener('keydown', (event) => {
    const grip = event.target.closest?.('[data-grip]');
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!grip || !step) return;
    event.preventDefault();
    moveProjectByOne(grip.dataset.grip, step);
  });
}

function setupDragAndDrop() {
  const view = $('view');
  let dragged = '';
  const clearDropTargets = () => view.querySelectorAll('.drop, .dragging').forEach((el) => el.classList.remove('drop', 'dragging'));

  view.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.('.card');
    if (!card) return;
    if (!user) return event.preventDefault();
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

// The filter lists the projects in the order of the Projects view.
function fillProjectFilter() {
  const select = $('project');
  select.innerHTML =
    '<option value="">All projects</option>' +
    projects.map((p) => `<option value="${p.prefix}">${p.prefix} · ${esc(p.name)}</option>`).join('');
  select.value = state.project;
}

function setupProjectFilter() {
  $('project').onchange = () => {
    state.project = $('project').value;
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
setupProjectDragAndDrop();
$('signin').onclick = () => {
  rememberEditor(true);
  location.href = `api/tickets/login?next=${encodeURIComponent(location.hash)}`;
};
$('view').addEventListener('click', (event) => {
  if (event.target.closest('[data-add-project]')) return openProjectForm({ mode: 'create' });
  const editButton = event.target.closest('[data-edit-project]');
  if (editButton) return openProjectForm({ mode: 'edit', prefix: editButton.dataset.editProject });
  if (event.target.closest('.add-card')) return startCreating();
  const picker = event.target.closest('[data-pick]');
  if (picker) {
    const open = paletteFor === picker.dataset.pick;
    closePalette();
    if (!open) openPalette(picker);
  }
});
$('palette').addEventListener('click', (event) => {
  const choice = event.target.closest('[data-colour]');
  if (choice) setProjectColour(paletteFor, choice.dataset.colour);
});
document.addEventListener('click', (event) => !event.target.closest('#palette, [data-pick]') && closePalette());
$('avatar').onclick = toggleAccountMenu;
$('signout').onclick = () => {
  rememberEditor(false);
  location.href = `/cdn-cgi/access/logout?returnTo=${encodeURIComponent(`${location.origin}/`)}`;
};
document.addEventListener('click', (event) => !event.target.closest('#account') && closeAccountMenu());
$('backdrop').onclick = () => !state.editing && !state.creating && !state.projectForm && closeDetail();
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!$('palette').hidden) closePalette();
  else if (!$('account-menu').hidden) closeAccountMenu();
  else cancelOrClose();
});
window.addEventListener('resize', () => state.view === 'board' && requestAnimationFrame(fitBoard));
render();
checkSession().then(render);
document.fonts.ready.then(() => state.view === 'board' && fitBoard());
