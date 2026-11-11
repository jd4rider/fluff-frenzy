/**
 * Versioned local save. Everything is validated on read: a corrupt or older
 * payload falls back to defaults instead of wiping a player's Journey by
 * throwing. The arcade client mirrors these same keys into an account when a
 * player is signed in, and the game works without it.
 */

export const SAVE_KEY = 'fluff-frenzy-save-v1'

export type Quality = 'low' | 'medium' | 'high'

export interface Settings {
  sfx: number
  music: number
  muted: boolean
  quality: Quality
  reducedMotion: boolean
  tapToDrop: boolean
  furStyle: number
}

export interface Stats {
  games: number
  matches: number
  cleared: number
  bestMatch: number
  bestChain: number
  fevers: number
  golden: number
  stars: number
  playMs: number
  dailyDone: number
}

export interface SaveData {
  version: number
  journey: Record<string, number>
  unlocked: number
  classicBest: number
  timedBest: number
  zenBest: number
  dailyBest: number
  achievements: string[]
  stats: Stats
  settings: Settings
  daily: { date: string; done: boolean }
  clearedByColor: number[]
}

export const DEFAULT_SETTINGS: Settings = {
  sfx: 0.7,
  music: 0.4,
  muted: false,
  quality: 'high',
  reducedMotion: false,
  tapToDrop: false,
  furStyle: 0,
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    journey: {},
    unlocked: 1,
    classicBest: 0,
    timedBest: 0,
    zenBest: 0,
    dailyBest: 0,
    achievements: [],
    stats: {
      games: 0,
      matches: 0,
      cleared: 0,
      bestMatch: 0,
      bestChain: 0,
      fevers: 0,
      golden: 0,
      stars: 0,
      playMs: 0,
      dailyDone: 0,
    },
    settings: { ...DEFAULT_SETTINGS },
    daily: { date: '', done: false },
    clearedByColor: [0, 0, 0, 0, 0, 0],
  }
}

function number(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function quality(value: unknown): Quality {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'high'
}

export function sanitize(raw: unknown): SaveData {
  const base = defaultSave()
  if (!raw || typeof raw !== 'object') return base
  const data = raw as Partial<SaveData>
  const journey: Record<string, number> = {}
  if (data.journey && typeof data.journey === 'object') {
    for (const [key, value] of Object.entries(data.journey)) {
      const id = Number(key)
      if (!Number.isInteger(id) || id < 1 || id > 500) continue
      journey[key] = number(value, 0, 0, 3)
    }
  }
  const achievements = Array.isArray(data.achievements)
    ? data.achievements.filter((item): item is string => typeof item === 'string').slice(0, 64)
    : []
  const stats = (data.stats ?? {}) as Partial<Stats>
  const settings = (data.settings ?? {}) as Partial<Settings>
  const clearedByColor = Array.isArray(data.clearedByColor)
    ? [...base.clearedByColor].map((_, index) => number(data.clearedByColor?.[index], 0))
    : base.clearedByColor
  return {
    version: 1,
    journey,
    unlocked: number(data.unlocked, 1, 1, 500),
    classicBest: number(data.classicBest, 0),
    timedBest: number(data.timedBest, 0),
    zenBest: number(data.zenBest, 0),
    dailyBest: number(data.dailyBest, 0),
    achievements,
    stats: {
      games: number(stats.games, 0),
      matches: number(stats.matches, 0),
      cleared: number(stats.cleared, 0),
      bestMatch: number(stats.bestMatch, 0),
      bestChain: number(stats.bestChain, 0),
      fevers: number(stats.fevers, 0),
      golden: number(stats.golden, 0),
      stars: number(stats.stars, 0),
      playMs: number(stats.playMs, 0),
      dailyDone: number(stats.dailyDone, 0),
    },
    settings: {
      sfx: number(settings.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
      music: number(settings.music, DEFAULT_SETTINGS.music, 0, 1),
      muted: Boolean(settings.muted),
      quality: quality(settings.quality),
      reducedMotion: Boolean(settings.reducedMotion),
      tapToDrop: Boolean(settings.tapToDrop),
      furStyle: number(settings.furStyle, 0, 0, 2),
    },
    daily: {
      date: typeof data.daily?.date === 'string' ? data.daily.date : '',
      done: Boolean(data.daily?.done),
    },
    clearedByColor,
  }
}

export function loadSave(): SaveData {
  if (typeof localStorage === 'undefined') return defaultSave()
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return defaultSave()
    return sanitize(JSON.parse(raw))
  } catch {
    return defaultSave()
  }
}

let cache: SaveData | null = null

export function save(): SaveData {
  if (!cache) cache = loadSave()
  return cache
}

export function persist(next: SaveData): void {
  cache = next
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next))
  } catch {
    // Private-mode storage can be unavailable; the in-memory copy still works.
  }
}

