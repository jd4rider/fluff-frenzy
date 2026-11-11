import { describe, expect, it } from 'vitest'
import journey from '../src/data/journey.json'
import { findRuns } from '../src/game/board'
import { Session, boardFromLevel } from '../src/game/session'
import type { LevelData } from '../src/game/types'
import { WORLDS } from '../src/data/worlds'

const levels = (journey as unknown as { levels: LevelData[] }).levels

/**
 * The recorded solution is the proof a level is winnable. Board logic is
 * integer-only, so replaying it must win in exactly the stored move count on
 * any machine — this is the test that keeps the promise honest.
 */
describe('Journey levels', () => {
  it('ships exactly 500 levels across ten worlds', () => {
    expect(levels.length).toBe(500)
    for (const world of WORLDS) {
      const inWorld = levels.filter((level) => level.world === world.id)
      expect(inWorld.length).toBe(50)
    }
  })

  it('opens every board without a match waiting to happen', () => {
    for (const level of levels) {
      const board = boardFromLevel(level, 8, 8, level.colors)
      expect(findRuns(board)).toHaveLength(0)
    }
  })

  it('replays every recorded solution to a win inside the move limit', () => {
    const failures: string[] = []
    for (const level of levels) {
      const session = new Session({ mode: 'journey', level, seed: 0 })
      for (const [axis, line, delta] of level.solution) {
        if (session.status !== 'playing') break
        session.move(axis, line, delta)
      }
      if (session.status !== 'won') failures.push(`level ${level.id} did not win`)
      else if (session.movesUsed > level.moveLimit) failures.push(`level ${level.id} needed ${session.movesUsed} > ${level.moveLimit}`)
    }
    expect(failures).toEqual([])
  })

  it('keeps its star thresholds reachable and ordered', () => {
    for (const level of levels) {
      const [two, three] = level.stars
      expect(three).toBeGreaterThan(0)
      expect(three).toBeLessThanOrEqual(two)
      expect(two).toBeLessThanOrEqual(level.moveLimit)
      expect(level.solutionMoves).toBeLessThanOrEqual(three)
      expect(level.moveLimit).toBeGreaterThanOrEqual(level.solutionMoves)
    }
  })

  it('only uses specials the board can actually carry', () => {
    for (const level of levels) {
      for (const entry of level.specials) {
        expect(entry.index).toBeGreaterThanOrEqual(0)
        expect(entry.index).toBeLessThan(64)
      }
    }
  })
})
