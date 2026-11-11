import { writeFile } from 'node:fs/promises'
import { findRuns, hasUsableMove, reshuffle } from '../src/game/board'
import { Session, boardFromLevel } from '../src/game/session'
import { bestMove } from '../src/game/solver'
import { WORLDS } from '../src/data/worlds'
import { hashString } from '../src/game/rng'
import type { Axis, LevelData, Objective, Special } from '../src/game/types'

/**
 * Authors and proves every Journey level.
 *
 * The greedy solver plays each candidate board and its objective progress is
 * sampled after every move. A level's target is then read off that curve at the
 * number of moves the level should take, so difficulty is measured in moves the
 * player actually has to find rather than in an invented number. The finished
 * level is rebuilt from its stored data and the recorded moves are replayed;
 * nothing is written unless that replay wins inside the move limit.
 */

const SPECIALS_BY_WORLD: Record<number, Special[]> = {
  2: ['frozen', 'frozen', 'frozen'],
  3: ['locked', 'locked'],
  4: ['locked', 'locked', 'locked', 'golden'],
  5: ['frozen', 'frozen', 'frozen', 'frozen', 'golden'],
  6: ['rainbow', 'rainbow', 'golden'],
  7: ['bomb', 'lightning', 'golden'],
  8: ['rainbow', 'bomb', 'frozen', 'lightning'],
  9: ['rainbow', 'bomb', 'lightning', 'golden', 'frozen', 'locked'],
}

/** Objective family per world. */
function kindFor(level: number): Objective['kind'] {
  const world = Math.floor((level - 1) / 50)
  const tier = (level - 1) % 50
  switch (world) {
    case 0:
      return 'clear'
    case 1:
      return tier % 3 === 2 ? 'color' : 'clear'
    case 2:
      return 'color'
    case 3:
      return tier % 4 === 3 ? 'cascade' : 'score'
    case 4:
      return 'score'
    case 5:
      return 'clear'
    case 6:
      return tier % 5 === 4 ? 'big' : 'score'
    case 7:
      return tier % 4 === 3 ? 'cascade' : 'clear'
    case 8:
      return tier % 3 === 0 ? 'score' : 'color'
    default:
      return tier % 2 === 0 ? 'score' : 'clear'
  }
}

/** Moves a level is designed to take: generous early, tighter late. */
function desiredMoves(level: number): number {
  const world = Math.floor((level - 1) / 50)
  const tier = (level - 1) % 50
  const early = 9 + Math.round((tier / 49) * 9)
  const late = 7 + Math.round((tier / 49) * 6)
  return world < 3 ? early : late
}

const COLOR_NAMES = ['ruby', 'sunny', 'ocean', 'emerald', 'amethyst', 'tangerine']

function objectiveLabel(objective: Objective): string {
  switch (objective.kind) {
    case 'clear':
      return `Free ${objective.target} fluffs`
    case 'color':
      return `Free ${objective.target} ${COLOR_NAMES[objective.color ?? 0]} fluffs`
    case 'score':
      return `Score ${objective.target.toLocaleString('en-US')}`
    case 'cascade':
      return `Trigger a x${objective.target} cascade`
    case 'big':
      return `Match ${objective.target} fluffs at once`
  }
}

function progressValue(session: Session, kind: Objective['kind'], color: number): number {
  switch (kind) {
    case 'clear':
      return session.clearedTotal
    case 'color':
      return session.clearedByColor[color] ?? 0
    case 'score':
      return session.score
    case 'cascade':
      return session.bestChain
    case 'big':
      return session.bestRun
  }
}

function specialIndexes(level: number, world: number, count: number): { index: number; special: Special }[] {
  const specials = SPECIALS_BY_WORLD[world] ?? []
  if (specials.length === 0) return []
  const entries: { index: number; special: Special }[] = []
  const used = new Set<number>()
  let cursor = (level * 37) % 64
  for (let slot = 0; slot < Math.min(count, specials.length); slot += 1) {
    for (let attempt = 0; attempt < 24 && used.has(cursor); attempt += 1) cursor = (cursor + 11) % 64
    if (used.has(cursor)) continue
    used.add(cursor)
    entries.push({ index: cursor, special: specials[slot]! })
  }
  return entries
}

interface Trial {
  moves: [Axis, number, number][]
  curve: number[]
}

/** Plays the board with no objective so its progress curve can be measured. */
function trialRun(seed: number, colors: number, specials: { index: number; special: Special }[], kind: Objective['kind'], color: number, budget: number): Trial {
  const probe: LevelData = {
    id: 0,
    world: 0,
    seed,
    colors,
    objective: { kind, target: Number.MAX_SAFE_INTEGER, color, label: '' },
    moveLimit: 999,
    stars: [999, 999],
    solution: [],
    solutionMoves: 0,
    specials,
    scoreTarget: 0,
  }
  const session = new Session({ mode: 'journey', level: probe, seed: 0, autoReshuffle: false })
  session.movesLeft = Number.POSITIVE_INFINITY
  const moves: [Axis, number, number][] = []
  const curve: number[] = []
  while (moves.length < budget) {
    const move = bestMove(session)
    if (!move) break
    if (move.value <= 0) {
      session.board = reshuffle(session.board, session.rng, session.colors)
      continue
    }
    if (!session.move(move.axis, move.line, move.delta).accepted) break
    moves.push([move.axis, move.line, move.delta])
    curve.push(progressValue(session, kind, color))
  }
  return { moves, curve }
}

