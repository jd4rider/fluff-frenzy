import type { Axis, Board, Cell, Run, Special } from './types'
import type { Rand } from './rng'

/** Every playable palette uses six fluff colours. */
export const PALETTE_SIZE = 6

export function makeCell(color: number, special: Special = 'none'): Cell {
  return { color, special }
}

export function emptyCell(): Cell {
  return { color: -1, special: 'none' }
}

export function createBoard(cols: number, rows: number): Board {
  return { cols, rows, cells: Array.from({ length: cols * rows }, () => emptyCell()) }
}

export function cloneBoard(board: Board): Board {
  return { cols: board.cols, rows: board.rows, cells: board.cells.map((cell) => ({ ...cell })) }
}

export function indexOf(board: Board, row: number, col: number): number {
  return row * board.cols + col
}

export function rowOf(board: Board, index: number): number {
  return Math.floor(index / board.cols)
}

export function colOf(board: Board, index: number): number {
  return index % board.cols
}

export function cellAt(board: Board, row: number, col: number): Cell {
  return board.cells[indexOf(board, row, col)]!
}

export function isAnchor(cell: Cell): boolean {
  return cell.special === 'frozen' || cell.special === 'locked'
}

/** True when the row (or column) can be slid: anchors are bolted to the board. */
export function lineMovable(board: Board, axis: Axis, line: number): boolean {
  for (let step = 0; step < (axis === 'row' ? board.cols : board.rows); step += 1) {
    const cell = axis === 'row' ? cellAt(board, line, step) : cellAt(board, step, line)
    if (isAnchor(cell)) return false
  }
  return true
}

/**
 * Slides one full row or column by `delta` cells, wrapping at the edges.
 * Returns a new board; the input board is never mutated.
 */
export function slideBoard(board: Board, axis: Axis, line: number, delta: number, palette: number): Board {
  const next = cloneBoard(board)
  const length = axis === 'row' ? board.cols : board.rows
  const shift = ((delta % length) + length) % length
  if (shift === 0) return next
  for (let step = 0; step < length; step += 1) {
    const from = (step - shift + length) % length
    const source = axis === 'row' ? cellAt(board, line, from) : cellAt(board, from, line)
    const target = axis === 'row' ? indexOf(board, line, step) : indexOf(board, step, line)
    next.cells[target] = { color: source.color, special: source.special }
  }
  void palette
  return next
}

/** Walks one line and returns every maximal same-colour segment. */
function lineRuns(board: Board, axis: Axis, line: number, color: number): Run[] {
  const length = axis === 'row' ? board.cols : board.rows
  const runs: Run[] = []
  let current: number[] = []
  let actual = 0
  const flush = (): void => {
    if (current.length >= 3 && actual >= 2) {
      runs.push({
        axis,
        cells: current.slice(),
        color,
        length: current.length,
      })
    }
    current = []
    actual = 0
  }
  for (let step = 0; step < length; step += 1) {
    const index = axis === 'row' ? indexOf(board, line, step) : indexOf(board, step, line)
    const cell = board.cells[index]!
    const usable = cell.color === color || (cell.special === 'rainbow' && cell.color >= 0)
    if (usable) {
      current.push(index)
      if (cell.special !== 'rainbow') actual += 1
    } else {
      flush()
    }
  }
  flush()
  return runs
}

/** Every same-colour group connected through shared edges (never diagonals). */
function floodColour(board: Board, start: number, color: number, seen: Set<number>): number[] {
  const group: number[] = []
  const queue = [start]
  seen.add(start)
  while (queue.length > 0) {
    const index = queue.pop()!
    group.push(index)
    const row = rowOf(board, index)
    const col = colOf(board, index)
    const neighbours = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ] as const
    for (const [r, c] of neighbours) {
      if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) continue
      const next = indexOf(board, r, c)
      if (seen.has(next)) continue
      const cell = board.cells[next]!
      // A rainbow only joins a group through its line wildcard.
      if (cell.color !== color || cell.special === 'rainbow') continue
      seen.add(next)
      queue.push(next)
    }
  }
  return group
}

