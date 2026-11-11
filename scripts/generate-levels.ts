import { writeFile } from 'node:fs/promises'
import { findRuns, hasUsableMove, lineMovable, slideBoard } from '../src/game/board'
import { Session, boardFromLevel } from '../src/game/session'
import { Rand, hashString } from '../src/game/rng'
import { WORLDS } from '../src/data/worlds'
import type { Axis, LevelData, Objective, Special } from '../src/game/types'

/**
 * Authors and proves every Journey level.
 *
 * Targets are measured against a *casual* player, not the greedy solver: a bot
 * that spots any match and shifts a few cells into it, which frees roughly what
 * a person frees in a turn (a first pop plus the cascades that follow it). The
 * target is then set below the middle of that measured curve, so a level needs
 * ordinary play rather than the solver's eight-deep chains. The run that proves
 * the target is recorded as the level's solution and replayed through the real
 * Session before anything is written; the greedy bot is never used to size a
 * level, because sizing levels to its chains is what made them impossible.
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

/** Moves a level is designed to allow: generous early, tighter late. */
function desiredMoves(level: number): number {
  const world = Math.floor((level - 1) / 50)
  const tier = (level - 1) % 50
  const early = 9 + Math.round((tier / 49) * 9)
  const late = 7 + Math.round((tier / 49) * 6)
  return world < 3 ? early : late
}

