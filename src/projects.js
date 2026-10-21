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

// Only the colour of a project can be changed. null removes it.
export function patchProject(project, patch) {
  if (!('color' in patch)) throw new HttpError(400, 'Send the color to change, as a hex code or null.');
  const color = typeof patch.color === 'string' ? patch.color.toUpperCase() : patch.color;
  if (color !== null && !COLOURS.some((c) => c.hex === color)) {
    throw new HttpError(400, `color must be null or one of ${COLOURS.map((c) => c.hex).join(', ')}`);
  }
  const { color: previous, ...rest } = project;
  return color === null ? rest : { ...rest, color };
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
