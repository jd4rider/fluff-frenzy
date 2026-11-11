import {
  cloneBoard,
  findRuns,
  hasUsableMove,
  lineMovable,
  randomBoard,
  reshuffle,
  slideBoard,
} from './board'
import { Rand } from './rng'
import { moveBonus } from './scoring'
import { resolveBoard } from './resolve'
import type { Axis, Board, LevelData, ModeId, MoveResult, Objective, Special } from './types'

export const FEVER_FULL = 100
export const FEVER_SECONDS = 12

export interface SessionOptions {
  mode: ModeId
  level?: LevelData
  seed: number
  cols?: number
  rows?: number
  colors?: number
  durationMs?: number
  /** Level authoring turns this off so the solver is not paying for it. */
  autoReshuffle?: boolean
}

export interface ObjectiveProgress {
  current: number
  target: number
  label: string
  complete: boolean
}

/**
 * Mode rules, scoring and objectives on top of the pure board. The renderer
 * only ever reads this; it never decides whether a move is legal.
 */
export class Session {
  readonly mode: ModeId
  readonly cols: number
  readonly rows: number
  readonly colors: number
  readonly level?: LevelData
  board: Board
  rng: Rand
  score = 0
  movesLeft = Infinity
  movesUsed = 0
  timeLeftMs = 0
  feverCharge = 40
  feverMs = 0
  fevers = 0
  status: 'playing' | 'won' | 'lost' = 'playing'
  clearedTotal = 0
  clearedByColor: number[] = new Array(6).fill(0)
  bestChain = 0
  bestRun = 0
  moves: [Axis, number, number][] = []
  autoReshuffle = true

  constructor(options: SessionOptions) {
    this.mode = options.mode
    this.cols = options.cols ?? 8
    this.rows = options.rows ?? 8
    this.colors = options.colors ?? options.level?.colors ?? 6
    this.level = options.level
    this.rng = new Rand(options.seed)
    this.autoReshuffle = options.autoReshuffle ?? true
    if (options.level) {
      this.board = boardFromLevel(options.level, this.cols, this.rows, this.colors)
      this.movesLeft = options.level.moveLimit
    } else {
      this.board = randomBoard(this.cols, this.rows, this.colors, this.rng)
      this.movesLeft = options.mode === 'classic' ? 25 : Infinity
      if (options.mode === 'timed') this.timeLeftMs = 120_000
      if (options.mode === 'daily') this.timeLeftMs = 90_000
    }
    if (options.durationMs !== undefined) this.timeLeftMs = options.durationMs
    if (this.mode === 'zen') this.movesLeft = Infinity
    if (!options.level && this.mode === 'journey') this.movesLeft = 25
  }

  get feverActive(): boolean {
    return this.feverMs > 0
  }

  get objective(): Objective | undefined {
    return this.level?.objective
  }

  progress(): ObjectiveProgress {
    const objective = this.objective
    if (!objective) {
      return { current: this.score, target: 0, label: 'Score', complete: false }
    }
    const current = this.objectiveValue(objective)
    return {
      current: Math.min(current, objective.target),
      target: objective.target,
      label: objective.label,
      complete: current >= objective.target,
    }
  }

  private objectiveValue(objective: Objective): number {
    switch (objective.kind) {
      case 'clear':
        return this.clearedTotal
      case 'color':
        return this.clearedByColor[objective.color ?? 0] ?? 0
      case 'score':
        return this.score
      case 'cascade':
        return this.bestChain
      case 'big':
        return this.bestRun
    }
  }

