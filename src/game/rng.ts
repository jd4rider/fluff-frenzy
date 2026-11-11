/**
 * Deterministic PRNG (mulberry32) with clonable state.
 *
 * State has to be clonable because the solver evaluates a candidate move by
 * playing it on a copy of the session; if the copy shared the sequence, merely
 * scoring a candidate would consume the real run's refills and a recorded
 * Journey solution would no longer replay. Board logic is integer-only, so a
 * seeded run reproduces exactly on any machine.
 */
export class Rand {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let value = this.state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  clone(): Rand {
    const copy = new Rand(0)
    copy.state = this.state
    return copy
  }

  /** Test/debug helper: the raw 32-bit state. */
  snapshot(): number {
    return this.state
  }
}

export function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
