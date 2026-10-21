import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOURS, createProject, patchProject, reorderProjects } from '../src/projects.js';

const project = { prefix: 'MTV', name: 'motivado.com', repo: 'simonsablowski/motivado', url: 'https://motivado.com' };

test('there are ten distinct colours with hex codes', () => {
  assert.equal(COLOURS.length, 10);
  assert.equal(new Set(COLOURS.map((c) => c.hex)).size, 10);
  assert.equal(new Set(COLOURS.map((c) => c.name)).size, 10);
  for (const { hex } of COLOURS) assert.match(hex, /^#[0-9A-F]{6}$/);
});

test('patchProject sets one of the colours and keeps the other fields', () => {
  const coloured = patchProject(project, { color: COLOURS[3].hex });
  assert.equal(coloured.color, COLOURS[3].hex);
  assert.equal(coloured.prefix, 'MTV');
  assert.equal(coloured.url, 'https://motivado.com');
});

test('patchProject accepts lower case hex codes', () => {
  assert.equal(patchProject(project, { color: COLOURS[0].hex.toLowerCase() }).color, COLOURS[0].hex);
});

test('patchProject removes the colour with null', () => {
  const coloured = patchProject(project, { color: COLOURS[1].hex });
  assert.equal('color' in patchProject(coloured, { color: null }), false);
});

test('patchProject refuses unknown colours and other fields', () => {
  assert.throws(() => patchProject(project, { color: '#123456' }), /color must be/);
  assert.throws(() => patchProject(project, { color: 'red' }), /color must be/);
  assert.throws(() => patchProject(project, { prefix: 'XYZ' }), /Send at least one of/);
});


const three = [{ prefix: 'AAA' }, { prefix: 'BBB' }, { prefix: 'CCC' }];

test('reorderProjects returns the projects in the given order', () => {
  assert.deepEqual(reorderProjects(three, ['CCC', 'AAA', 'BBB']).map((p) => p.prefix), ['CCC', 'AAA', 'BBB']);
});

test('reorderProjects keeps the other fields of each project', () => {
  const list = [{ prefix: 'AAA', color: '#FFC5D5' }, { prefix: 'BBB' }];
  assert.equal(reorderProjects(list, ['BBB', 'AAA'])[1].color, '#FFC5D5');
});

test('reorderProjects refuses lists that miss, repeat or add a project', () => {
  for (const order of [['AAA', 'BBB'], ['AAA', 'AAA', 'BBB'], ['AAA', 'BBB', 'CCC', 'DDD'], ['AAA', 'BBB', 'ZZZ'], 'AAA,BBB,CCC', null]) {
    assert.throws(() => reorderProjects(three, order), /order must list each/);
  }
});

const projects = [
  { prefix: 'MTV', name: 'motivado.com', repo: 'simonsablowski/motivado', url: 'https://motivado.com' },
  { prefix: 'LGB', name: 'logbook', repo: 'simonsablowski/logbook' },
];

test('patchProject changes name, live site and repository but never the prefix', () => {
  const changed = patchProject(projects[0], { prefix: 'ZZZ', name: ' Motivado ', url: 'https://www.motivado.com/', repo: 'simonsablowski/motivado-site' }, projects);
  assert.equal(changed.prefix, 'MTV');
  assert.equal(changed.name, 'Motivado');
  assert.equal(changed.url, 'https://www.motivado.com');
  assert.equal(changed.repo, 'simonsablowski/motivado-site');
});

test('patchProject removes the live site with an empty address', () => {
  assert.equal('url' in patchProject(projects[0], { url: '' }, projects), false);
});

test('patchProject checks name, address and repository', () => {
  assert.throws(() => patchProject(projects[0], { name: '  ' }, projects), /name must/);
  assert.throws(() => patchProject(projects[0], { url: 'motivado.com' }, projects), /url must/);
  assert.throws(() => patchProject(projects[0], { url: 'ftp://motivado.com' }, projects), /http/);
  assert.throws(() => patchProject(projects[0], { repo: 'no-slash' }, projects), /repo must/);
  assert.throws(() => patchProject(projects[0], { repo: 'simonsablowski/Logbook' }, projects), /already belongs to logbook/);
});

test('patchProject lets a project keep its own repository', () => {
  assert.equal(patchProject(projects[0], { repo: 'simonsablowski/motivado' }, projects).repo, 'simonsablowski/motivado');
});

test('createProject builds a project with a free prefix', () => {
  const created = createProject(projects, { prefix: 'NEW', name: ' New site ', repo: 'simonsablowski/new-site', url: 'https://new.example.com' });
  assert.deepEqual(created, { prefix: 'NEW', name: 'New site', repo: 'simonsablowski/new-site', url: 'https://new.example.com' });
  assert.equal('url' in createProject(projects, { prefix: 'NEW', name: 'New', repo: 'simonsablowski/new' }), false);
});

test('createProject refuses bad or used prefixes and repositories', () => {
  const input = { name: 'New', repo: 'simonsablowski/new' };
  for (const prefix of ['mtv', 'AB', 'ABCD', 'A1B', '', null, undefined]) {
    assert.throws(() => createProject(projects, { ...input, prefix }), /prefix must be three capital letters/);
  }
  assert.throws(() => createProject(projects, { ...input, prefix: 'MTV' }), /already used by motivado.com/);
  assert.throws(() => createProject(projects, { prefix: 'NEW', name: 'New', repo: 'simonsablowski/motivado' }), /already belongs to/);
  assert.throws(() => createProject(projects, { prefix: 'NEW', name: '', repo: 'simonsablowski/new' }), /name must/);
});
