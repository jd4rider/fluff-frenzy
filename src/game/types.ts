/** Logical board types. Nothing in this folder imports Phaser. */

export type Axis = 'row' | 'col'

export type Special = 'none' | 'rainbow' | 'bomb' | 'lightning' | 'golden' | 'frozen' | 'locked'

export interface Cell {
  /** Palette index, or -1 when the cell is empty. */
  color: number
  special: Special
}

export interface Board {
  cols: number
  rows: number
  /** Row-major: index = row * cols + col. */
  cells: Cell[]
}

export interface Run {
  axis: Axis
  /** Cell indexes in sweep order. */
  cells: number[]
  color: number
  length: number
}

export interface ClearStep {
  /** 1 for the first match of a move, 2 for the first cascade, and so on. */
  chain: number
  runs: Run[]
  cleared: number[]
  /** Palette index used for the burst colours (the dominant colour of the move). */
  colors: number[]
  score: number
  /** Cells thawed/unlocked by this step's matches. */
  thawed: number[]
  /**
   * The board as the player saw it when this match was found, and the board
   * after gravity and refill. The renderer animates the difference so fluffs
   * visibly fall into the gaps instead of the whole board popping back in.
   */
  before: Board
  after: Board
}

export interface MoveResult {
  accepted: boolean
  /** Reason the move was refused, for HUD feedback. */
  reason?: 'anchored' | 'not-ready' | 'no-moves' | 'zero'
  steps: ClearStep[]
  score: number
  cleared: number
  bestRun: number
  chain: number
  board: Board
  /** Special cells created by this move. */
  created: { index: number; special: Special }[]
  /**
   * Objective total after each cascade step. The first pop and every cascade
   * that follows are credited, so the HUD can count them up as they land.
   */
  progressByStep?: number[]
}

export type ObjectiveKind = 'clear' | 'color' | 'score' | 'cascade' | 'big'

export interface Objective {
  kind: ObjectiveKind
  target: number
  /** Palette index for `color` objectives. */
  color?: number
  label: string
}

export type ModeId = 'classic' | 'timed' | 'zen' | 'journey' | 'daily'

export interface LevelData {
  id: number
  world: number
  seed: number
  colors: number
  objective: Objective
  moveLimit: number
  stars: [number, number]
  /** Verified winning moves: [axis, line, delta]. */
  solution: [Axis, number, number][]
  /** Moves the recorded solution took. */
  solutionMoves: number
  specials: { index: number; special: Special }[]
  scoreTarget: number
}
