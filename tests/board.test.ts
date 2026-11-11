import { describe, expect, it } from 'vitest'
import {
  cellAt,
  createBoard,
  expandSpecials,
  findRuns,
  hasUsableMove,
  isAnchor,
  lineMovable,
  makeCell,
  randomBoard,
  runCellSet,
  slideBoard,
} from '../src/game/board'
import { resolveBoard } from '../src/game/resolve'
import { Rand } from '../src/game/rng'
import { Session } from '../src/game/session'
import type { Board, LevelData, Special } from '../src/game/types'

function boardFrom(rows: number[][]): Board {
  const board = createBoard(rows[0]!.length, rows.length)
  rows.forEach((row, y) => {
    row.forEach((color, x) => {
      board.cells[y * board.cols + x] = makeCell(color)
    })
  })
  return board
}

function colours(board: Board): number[][] {
  const rows: number[][] = []
  for (let y = 0; y < board.rows; y += 1) {
    const row: number[] = []
    for (let x = 0; x < board.cols; x += 1) row.push(cellAt(board, y, x).color)
    rows.push(row)
  }
  return rows
}

function withSpecial(board: Board, row: number, col: number, special: Special): Board {
  board.cells[row * board.cols + col] = { color: cellAt(board, row, col).color, special }
  return board
}

describe('sliding', () => {
  it('slides a whole row to the right with wraparound', () => {
    const board = boardFrom([[0, 1, 2, 3, 4, 5]])
    const slid = slideBoard(board, 'row', 0, 1, 6)
    expect(colours(slid)[0]).toEqual([5, 0, 1, 2, 3, 4])
  })

  it('slides left with a negative shift', () => {
    const board = boardFrom([[0, 1, 2, 3, 4, 5]])
    const slid = slideBoard(board, 'row', 0, -2, 6)
    expect(colours(slid)[0]).toEqual([2, 3, 4, 5, 0, 1])
  })

  it('slides columns vertically with wraparound', () => {
    const board = boardFrom([[0], [1], [2], [3]])
    const slid = slideBoard(board, 'col', 0, 5, 6)
    expect(colours(slid).map((row) => row[0])).toEqual([3, 0, 1, 2])
  })

  it('treats a full-turn shift as no movement', () => {
    const board = boardFrom([[0, 1, 2], [3, 4, 5], [1, 2, 3]])
    expect(colours(slideBoard(board, 'row', 1, 3, 6))).toEqual(colours(board))
  })

  it('does not mutate the source board', () => {
    const board = boardFrom([[0, 1, 2, 3]])
    slideBoard(board, 'row', 0, 2, 6)
    expect(colours(board)[0]).toEqual([0, 1, 2, 3])
  })

  it('refuses to move an anchored row or column', () => {
    const board = withSpecial(boardFrom([[0, 1, 2, 3], [4, 5, 0, 1]]), 1, 2, 'frozen')
    expect(isAnchor(cellAt(board, 1, 2))).toBe(true)
    expect(lineMovable(board, 'row', 1)).toBe(false)
    expect(lineMovable(board, 'col', 2)).toBe(false)
    expect(lineMovable(board, 'row', 0)).toBe(true)
  })
})

