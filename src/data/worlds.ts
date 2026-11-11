export interface World {
  id: number
  name: string
  blurb: string
  /** Backdrop gradient, top to bottom. */
  sky: [string, string]
  ground: string
  accent: string
  /** Decorative motif drawn behind the board. */
  motif: 'meadow' | 'clouds' | 'bubbles' | 'forest' | 'crystal' | 'snow' | 'carnival' | 'neon' | 'cosmos' | 'kingdom'
  /** Colours used by the fluffs in this world. */
  colors: number
}

/**
 * Ten worlds, fifty levels each. The palettes are data so the Journey map, the
 * backdrop and the results screen all read the same thing.
 */
export const WORLDS: World[] = [
  {
    id: 0,
    name: 'Fluffy Meadows',
    blurb: 'Soft grass, warm sun, first fusions',
    sky: ['#8fd3ff', '#d9f7c1'],
    ground: '#5fbb62',
    accent: '#f7b731',
    motif: 'meadow',
    // Six colours keeps connected groups rare enough to need real play.
    colors: 6,
  },
  {
    id: 1,
    name: 'Candy Clouds',
    blurb: 'Cotton candy skies and sweet slides',
    sky: ['#ffc2e2', '#fff1c9'],
    ground: '#f291c4',
    accent: '#ff6fa5',
    motif: 'clouds',
    colors: 6,
  },
  {
    id: 2,
    name: 'Bubble Bay',
    blurb: 'Warm shallows, drifting bubbles',
    sky: ['#7ee8fa', '#e0f7ff'],
    ground: '#2fa9c9',
    accent: '#19b7a3',
    motif: 'bubbles',
    colors: 6,
  },
  {
    id: 3,
    name: 'Enchanted Forest',
    blurb: 'Lantern light between the ferns',
    sky: ['#3f7d5f', '#b9e3a1'],
    ground: '#2d5c47',
    accent: '#ffe066',
    motif: 'forest',
    colors: 6,
  },
  {
    id: 4,
    name: 'Crystal Caverns',
    blurb: 'Locked fluffs in a gemstone hall',
    sky: ['#4a3a86', '#b3a4ff'],
    ground: '#2b214d',
    accent: '#8ef1ff',
    motif: 'crystal',
    colors: 6,
  },
  {
    id: 5,
    name: 'Frosty Fluffland',
    blurb: 'Frozen friends need warming up',
    sky: ['#bfe9ff', '#f4fbff'],
    ground: '#8fd1e8',
    accent: '#7ec8ff',
    motif: 'snow',
    colors: 6,
  },
  {
    id: 6,
    name: 'Rainbow Carnival',
    blurb: 'Wildcards under the big top',
    sky: ['#ff9a76', '#ffe38f'],
    ground: '#e05d4a',
    accent: '#ffcf3f',
    motif: 'carnival',
    colors: 6,
  },
  {
    id: 7,
    name: 'Neon Dream City',
    blurb: 'Bombs and lightning on the strip',
    sky: ['#2b1055', '#7597ff'],
    ground: '#160c33',
    accent: '#41f5ff',
    motif: 'neon',
    colors: 6,
  },
  {
    id: 8,
    name: 'Cosmic Fluffverse',
    blurb: 'Every mechanic in orbit',
    sky: ['#0f0b2e', '#6a4fbf'],
    ground: '#090620',
    accent: '#ff8bf0',
    motif: 'cosmos',
    colors: 6,
  },
  {
    id: 9,
    name: 'Kingdom of Fluff',
    blurb: 'The royal court of cascades',
    sky: ['#ffd88a', '#ffb3c9'],
    ground: '#a8532f',
    accent: '#ffe15c',
    motif: 'kingdom',
    colors: 6,
  },
]

export function worldOf(levelId: number): World {
  return WORLDS[Math.min(WORLDS.length - 1, Math.floor((levelId - 1) / 50))]!
}
