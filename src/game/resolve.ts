import {
  clearCells,
  expandSpecials,
  findRuns,
  runCellSet,
  settleBoard,
  thawNeighbours,
} from './board'
import type { Rand } from './rng'
import { scoreStep } from './scoring'
import type { Board, ClearStep } from './types'

export interface ResolveOutcome {
  board: Board
  steps: ClearStep[]
  cleared: number
  score: number
  bestRun: number
  chain: number
  golden: number
}

export interface ResolveOptions {
  colors: number
  refill: boolean
  fever: boolean
  /** Hard stop so an unexpected refill loop can never freeze a run. */
  maxChain?: number
}

/**
 * Resolves every match on a board, then lets the survivors fall and refills
 * from the top, repeating while new matches appear. Cells are only ever
 * cleared from the union of the runs, so an intersecting L clears each fluff
 * exactly once.
 */
export function resolveBoard(board: Board, rng: Rand, options: ResolveOptions): ResolveOutcome {
  const working = { cols: board.cols, rows: board.rows, cells: board.cells.map((cell) => ({ ...cell })) }
  const steps: ClearStep[] = []
  let cleared = 0
  let score = 0
  let bestRun = 0
  let golden = 0
  const maxChain = options.maxChain ?? 16

  for (let chain = 1; chain <= maxChain; chain += 1) {
    const runs = findRuns(working)
    if (runs.length === 0) break
    const base = runCellSet(runs)
    const thawed = thawNeighbours(working, base)
    const cells = expandSpecials(working, base)
    const colors = [...new Set(runs.map((run) => run.color))]
    let gold = 0
    for (const index of cells) {
      if (working.cells[index]?.special === 'golden') gold += 1
    }
    const stepScore = scoreStep(runs, chain, options.fever, gold)
    golden += gold
    cleared += cells.size
    score += stepScore
    bestRun = Math.max(bestRun, ...runs.map((run) => run.length))
    steps.push({
      chain,
      runs,
      cleared: [...cells],
      colors,
      score: stepScore,
      thawed,
    })
    clearCells(working, cells)
    settleBoard(working, rng, options.colors, options.refill)
  }

  return { board: working, steps, cleared, score, bestRun, chain: steps.length, golden }
}
