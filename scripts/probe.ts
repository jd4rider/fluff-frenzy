import data from '../src/data/journey.json'
import { Session } from '../src/game/session'
import type { LevelData } from '../src/game/types'

const levels = (data as unknown as { levels: LevelData[] }).levels

for (const id of [1, 5, 25, 60, 120, 200, 260, 330, 410, 480, 500]) {
  const level = levels[id - 1]!
  console.log(
    id,
    level.objective.kind,
    level.objective.target,
    'limit',
    level.moveLimit,
    'sol',
    level.solutionMoves,
    'stars',
    level.stars.join('/'),
    'specials',
    level.specials.length,
  )
}

const sample = levels[199]!
const session = new Session({ mode: 'journey', level: sample, seed: 0 })
for (const [axis, line, delta] of sample.solution) {
  const result = session.move(axis, line, delta)
  console.log(
    'move',
    axis,
    line,
    delta,
    'cleared',
    result.cleared,
    'chain',
    result.chain,
    'score',
    result.score,
    'total',
    session.score,
    'progress',
    `${session.progress().current}/${session.progress().target}`,
  )
}
console.log('status', session.status, 'movesUsed', session.movesUsed, 'limit', sample.moveLimit)

const dist = new Map<number, number>()
for (const level of levels) dist.set(level.solutionMoves, (dist.get(level.solutionMoves) ?? 0) + 1)
console.log('solution lengths', [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => `${m}:${n}`).join(' '))