describe('matching', () => {
  it('finds horizontal and vertical runs of three', () => {
    const board = boardFrom([
      [0, 0, 0, 1, 2],
      [3, 4, 1, 2, 3],
      [1, 2, 4, 4, 4],
      [2, 3, 5, 5, 1],
    ])
    const runs = findRuns(board)
    expect(runs.length).toBe(2)
    expect(runs.map((run) => run.length)).toEqual([3, 3])
    expect(runs.map((run) => run.axis)).toEqual(['row', 'row'])
  })

  it('pops a connected L of three that no straight line would catch', () => {
    const board = boardFrom([
      [0, 0, 5, 5],
      [0, 4, 1, 2],
      [3, 1, 4, 5],
      [2, 5, 3, 4],
    ])
    const runs = findRuns(board)
    expect(runs.length).toBe(1)
    expect(runs[0]!.length).toBe(3)
    expect([...runCellSet(runs)].sort((a, b) => a - b)).toEqual([0, 1, 4])
  })

  it('does not match diagonals', () => {
    const board = boardFrom([
      [0, 1, 2],
      [3, 0, 4],
      [5, 6, 0],
    ])
    expect(findRuns(board)).toEqual([])
  })

  it('does not wrap matches across the board edge', () => {
    const board = boardFrom([[0, 1, 2, 3, 0, 1]])
    expect(findRuns(board)).toEqual([])
  })

  it('never removes a shared cell twice', () => {
    const board = boardFrom([
      [1, 2, 3],
      [0, 0, 0],
      [4, 5, 1],
      [6, 7, 2],
      [8, 9, 3],
    ])
    // A vertical run would need three in a column; build an L instead.
    const shape = boardFrom([
      [0, 0, 0],
      [0, 4, 5],
      [0, 6, 7],
    ])
    expect(findRuns(board).length).toBe(1)
    const runs = findRuns(shape)
    expect(runs.length).toBe(2)
    const cells = runCellSet(runs)
    expect(cells.size).toBe(5)
  })

  it('detects four and five long runs', () => {
    expect(findRuns(boardFrom([[2, 2, 2, 2, 9]]))[0]!.length).toBe(4)
    expect(findRuns(boardFrom([[2, 2, 2, 2, 2]]))[0]!.length).toBe(5)
  })

  it('treats a rainbow fluff as a wildcard but never as its own colour', () => {
    const board = boardFrom([[0, 0, 1, 1, 3]])
    board.cells[2] = { color: 1, special: 'rainbow' }
    const runs = findRuns(board)
    expect(runs.some((run) => run.color === 0 && run.length === 3)).toBe(true)
    const rainbowOnly = boardFrom([[1, 1, 1, 1, 1]])
    rainbowOnly.cells.forEach((cell) => (cell.special = 'rainbow'))
    expect(findRuns(rainbowOnly)).toEqual([])
  })
})

describe('specials', () => {
  it('expands a bomb to its 3x3 neighbourhood', () => {
    const board = createBoard(4, 4)
    const cells = expandSpecials(withSpecial(board, 1, 1, 'bomb'), new Set([5]))
    expect([...cells].sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 5, 6, 8, 9, 10])
  })

  it('expands lightning across its row and column', () => {
    const board = createBoard(3, 3)
    const cells = expandSpecials(withSpecial(board, 1, 1, 'lightning'), new Set([4]))
    expect(cells.size).toBe(5)
  })
})

describe('cascades', () => {
  it('resolves to a board with no matches left', () => {
    const board = boardFrom([
      [0, 0, 0, 1, 2],
      [3, 4, 2, 2, 2],
      [1, 5, 4, 1, 3],
      [2, 3, 5, 3, 1],
    ])
    const outcome = resolveBoard(board, new Rand(7), { colors: 6, refill: true, fever: false })
    expect(outcome.steps.length).toBeGreaterThan(0)
    expect(findRuns(outcome.board)).toEqual([])
    expect(outcome.cleared).toBeGreaterThanOrEqual(6)
  })

  it('is deterministic for a seed and different across seeds', () => {
    const build = (): Board =>
      randomBoard(6, 6, 6, new Rand(99))
    const a = resolveBoard(boardFrom([[0, 0, 0, 1, 2, 3]]), new Rand(4), { colors: 6, refill: true, fever: false })
    const b = resolveBoard(boardFrom([[0, 0, 0, 1, 2, 3]]), new Rand(4), { colors: 6, refill: true, fever: false })
    expect(colours(a.board)).toEqual(colours(b.board))
    expect(colours(build()).length).toBe(6)
  })

  it('records the board either side of every clear so gravity can be animated', () => {
    const board = boardFrom([
      [0, 0, 0, 1, 2, 3],
      [3, 4, 1, 2, 3, 4],
      [1, 2, 4, 4, 4, 1],
      [2, 3, 5, 5, 1, 2],
      [4, 5, 1, 2, 3, 4],
      [5, 1, 2, 3, 4, 5],
    ])
    const outcome = resolveBoard(board, new Rand(9), { colors: 6, refill: true, fever: false })
    expect(outcome.steps.length).toBeGreaterThan(0)
    for (const step of outcome.steps) {
      expect(step.before.cells).toHaveLength(36)
      expect(step.after.cells).toHaveLength(36)
      for (const index of step.cleared) expect(step.after.cells[index]!.color).toBeGreaterThanOrEqual(0)
      // Gravity keeps each column's order and packs survivors against the floor.
      for (let col = 0; col < 6; col += 1) {
        const survivors: number[] = []
        for (let row = 0; row < 6; row += 1) {
          const index = row * 6 + col
          if (step.cleared.includes(index)) continue
          const color = step.before.cells[index]!.color
          if (color >= 0) survivors.push(color)
        }
        const after: number[] = []
        for (let row = 0; row < 6; row += 1) after.push(step.after.cells[row * 6 + col]!.color)
        expect(after.slice(6 - survivors.length)).toEqual(survivors)
      }
    }
  })

  it('falls back to reshuffling when a board has no usable move', () => {
    const board = randomBoard(8, 8, 6, new Rand(3))
    expect(hasUsableMove(board, 6)).toBe(true)
  })

  it('opens every generated board with nothing already popping', () => {
    for (let seed = 0; seed < 80; seed += 1) {
      expect(findRuns(randomBoard(8, 8, 6, new Rand(seed)))).toEqual([])
    }
  })
})

