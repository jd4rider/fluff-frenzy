import type { Session } from './session'
import type { Axis } from './types'

export interface Candidate {
  axis: Axis
  line: number
  delta: number
  score: number
  cleared: number
  chain: number
  /** Objective progress this move adds. */
  progress: number
  value: number
}

function valueOf(progress: number, score: number, cleared: number, chain: number): number {
  return progress * 1000 + score + cleared * 4 + chain * 12
}

/**
 * Deterministic greedy autoplayer. It authors every Journey level and proves
 * it: a level only ships when this bot wins it inside the move limit, and its
 * winning moves are stored as the level's recorded solution.
 *
 * Objective progress dominates the score, so the bot plays the level's goal
 * rather than merely chasing points.
 */
export function bestMove(session: Session): Candidate | null {
  const before = session.progress().current
  let best: Candidate | null = null
  const consider = (axis: Axis, line: number, delta: number): void => {
    const clone = session.clone()
    const result = clone.move(axis, line, delta)
    if (!result.accepted) return
    const progress = Math.max(0, clone.progress().current - before)
    const value = valueOf(progress, result.score, result.cleared, result.chain)
    if (best && value <= best.value) return
    best = {
      axis,
      line,
      delta,
      score: result.score,
      cleared: result.cleared,
      chain: result.chain,
      progress,
      value,
    }
  }

  for (let line = 0; line < session.rows; line += 1) {
    for (let delta = 1; delta < session.cols; delta += 1) consider('row', line, delta)
  }
  for (let line = 0; line < session.cols; line += 1) {
    for (let delta = 1; delta < session.rows; delta += 1) consider('col', line, delta)
  }
  return best
}

export interface PlayResult {
  won: boolean
  moves: [Axis, number, number][]
  movesUsed: number
  score: number
  bestChain: number
  bestRun: number
  cleared: number
}

/** Plays a session to its end, or until `maxMoves` moves have been committed. */
export function playSession(session: Session, maxMoves = 200): PlayResult {
  const moves: [Axis, number, number][] = []
  let guard = 0
  while (session.status === 'playing' && guard < maxMoves) {
    const candidate = bestMove(session)
    if (!candidate) break
    if (!session.move(candidate.axis, candidate.line, candidate.delta).accepted) break
    moves.push([candidate.axis, candidate.line, candidate.delta])
    guard += 1
  }
  return {
    won: session.status === 'won',
    moves,
    movesUsed: session.movesUsed,
    score: session.score,
    bestChain: session.bestChain,
    bestRun: session.bestRun,
    cleared: session.clearedTotal,
  }
}
