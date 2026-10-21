import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = ['idea', 'planned', 'in-progress', 'completed'];
const TYPE = ['feature', 'change', 'content', 'bug', 'chore', 'docs', 'idea'];
const PRIORITY = ['now', 'next', 'later'];
const EFFORT = ['S', 'M', 'L'];

const projects = JSON.parse(readFileSync(join(root, 'projects.json'), 'utf8'));
const prefixes = new Set(projects.map((p) => p.prefix));

function parse(file, text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const t = { commits: [] };
  let list = null;
  for (const line of m[1].split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && list) {
      const [sha, ...rest] = item[1].split(' | ');
      list.push({ sha: sha.trim(), subject: rest.join(' | ').trim() });
      continue;
    }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    list = null;
    let v = kv[2].trim().replace(/^"(.*)"$/, '$1');
    if (kv[1] === 'commits') { list = t.commits; continue; }
    t[kv[1]] = v === 'null' || v === '' ? null : v === 'true' ? true : v === 'false' ? false : v;
  }
  t.body = m[2].trim();
  return t;
}

const errors = [];
const tickets = readdirSync(join(root, 'tickets')).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const t = parse(f, readFileSync(join(root, 'tickets', f), 'utf8'));
  const here = (msg) => errors.push(`${f}: ${msg}`);
  if (!t.id || f !== `${t.id}.md`) here('id must match the file name');
  if (!/^[A-Z]{3}-\d+$/.test(t.id || '')) here('id must look like ABC-123');
  if (t.project !== (t.id || '').slice(0, 3)) here('project must match the id prefix');
  if (!prefixes.has(t.project)) here(`unknown project ${t.project}`);
  if (!t.title) here('title is required');
  if (!STATUS.includes(t.status)) here(`status must be one of ${STATUS.join(', ')}`);
  if (!TYPE.includes(t.type)) here(`type must be one of ${TYPE.join(', ')}`);
  if (t.status !== 'completed' && !PRIORITY.includes(t.priority)) here(`priority must be one of ${PRIORITY.join(', ')}`);
  if (t.effort && !EFFORT.includes(t.effort)) here(`effort must be one of ${EFFORT.join(', ')}`);
  if (t.status === 'completed' && !t.completed) here('completed tickets need a completed date');
  return t;
});

const ids = tickets.map((t) => t.id);
ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => errors.push(`duplicate id ${id}`));

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

mkdirSync(join(root, 'docs'), { recursive: true });
const data = { generated: new Date().toISOString(), projects, tickets };
writeFileSync(join(root, 'docs', 'data.js'), `window.LOGBOOK = ${JSON.stringify(data)};\n`);
console.log(`Built ${tickets.length} tickets for ${projects.length} projects.`);
