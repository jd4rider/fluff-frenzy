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

export function scoreStep(runs: Run[], chain: number, fever: boolean, golden: number): number {
  if (runs.length === 0) return 0
  let base = 0
  for (const run of runs) base += runScore(run.length)
  base += Math.max(0, runs.length - 1) * 75
  base += golden * 250
  const total = base * chainMultiplier(chain) * (fever ? 2 : 1)
  return Math.round(total)
}

export function stepSummary(step: ClearStep): string {
  if (step.runs.length === 0) return ''
  return step.runs.map((run) => `${run.color}:${run.length}`).join(' ')
}
