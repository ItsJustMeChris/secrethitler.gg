export const PORTRAIT_CATEGORIES = [
  { id: 'men', label: 'Men' },
  { id: 'women', label: 'Women' },
  { id: 'animals', label: 'Animals' },
] as const;

export type PortraitCategory = (typeof PORTRAIT_CATEGORIES)[number]['id'];

const names: Record<PortraitCategory, string[]> = {
  men: [
    'Archivist',
    'Conductor',
    'Professor',
    'Reporter',
    'Baker',
    'Detective',
    'Tailor',
    'Gardener',
    'Magician',
    'Watchmaker',
  ],
  women: [
    'Writer',
    'Pilot',
    'Librarian',
    'Musician',
    'Engineer',
    'Artist',
    'Botanist',
    'Editor',
    'Astronomer',
    'Explorer',
  ],
  animals: [
    'Frog',
    'Fox',
    'Owl',
    'Cat',
    'Hound',
    'Rabbit',
    'Badger',
    'Crocodile',
    'Ram',
    'Raven',
  ],
};

// Interleave the catalog so automatic AI portraits draw from all three groups.
// Numeric IDs stay grouped and stable for saved player choices.
export const PORTRAITS = PORTRAIT_CATEGORIES.flatMap((category, index) =>
  names[category.id].map((name, i) => ({
    id: index * 10 + i + 1,
    label: `The ${name}`,
    category: category.id,
  })),
).sort((a, b) => ((a.id - 1) % 10) - ((b.id - 1) % 10));

export function portraitCategory(id: number): PortraitCategory {
  return PORTRAITS.find((portrait) => portrait.id === id)?.category ?? 'men';
}

export function isPortrait(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= PORTRAITS.length
  );
}
export function portraitUrl(id: number) {
  return `/assets/portraits/cartoon-avatar-${String(isPortrait(id) ? id : 1).padStart(2, '0')}.png`;
}
