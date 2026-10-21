import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOURS, patchProject, reorderProjects } from '../src/projects.js';

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
  assert.throws(() => patchProject(project, { name: 'other' }), /Send the color/);
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
