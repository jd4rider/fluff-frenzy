import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  defaultSave,
  dailySeed,
  sanitize,
  totalStars,
} from '../src/core/saves'

describe('save validation', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitize(null)).toEqual(defaultSave())
    expect(sanitize('nope')).toEqual(defaultSave())
    expect(sanitize({ journey: 'x' }).unlocked).toBe(1)
  })

  it('keeps valid progress and clamps bad values', () => {
    const data = sanitize({
      journey: { '1': 3, '2': 9, '999': 2, '0': 2, abc: 3 },
      unlocked: 900,
      classicBest: -50,
      settings: { quality: 'ultra', sfx: 12, furStyle: 9 },
    })
    expect(data.journey['1']).toBe(3)
    expect(data.journey['2']).toBe(3)
    expect(data.journey['999']).toBeUndefined()
    expect(data.journey['0']).toBeUndefined()
    expect(data.unlocked).toBe(500)
    expect(data.classicBest).toBe(0)
    expect(data.settings.quality).toBe('high')
    expect(data.settings.sfx).toBe(1)
    expect(data.settings.furStyle).toBe(2)
  })

  it('totals the stars stored per level', () => {
    const data = sanitize({ journey: { '1': 3, '2': 2, '3': 1 } })
    expect(totalStars(data)).toBe(6)
  })

  it('derives a stable daily seed from the date', () => {
    expect(dailySeed('2026-11-10')).toBe(dailySeed('2026-11-10'))
    expect(dailySeed('2026-11-10')).not.toBe(dailySeed('2026-11-11'))
  })

  it('awards trophies from the actual save', () => {
    const data = defaultSave()
    expect(ACHIEVEMENTS.find((item) => item.id === 'first-fluff')!.earned(data)).toBe(false)
    data.stats.cleared = 12
    data.stats.bestChain = 3
    const earned = ACHIEVEMENTS.filter((item) => item.earned(data)).map((item) => item.id)
    expect(earned).toContain('first-fluff')
    expect(earned).toContain('triple')
    expect(earned).not.toContain('explosion')
  })
})