/** Spare moves on top of the authored length, so a level is never knife-edge. */
function slackFor(tier: number): number {
  return tier < 8 ? 6 : tier < 26 ? 4 : 3
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

/** How far a casual drag travels. Players slide a few cells, not the whole row. */
const SHIFT_SCAN = 4

/** Every shift that would free at least one fluff, found without simulating. */
function clearingShifts(session: Session): [Axis, number, number][] {
  const shifts: [Axis, number, number][] = []
  const scan = (axis: Axis, line: number, length: number): void => {
    for (let delta = 1; delta <= Math.min(length, SHIFT_SCAN); delta += 1) {
      for (const step of [delta, -delta]) {
        if (findRuns(slideBoard(session.board, axis, line, step, session.colors)).length > 0) {
          shifts.push([axis, line, step])
        }
      }
    }
  }
  for (let line = 0; line < session.rows; line += 1) {
    if (lineMovable(session.board, 'row', line)) scan('row', line, session.cols - 1)
  }
  for (let line = 0; line < session.cols; line += 1) {
    if (lineMovable(session.board, 'col', line)) scan('col', line, session.rows - 1)
  }
  return shifts
}

interface CasualStep {
  move: [Axis, number, number]
  /** Cumulative objective values after this turn, cascades included. */
  clear: number
  color: number
  score: number
  chain: number
  big: number
}

/** One casual playthrough: pick any move that clears, take it, keep going. */
function casualRun(level: LevelData, rngSeed: number, maxMoves: number): CasualStep[] {
  const session = new Session({ mode: 'journey', level, seed: 0 })
  session.movesLeft = Number.POSITIVE_INFINITY
  const rng = new Rand(rngSeed)
  const goal = level.objective.kind === 'color' ? (level.objective.color ?? 0) : -1
  const steps: CasualStep[] = []
  for (let turn = 0; turn < maxMoves; turn += 1) {
    const shifts = clearingShifts(session)
    if (shifts.length === 0) break
    const [axis, line, delta] = shifts[Math.floor(rng.next() * shifts.length)]!
    const result = session.move(axis, line, delta)
    if (!result.accepted) break
    steps.push({
      move: [axis, line, delta],
      clear: session.clearedTotal,
      color: goal >= 0 ? (session.clearedByColor[goal] ?? 0) : 0,
      score: session.score,
      chain: session.bestChain,
      big: session.bestRun,
    })
  }
  return steps
}

function curveOf(steps: CasualStep[], kind: Objective['kind']): number[] {
  return steps.map((step) => {
    switch (kind) {
      case 'clear':
        return step.clear
      case 'color':
        return step.color
      case 'score':
        return step.score
      case 'cascade':
        return step.chain
      case 'big':
        return step.big
    }
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

/**
 * Target as a share of casual play: a level should reward noticing, not luck.
 * World 1 asks for barely half of an ordinary turn; by level 500 it asks for
 * nearly all of it, so the curve tightens without ever demanding bot play.
 */
function casualShare(level: number): number {
  return 0.5 + 0.35 * ((level - 1) / 499)
}

function buildLevel(level: number): LevelData | null {
  const world = Math.floor((level - 1) / 50)
  const tier = (level - 1) % 50
  const colors = WORLDS[world]!.colors
  const kind = kindFor(level)
  const color = (tier * 3 + world) % colors
  const specialCount = Math.min(6, 2 + Math.floor(tier / 12))
  const specials = specialIndexes(level, world, specialCount)

  // A stamped rainbow can complete a run on the opening board, so step the seed
  // until the board is quiet: the player must make the first match.
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
  const slack = slackFor(tier)
  const budget = desired + slack

  const attempt = (family: Objective['kind'], round: number): LevelData | null => {
    // The probe carries an unreachable target so the run can never end early.
    const probe: LevelData = {
      id: level,
      world,
      seed: seed + round,
      colors,
      objective: { kind: family, target: Number.MAX_SAFE_INTEGER, color: family === 'color' ? color : undefined, label: '' },
      moveLimit: budget,
      stars: [budget, budget],
      solution: [],
      solutionMoves: 0,
      specials,
      scoreTarget: 0,
    }

    const runs = [0, 1, 2]
      .map((index) => casualRun(probe, hashString(`run-${level}-${round}-${index}`), budget))
      .filter((run) => run.length >= Math.min(desired, 4))
    if (runs.length === 0) return null

    const curves = runs.map((run) => curveOf(run, family))
    const atDesired = curves.map((curve) => curve[Math.min(curve.length, desired) - 1]!)
    const middle = median(atDesired)
    let pick = 0
    runs.forEach((_, index) => {
      if (Math.abs(atDesired[index]! - middle) < Math.abs(atDesired[pick]! - middle)) pick = index
    })

    const share = casualShare(level)
    let target: number
    switch (family) {
      case 'clear':
        target = Math.max(24, Math.round(middle * share))
        break
      case 'color':
        target = Math.max(8, Math.round(middle * share))
        break
      case 'score':
        target = Math.max(800, Math.round(middle * share))
        break
      case 'cascade':
        target = tier < 20 ? 3 : 4
        break
      case 'big':
        target = tier < 25 ? 5 : 6
        break
    }

    const curve = curves[pick]!
    const winIndex = curve.findIndex((value) => value >= target)
    if (winIndex < 0) return null
    const winMoves = winIndex + 1
    // Keep at least a couple of spare moves so three stars is a real target.
    if (winMoves > budget - 2) return null

    const objective: Objective = { kind: family, target, color: family === 'color' ? color : undefined, label: '' }
    objective.label = objectiveLabel(objective)
    const stars: [number, number] = [Math.min(budget, Math.round((winMoves + budget) / 2)), winMoves]
    const solution = runs[pick]!.slice(0, winMoves).map((step) => step.move)
    const candidate: LevelData = {
      id: level,
      world,
      seed: seed + round,
      colors,
      objective,
      moveLimit: budget,
      stars,
      solution,
      solutionMoves: winMoves,
      specials,
      scoreTarget: family === 'score' ? target : 0,
    }

    // The opening board has to be quiet for this exact seed.
    const opening = boardFromLevel(candidate, 8, 8, colors)
    if (findRuns(opening).length > 0 || !hasUsableMove(opening, colors)) return null

    // Proof: rebuild from the stored data and replay the stored moves.
    const replay = new Session({ mode: 'journey', level: candidate, seed: 0 })
    for (const [axis, line, delta] of solution) {
      if (replay.status !== 'playing') break
      replay.move(axis, line, delta)
    }
    if (replay.status === 'won' && replay.movesUsed <= budget && replay.progress().complete) return candidate
    return null
  }

  const attempts: Objective['kind'][] = [kind]
  // Objective families are a preference, not a promise: a seeded board may
  // simply never offer six at once or a four-deep cascade.
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
  await writeFile(new URL('../src/data/journey.json', import.meta.url), JSON.stringify({ version: 1, levels }))
  const kinds = new Map<string, number>()
  for (const level of levels) kinds.set(level.objective.kind, (kinds.get(level.objective.kind) ?? 0) + 1)
  const perMove = levels.reduce((sum, level) => sum + level.objective.target / level.moveLimit, 0) / Math.max(1, levels.length)
  const avgLimit = levels.reduce((sum, level) => sum + level.moveLimit, 0) / Math.max(1, levels.length)
  const avgTarget = levels.reduce((sum, level) => sum + level.objective.target, 0) / Math.max(1, levels.length)
  console.log(`wrote ${levels.length} levels in ${Math.round((Date.now() - started) / 1000)}s`)
  console.log('objectives:', [...kinds.entries()].map(([k, n]) => `${k}:${n}`).join(' '))
  console.log(`average target ${avgTarget.toFixed(0)}, average limit ${avgLimit.toFixed(1)}, target/limit ${perMove.toFixed(1)}`)
}

void main()
