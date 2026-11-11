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
 * Extra moves granted by a clear. Only genuinely big plays refund a move, and
 * never more than one per move, so a strong player can sustain a Classic run
 * without the bank growing without bound.
 */
export function moveBonus(runs: Run[], chain: number): number {
  const bigRun = runs.some((run) => run.length >= 5)
  if (bigRun || chain >= 5) return 1
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