/**
 * Finds every match on the board. As in Chuzzle, a match is any connected
 * group of three or more same-coloured fluffs: a straight line, an L, a T or a
 * blob, always through shared edges and never diagonally. Line sweeps run first
 * so a rainbow wildcard keeps its line power, and a group already covered by
 * those sweeps is not counted twice. Matching never wraps around the board
 * edge; only movement does.
 */
export function findRuns(board: Board): Run[] {
  const runs: Run[] = []
  for (let row = 0; row < board.rows; row += 1) {
    for (let color = 0; color < PALETTE_SIZE; color += 1) runs.push(...lineRuns(board, 'row', row, color))
  }
  for (let col = 0; col < board.cols; col += 1) {
    for (let color = 0; color < PALETTE_SIZE; color += 1) runs.push(...lineRuns(board, 'col', col, color))
  }

  const covered = runCellSet(runs)
  const seen = new Set<number>()
  for (let index = 0; index < board.cells.length; index += 1) {
    if (seen.has(index)) continue
    const cell = board.cells[index]!
    if (cell.color < 0 || cell.special === 'rainbow') continue
    const group = floodColour(board, index, cell.color, seen)
    if (group.length < 3) continue
    if (group.every((cell) => covered.has(cell))) continue
    runs.push({ axis: 'row', cells: group, color: cell.color, length: group.length })
  }
  return runs
}

/** Union of every run's cells, so an intersecting L only clears each cell once. */
export function runCellSet(runs: Run[]): Set<number> {
  const set = new Set<number>()
  for (const run of runs) for (const index of run.cells) set.add(index)
  return set
}

/**
 * Expands a cleared set with special-cell effects: bombs take their 3x3
 * neighbourhood, lightning takes its whole row and column, and anchors break
 * only when they are directly cleared.
 */
export function expandSpecials(board: Board, cells: Set<number>): Set<number> {
  const expanded = new Set<number>(cells)
  let added = true
  while (added) {
    added = false
    for (const index of [...expanded]) {
      const cell = board.cells[index]!
      if (cell.special === 'bomb') {
        const row = rowOf(board, index)
        const col = colOf(board, index)
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const r = row + dr
            const c = col + dc
            if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) continue
            const target = indexOf(board, r, c)
            if (!expanded.has(target)) {
              expanded.add(target)
              added = true
            }
          }
        }
      } else if (cell.special === 'lightning') {
        const row = rowOf(board, index)
        const col = colOf(board, index)
        for (let c = 0; c < board.cols; c += 1) {
          const target = indexOf(board, row, c)
          if (!expanded.has(target)) {
            expanded.add(target)
            added = true
          }
        }
        for (let r = 0; r < board.rows; r += 1) {
          const target = indexOf(board, r, col)
          if (!expanded.has(target)) {
            expanded.add(target)
            added = true
          }
        }
      }
    }
  }
  return expanded
}

/** A match next to ice thaws it; the ice layer disappears, the fluff stays. */
export function thawNeighbours(board: Board, cells: Set<number>): number[] {
  const thawed: number[] = []
  for (const index of cells) {
    const row = rowOf(board, index)
    const col = colOf(board, index)
    const neighbours = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ] as const
    for (const [r, c] of neighbours) {
      if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) continue
      const target = indexOf(board, r, c)
      const cell = board.cells[target]!
      if (cell.special === 'frozen' || cell.special === 'locked') {
        board.cells[target] = { color: cell.color, special: 'none' }
        thawed.push(target)
      }
    }
  }
  return thawed
}

export function clearCells(board: Board, cells: Set<number>): void {
  for (const index of cells) board.cells[index] = emptyCell()
}