function buildLevel(level: number): LevelData | null {
  const world = Math.floor((level - 1) / 50)
  const tier = (level - 1) % 50
  const colors = WORLDS[world]!.colors
  const kind = kindFor(level)
  const color = (tier * 3 + world) % colors
  const specialCount = Math.min(6, 2 + Math.floor(tier / 12))
  const specials = specialIndexes(level, world, specialCount)

  // A stamped rainbow can complete a run on the opening board, so step the
  // seed until the board is quiet: the player must make the first match.
  let seed = hashString(`fluff-${level}`)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe: LevelData = {
      id: level,
      world,
      seed: seed + attempt,
      colors,
      objective: { kind, target: 10, color, label: '' },
      moveLimit: 999,
      stars: [999, 999],
      solution: [],
      solutionMoves: 0,
      specials,
      scoreTarget: 0,
    }
    const board = boardFromLevel(probe, 8, 8, colors)
    if (findRuns(board).length === 0 && hasUsableMove(board, colors)) {
      seed = seed + attempt
      break
    }
  }

  const desired = desiredMoves(level)
  const budget = Math.min(40, desired + 10)

  /**
   * Tries one objective family. A target is only taken when the board can
   * actually reach it, and the finished level is only returned once its own
   * recorded moves replay to a win inside the move limit.
   */
  const attempt = (family: Objective['kind'], round: number): LevelData | null => {
    const trial = trialRun(seed + round, colors, specials, family, color, budget)
    if (trial.curve.length < 4) return null
    const index = Math.min(trial.curve.length, desired) - 1
    let target = trial.curve[index] ?? trial.curve[trial.curve.length - 1]!
    if (family === 'cascade') target = Math.min(target, trial.curve[trial.curve.length - 1]!)
    if (family === 'big') target = 5
    if (family === 'color') target = Math.max(8, Math.round(target * 0.9))
    if (family === 'clear') target = Math.max(12, target)
    if (family === 'score') target = Math.max(600, target)
    if (family === 'big' && target > (trial.curve[trial.curve.length - 1] ?? 0)) return null
    if (family === 'cascade' && target < 2) return null

    const objective: Objective = { kind: family, target, color: family === 'color' ? color : undefined, label: '' }
    objective.label = objectiveLabel(objective)
    const used = Math.min(desired, trial.moves.length)
    const slack = tier < 8 ? 6 : tier < 26 ? 4 : 3
    const moveLimit = used + slack
    const stars: [number, number] = [used + Math.ceil(slack / 2), used]
    const solution = trial.moves.slice(0, used)
    const candidate: LevelData = {
      id: level,
      world,
      seed: seed + round,
      colors,
      objective,
      moveLimit,
      stars,
      solution,
      solutionMoves: used,
      specials,
      scoreTarget: family === 'score' ? target : 0,
    }

    // The opening board has to be quiet for this exact seed: a stamped
    // rainbow can complete a run, and the player should make the first match.
    const opening = boardFromLevel(candidate, 8, 8, colors)
    if (findRuns(opening).length > 0 || !hasUsableMove(opening, colors)) return null

    // Proof: rebuild from the stored data and replay the stored moves.
    const replay = new Session({ mode: 'journey', level: candidate, seed: 0 })
    for (const [axis, line, delta] of solution) {
      if (replay.status !== 'playing') break
      replay.move(axis, line, delta)
    }
    if (replay.status === 'won' && replay.movesUsed <= moveLimit && replay.progress().complete) return candidate
    return null
  }

  const attempts: Objective['kind'][] = [kind]
  // Objective families are a preference, not a promise: a seeded board may
  // simply never offer a five-fluff run or a deep cascade.
  if (kind === 'big') attempts.push('score', 'clear')
  else if (kind === 'cascade') attempts.push('clear', 'score')
  else attempts.push(kind === 'clear' ? 'score' : 'clear')
  for (const family of attempts) {
    for (let round = 0; round < 8; round += 1) {
      const built = attempt(family, round)
      if (built) return built
    }
  }
  return null
}

async function main(): Promise<void> {
  const levels: LevelData[] = []
  const started = Date.now()
  for (let level = 1; level <= 500; level += 1) {
    const built = buildLevel(level)
    if (!built) {
      console.error(`level ${level} could not be validated`)
      process.exitCode = 1
      continue
    }
    levels.push(built)
    if (level % 50 === 0) console.log(`  ... ${level} levels (${Math.round((Date.now() - started) / 1000)}s)`)
  }
  await writeFile(
    new URL('../src/data/journey.json', import.meta.url),
    JSON.stringify({ version: 1, levels }),
  )
  const kinds = new Map<string, number>()
  for (const level of levels) kinds.set(level.objective.kind, (kinds.get(level.objective.kind) ?? 0) + 1)
  const avg = levels.reduce((sum, level) => sum + level.solutionMoves, 0) / Math.max(1, levels.length)
  const avgLimit = levels.reduce((sum, level) => sum + level.moveLimit, 0) / Math.max(1, levels.length)
  console.log(`wrote ${levels.length} levels in ${Math.round((Date.now() - started) / 1000)}s`)
  console.log('objectives:', [...kinds.entries()].map(([k, n]) => `${k}:${n}`).join(' '))
  console.log(`average solution ${avg.toFixed(1)} moves, average limit ${avgLimit.toFixed(1)}`)
}

void main()
