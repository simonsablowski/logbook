import { HttpError } from './tickets.js';

// Ten colours, one for each tenth of the hue wheel, chosen so that the smallest perceptual distance
// between any two of them (OKLab) is as large as possible within soft, light colours. The colour of
// a project tints its cards, so none of them is vivid.
export const COLOURS = [
  { name: 'Rose', hex: '#FE93A1' },
  { name: 'Amber', hex: '#EDA752' },
  { name: 'Yellow', hex: '#FCDC72' },
  { name: 'Green', hex: '#93CA73' },
  { name: 'Mint', hex: '#A3FDB6' },
  { name: 'Turquoise', hex: '#1ED1CD' },
  { name: 'Sky', hex: '#9EEDFE' },
  { name: 'Blue', hex: '#82BCFC' },
  { name: 'Lilac', hex: '#DDA4F7' },
  { name: 'Pink', hex: '#FECDEE' },
];

const PREFIX = /^[A-Z]{3}$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;
const EDITABLE = ['name', 'url', 'repo', 'color'];

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 60) throw new HttpError(400, 'name must have 1 to 60 characters');
  return name;
}

// An empty address means that the project has no live site.
function cleanUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(400, 'url must be a web address such as https://example.com');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'url must start with http:// or https://');
  return text.replace(/\/$/, '');
}

// `others` are the other projects: a repository belongs to one project only.
function cleanRepo(value, others) {
  const repo = typeof value === 'string' ? value.trim() : '';
  if (!REPO.test(repo)) throw new HttpError(400, 'repo must look like owner/name, for example simonsablowski/motivado');
  const used = others.find((p) => p.repo.toLowerCase() === repo.toLowerCase());
  if (used) throw new HttpError(409, `The repository ${repo} already belongs to ${used.name}.`);
  return repo;
}

function cleanColor(value) {
  const color = typeof value === 'string' ? value.toUpperCase() : value;
  if (color !== null && !COLOURS.some((c) => c.hex === color)) {
    throw new HttpError(400, `color must be null or one of ${COLOURS.map((c) => c.hex).join(', ')}`);
  }
  return color;
}

// Name, live site, repository and colour can be changed. The prefix cannot: it is part of every
// ticket ID and of the commit messages in the repositories. `all` is the whole list of projects.
export function patchProject(project, patch, all = []) {
  if (!EDITABLE.some((key) => key in patch)) throw new HttpError(400, `Send at least one of ${EDITABLE.join(', ')}.`);
  const next = { ...project };
  if ('name' in patch) next.name = cleanName(patch.name);
  if ('url' in patch) {
    const url = cleanUrl(patch.url);
    if (url) next.url = url;
    else delete next.url;
  }
  if ('repo' in patch) next.repo = cleanRepo(patch.repo, all.filter((p) => p.prefix !== project.prefix));
  if ('color' in patch) {
    const color = cleanColor(patch.color);
    if (color) next.color = color;
    else delete next.color;
  }
  return next;
}

// The prefix is chosen by the user once and never changes. It must be unused.
export function createProject(projects, input) {
  const prefix = input.prefix;
  if (typeof prefix !== 'string' || !PREFIX.test(prefix)) throw new HttpError(400, 'prefix must be three capital letters, for example MTV');
  const taken = projects.find((p) => p.prefix === prefix);
  if (taken) throw new HttpError(409, `The prefix ${prefix} is already used by ${taken.name}.`);
  const url = cleanUrl(input.url);
  return { prefix, name: cleanName(input.name), repo: cleanRepo(input.repo, projects), ...(url ? { url } : {}) };
}

// The order of the projects is the order of the list in the bucket. It is also the order of the
// project filter. `order` must name every project exactly once.
export function reorderProjects(projects, order) {
  const prefixes = projects.map((p) => p.prefix);
  const valid =
    Array.isArray(order) &&
    order.length === prefixes.length &&
    new Set(order).size === order.length &&
    order.every((prefix) => prefixes.includes(prefix));
  if (!valid) throw new HttpError(400, `order must list each of ${prefixes.join(', ')} exactly once`);
  return order.map((prefix) => projects.find((p) => p.prefix === prefix));
}