/**
 * Applies gravity per column and refills from the top. Returns the cells that
 * were filled so the renderer can animate them entering.
 */
export function settleBoard(board: Board, rng: Rand, colors: number, refill: boolean): number[] {
  const filled: number[] = []
  for (let col = 0; col < board.cols; col += 1) {
    const column: Cell[] = []
    for (let row = board.rows - 1; row >= 0; row -= 1) {
      const cell = cellAt(board, row, col)
      if (cell.color >= 0) column.push(cell)
    }
    while (column.length < board.rows && refill) {
      column.push(makeCell(pickColor(rng, colors)))
      filled.push(indexOf(board, board.rows - column.length, col))
    }
    for (let row = 0; row < board.rows; row += 1) {
      const source = column[board.rows - 1 - row]
      board.cells[indexOf(board, row, col)] = source ?? emptyCell()
    }
  }
  return filled
}

function pickColor(rng: Rand, colors: number): number {
  return Math.min(colors - 1, Math.floor(rng.next() * colors))
}

/** True when putting `color` here would make a same-colour group of three. */
function wouldFormGroup(board: Board, row: number, col: number, color: number): boolean {
  const neighbours = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ] as const
  const seen = new Set<number>()
  let size = 1
  for (const [r, c] of neighbours) {
    if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) continue
    const index = indexOf(board, r, c)
    if (seen.has(index)) continue
    if (board.cells[index]!.color !== color) continue
    size += floodColour(board, index, color, seen).length
  }
  return size >= 3
}

/**
 * A board that opens quiet: no line of three and no connected group of three,
 * so the first pop is always the one the player just made.
 */
export function randomBoard(cols: number, rows: number, colors: number, rng: Rand): Board {
  const board = createBoard(cols, rows)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const order: number[] = []
      for (let color = 0; color < colors; color += 1) order.push(color)
      for (let index = order.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(rng.next() * (index + 1))
        ;[order[index], order[swap]] = [order[swap]!, order[index]!]
      }
      let chosen = -1
      for (const color of order) {
        if (wouldFormGroup(board, row, col, color)) continue
        chosen = color
        break
      }
      if (chosen < 0) chosen = pickColor(rng, colors)
      board.cells[indexOf(board, row, col)] = makeCell(Math.min(colors - 1, chosen))
    }
  }
  return board
}

/** True when at least one legal slide would create a match. */
export function hasUsableMove(board: Board, colors: number): boolean {
  for (let line = 0; line < board.rows; line += 1) {
    if (!lineMovable(board, 'row', line)) continue
    for (let delta = 1; delta < board.cols; delta += 1) {
      if (findRuns(slideBoard(board, 'row', line, delta, colors)).length > 0) return true
    }
  }
  for (let line = 0; line < board.cols; line += 1) {
    if (!lineMovable(board, 'col', line)) continue
    for (let delta = 1; delta < board.rows; delta += 1) {
      if (findRuns(slideBoard(board, 'col', line, delta, colors)).length > 0) return true
    }
  }
  return false
}

/**
 * Re-shuffles the colours of ordinary cells until a move exists again, keeping
 * specials and anchors exactly where they were.
 */
export function reshuffle(board: Board, rng: Rand, colors: number): Board {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const next = cloneBoard(board)
    const slots: number[] = []
    const pool: number[] = []
    for (let index = 0; index < next.cells.length; index += 1) {
      const cell = next.cells[index]!
      if (cell.color < 0 || cell.special !== 'none') continue
      slots.push(index)
      pool.push(cell.color)
    }
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng.next() * (index + 1))
      const temp = pool[index]!
      pool[index] = pool[swap]!
      pool[swap] = temp
    }
    slots.forEach((slot, order) => {
      next.cells[slot] = { color: pool[order]!, special: 'none' }
    })
    if (findRuns(next).length === 0 && hasUsableMove(next, colors)) return next
  }
  return board
}
