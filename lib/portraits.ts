export const PORTRAITS = [
  'The Archivist',
  'The Courier',
  'The Musician',
  'The Astronomer',
  'The Poet',
  'The Mechanic',
  'The Gardener',
  'The Detective',
  'The Tailor',
  'The Painter',
  'The Captain',
  'The Night Owl',
].map((label, i) => ({ id: i + 1, label }));

export function isPortrait(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= PORTRAITS.length
  );
}
export function portraitUrl(id: number) {
  return `/assets/portraits/illustrated-portrait-${String(isPortrait(id) ? id : 1).padStart(2, '0')}.png`;
}