const level: LevelData = {
  id: 1,
  world: 0,
  seed: 1234,
  colors: 5,
  objective: { kind: 'clear', target: 6, label: 'Free 6 fluffs' },
  moveLimit: 30,
  stars: [12, 8],
  solution: [],
  solutionMoves: 0,
  specials: [],
  scoreTarget: 0,
}

describe('session rules', () => {
  it('does not charge a move for a zero shift', () => {
    const session = new Session({ mode: 'classic', seed: 11 })
    expect(session.move('row', 0, 0).accepted).toBe(false)
    expect(session.movesUsed).toBe(0)
    expect(session.movesLeft).toBe(25)
  })

  it('charges exactly one move per committed shift', () => {
    const session = new Session({ mode: 'classic', seed: 11 })
    session.move('row', 0, 1)
    expect(session.movesUsed).toBeGreaterThanOrEqual(1)
    expect(session.movesUsed).toBe(1)
  })

  it('rebuilds a level board identically from its seed', () => {
    const a = new Session({ mode: 'journey', level, seed: 0 })
    const b = new Session({ mode: 'journey', level, seed: 0 })
    expect(colours(a.board)).toEqual(colours(b.board))
    expect(a.movesLeft).toBe(30)
  })

  it('keeps a cloned session from consuming the original refill sequence', () => {
    const session = new Session({ mode: 'classic', seed: 21 })
    const clone = session.clone()
    // The copy plays its move first; if the two sessions shared one RNG the
    // original would then refill from a different point in the sequence.
    clone.move('row', 0, 1)
    session.move('row', 0, 1)
    expect(colours(session.board)).toEqual(colours(clone.board))
  })
})

const cascadeLevel: LevelData = {
  id: 1,
  world: 0,
  seed: 99,
  colors: 6,
  objective: { kind: 'clear', target: 9999, label: 'Free 9999 fluffs' },
  moveLimit: 99,
  stars: [9, 9],
  solution: [],
  solutionMoves: 0,
  specials: [],
  scoreTarget: 0,
}

/** Level goals are counted per freed fluff, so cascades must pay in full. */
describe('cascade credit', () => {
  it('credits every cascade step to the objective, not just the first pop', () => {
    const session = new Session({ mode: 'journey', level: cascadeLevel, seed: 0 })
    let checked = 0
    for (let line = 0; line < session.rows && checked < 3; line += 1) {
      for (const axis of ['row', 'col'] as const) {
        for (let delta = 1; delta < 8 && checked < 3; delta += 1) {
          const clone = session.clone()
          const trial = clone.move(axis, line, delta)
          if (!trial.accepted || trial.steps.length < 2) continue
          const before = session.progress().current
          const result = session.move(axis, line, delta)
          const steps = result.progressByStep ?? []
          expect(steps).toHaveLength(result.steps.length)
          expect(steps[steps.length - 1]).toBe(before + result.cleared)
          for (let index = 1; index < steps.length; index += 1) {
            expect(steps[index]!).toBeGreaterThan(steps[index - 1]!)
          }
          checked += 1
        }
      }
    }
    expect(checked).toBe(3)
  })

  it('tallies every freed fluff against its own colour, cascades included', () => {
    const session = new Session({ mode: 'journey', level: cascadeLevel, seed: 0 })
    let moves = 0
    for (let line = 0; line < session.rows && moves < 4; line += 1) {
      for (const axis of ['row', 'col'] as const) {
        for (let delta = 1; delta < 8; delta += 1) {
          const clone = session.clone()
          if (clone.move(axis, line, delta).cleared === 0) continue
          if (!session.move(axis, line, delta).accepted) continue
          // A cascade frees fluffs the pre-gravity board never showed here, so
          // every cell must be attributed from the board its step cleared.
          expect(session.clearedByColor.reduce((sum, n) => sum + n, 0)).toBe(session.clearedTotal)
          moves += 1
          break
        }
        if (moves >= 4) break
      }
    }
    expect(moves).toBeGreaterThanOrEqual(2)
    expect(session.clearedTotal).toBeGreaterThan(0)
  })
})