export function update(mutate: (data: SaveData) => void): SaveData {
  const next = sanitize(structuredClone(save()))
  mutate(next)
  persist(next)
  return next
}

export function totalStars(data: SaveData): number {
  return Object.values(data.journey).reduce((sum, stars) => sum + stars, 0)
}

export function recordLevel(levelId: number, stars: number, score: number, moves: number): SaveData {
  return update((data) => {
    const key = String(levelId)
    const previous = data.journey[key] ?? 0
    data.journey[key] = Math.max(previous, Math.min(3, stars))
    if (levelId === data.unlocked) data.unlocked = Math.min(500, levelId + 1)
    data.stats.stars = totalStars(data)
    data.stats.games += 1
    data.stats.cleared += 0
    void score
    void moves
  })
}

export function recordRun(mode: 'classic' | 'timed' | 'zen' | 'daily', score: number, stats: Partial<Stats>): SaveData {
  return update((data) => {
    if (mode === 'classic') data.classicBest = Math.max(data.classicBest, score)
    if (mode === 'timed') data.timedBest = Math.max(data.timedBest, score)
    if (mode === 'zen') data.zenBest = Math.max(data.zenBest, score)
    if (mode === 'daily') data.dailyBest = Math.max(data.dailyBest, score)
    data.stats.games += 1
    data.stats.matches += stats.matches ?? 0
    data.stats.cleared += stats.cleared ?? 0
    data.stats.bestMatch = Math.max(data.stats.bestMatch, stats.bestMatch ?? 0)
    data.stats.bestChain = Math.max(data.stats.bestChain, stats.bestChain ?? 0)
    data.stats.fevers += stats.fevers ?? 0
    data.stats.golden += stats.golden ?? 0
    data.stats.playMs += stats.playMs ?? 0
  })
}

export interface Achievement {
  id: string
  name: string
  hint: string
  earned: (data: SaveData) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-fluff', name: 'First Fluff', hint: 'Burst your first match', earned: (d) => d.stats.cleared >= 3 },
  { id: 'triple', name: 'Triple Trouble', hint: 'Trigger a x3 cascade', earned: (d) => d.stats.bestChain >= 3 },
  { id: 'explosion', name: 'Fluff Explosion', hint: 'Match six fluffs at once', earned: (d) => d.stats.bestMatch >= 6 },
  { id: 'fever', name: 'Fever Dream', hint: 'Activate Fluff Fever', earned: (d) => d.stats.fevers >= 1 },
  { id: 'champion', name: 'Colour Champion', hint: 'Free 1,000 fluffs', earned: (d) => d.stats.cleared >= 1000 },
  { id: 'explorer', name: 'Puzzle Explorer', hint: 'Clear 25 Journey levels', earned: (d) => Object.keys(d.journey).length >= 25 },
  { id: 'traveler', name: 'World Traveller', hint: 'Reach world 5', earned: (d) => d.unlocked > 200 },
  { id: 'golden', name: 'Golden Collector', hint: 'Burst 100 golden fluffs', earned: (d) => d.stats.golden >= 100 },
  { id: 'master', name: 'Fluff Master', hint: 'Clear 250 Journey levels', earned: (d) => Object.keys(d.journey).length >= 250 },
  { id: 'frenzy', name: 'Ultimate Frenzy', hint: 'Score 40,000 in one Classic run', earned: (d) => d.classicBest >= 40000 },
]

export function unlockedAchievements(data: SaveData): Achievement[] {
  return ACHIEVEMENTS.filter((achievement) => achievement.earned(data))
}

export function syncAchievements(): string[] {
  const data = save()
  const earned = ACHIEVEMENTS.filter((achievement) => achievement.earned(data)).map((achievement) => achievement.id)
  const fresh = earned.filter((id) => !data.achievements.includes(id))
  if (fresh.length > 0) {
    update((current) => {
      current.achievements = [...new Set([...current.achievements, ...earned])]
    })
  }
  return fresh
}

export function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function dailySeed(date = todayKey()): number {
  let hash = 2166136261
  for (let index = 0; index < date.length; index += 1) {
    hash ^= date.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