  /** Applies one committed slide. A zero shift is not a move. */
  move(axis: Axis, line: number, delta: number): MoveResult {
    const empty: MoveResult = {
      accepted: false,
      steps: [],
      score: 0,
      cleared: 0,
      bestRun: 0,
      chain: 0,
      board: this.board,
      created: [],
    }
    if (this.status !== 'playing') return { ...empty, reason: 'not-ready' }
    if (delta === 0) return { ...empty, reason: 'zero' }
    if (!lineMovable(this.board, axis, line)) return { ...empty, reason: 'anchored' }
    if (this.movesLeft <= 0) return { ...empty, reason: 'no-moves' }

    const slid = slideBoard(this.board, axis, line, delta, this.colors)
    const outcome = resolveBoard(slid, this.rng, {
      colors: this.colors,
      refill: true,
      fever: this.feverActive,
    })

    this.board = outcome.board
    this.score += outcome.score
    this.clearedTotal += outcome.cleared
    this.bestChain = Math.max(this.bestChain, outcome.chain)
    this.bestRun = Math.max(this.bestRun, outcome.bestRun)
    this.movesUsed += 1
    this.moves.push([axis, line, delta])

    for (const step of outcome.steps) {
      for (const index of step.cleared) {
        const cell = slid.cells[index]
        if (cell && cell.color >= 0) this.clearedByColor[cell.color] = (this.clearedByColor[cell.color] ?? 0) + 1
      }
    }

    if (this.movesLeft !== Infinity) {
      this.movesLeft += moveBonus(
        outcome.steps.flatMap((step) => step.runs),
        outcome.chain,
      )
      this.movesLeft -= 1
      if (this.movesLeft < 0) this.movesLeft = 0
    }

    if (!this.feverActive) {
      this.feverCharge = Math.min(FEVER_FULL, this.feverCharge + Math.round(outcome.cleared * 1.6 + outcome.chain * 8))
      if (this.feverCharge >= FEVER_FULL) {
        this.feverCharge = 0
        this.feverMs = FEVER_SECONDS * 1000
        this.fevers += 1
      }
    } else {
      this.feverCharge = Math.min(FEVER_FULL, this.feverCharge + outcome.cleared)
    }

    if (this.autoReshuffle && !hasUsableMove(this.board, this.colors)) {
      this.board = reshuffle(this.board, this.rng, this.colors)
    }

    this.checkStatus()
    return {
      accepted: true,
      steps: outcome.steps,
      score: outcome.score,
      cleared: outcome.cleared,
      bestRun: outcome.bestRun,
      chain: outcome.chain,
      board: this.board,
      created: [],
    }
  }

  update(dtMs: number): void {
    if (this.status !== 'playing') return
    if (this.feverMs > 0) this.feverMs = Math.max(0, this.feverMs - dtMs)
    if (this.timeLeftMs > 0) {
      this.timeLeftMs = Math.max(0, this.timeLeftMs - dtMs)
      if (this.timeLeftMs === 0) this.checkStatus()
    }
  }

  private checkStatus(): void {
    const progress = this.progress()
    if (this.mode === 'journey' && progress.complete) {
      this.status = 'won'
      return
    }
    if (this.timeLeftMs > 0 && this.timeLeftMs <= 0) {
      this.status = this.mode === 'journey' && progress.complete ? 'won' : 'lost'
      return
    }
    if (this.movesLeft <= 0 && this.mode !== 'zen') {
      this.status = this.mode === 'journey' && progress.complete ? 'won' : 'lost'
    }
  }

  /** Stars are awarded on moves used, so efficiency is the skill ceiling. */
  stars(): number {
    if (!this.level) return 0
    const [two, three] = this.level.stars
    if (this.movesUsed <= three) return 3
    if (this.movesUsed <= two) return 2
    return 1
  }

  hasMatches(): boolean {
    return findRuns(this.board).length > 0
  }

  snapshot(): Board {
    return cloneBoard(this.board)
  }

  /**
   * Deep copy that does not re-run the constructor (which would build a fresh
   * random board) and gets its own RNG state.
   */
  clone(): Session {
    const copy = Object.create(Session.prototype) as Session
    Object.assign(copy, this)
    copy.board = cloneBoard(this.board)
    copy.rng = this.rng.clone()
    copy.clearedByColor = [...this.clearedByColor]
    copy.moves = this.moves.map((move) => [...move] as [Axis, number, number])
    return copy
  }
}

/** Level boards are rebuilt from their seed, then their fixed specials are stamped. */
export function boardFromLevel(level: LevelData, cols: number, rows: number, colors: number): Board {
  const board = randomBoard(cols, rows, colors, new Rand(level.seed))
  for (const entry of level.specials) {
    const cell = board.cells[entry.index]
    if (!cell) continue
    board.cells[entry.index] = { color: cell.color, special: entry.special as Special }
  }
  return board
}
