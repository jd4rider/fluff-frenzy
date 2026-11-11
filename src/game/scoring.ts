import type { ClearStep, Run } from './types'

/** Base award for a run of `length` fluffs. */
export function runScore(length: number): number {
  if (length < 3) return 0
  return [0, 0, 0, 100, 250, 500, 700, 900, 1100][Math.min(length, 8)]!
}

export function chainMultiplier(chain: number): number {
  return Math.min(4, 1 + (chain - 1) * 0.5)
}

/**
 * Extra moves granted by a clear. Only exceptional plays refund a move — a
 * 3x3-sized group or a six-deep cascade — and never more than one per move.
 * The bar has to stay high or every move pays for itself under the flood rule
 * and the move limit stops meaning anything.
 */
export function moveBonus(runs: Run[], chain: number): number {
  const bigRun = runs.some((run) => run.length >= 8)
  if (bigRun || chain >= 6) return 1
  return 0
}

/**
 * A clear is paid for the fluffs it actually removes, so a big connected group
 * beats a handful of small ones and overlapping line/cluster matches in the
 * same step are never paid twice.
 */
export function scoreStep(runs: Run[], chain: number, fever: boolean, golden: number, cleared = 0): number {
  if (runs.length === 0) return 0
  let base = cleared * 22 + runs.length * 45
  base += Math.max(0, runs.length - 1) * 60
  base += golden * 150
  const total = base * chainMultiplier(chain) * (fever ? 2 : 1)
  return Math.round(total)
}

export function stepSummary(step: ClearStep): string {
  if (step.runs.length === 0) return ''
  return step.runs.map((run) => `${run.color}:${run.length}`).join(' ')
}
