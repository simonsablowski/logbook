import { HttpError } from './tickets.js';

// Ten pastel colours, spread evenly over the hue range, to tint the cards of a project.
export const COLOURS = [
  { name: 'Rose', hex: '#FFC5D5' },
  { name: 'Peach', hex: '#FFCCB7' },
  { name: 'Apricot', hex: '#FFDDAE' },
  { name: 'Lemon', hex: '#EBEAAC' },
  { name: 'Green', hex: '#C1E7B4' },
  { name: 'Mint', hex: '#9EE9D5' },
  { name: 'Cyan', hex: '#99E5F9' },
  { name: 'Blue', hex: '#B8DCFF' },
  { name: 'Lavender', hex: '#D9D0FF' },
  { name: 'Orchid', hex: '#F4C6F4' },
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
