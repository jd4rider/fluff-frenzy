import Phaser from 'phaser'
import { sound } from '../core/audio'
import { save } from '../core/saves'
import journey from '../data/journey.json'
import { WORLDS } from '../data/worlds'
import { bestMove } from '../game/solver'
import { Session } from '../game/session'
import type { Axis, Board, ClearStep, LevelData, ModeId, Special } from '../game/types'
import { Backdrop } from './Backdrop'
import {
  DESIGN_H,
  DESIGN_W,
  boardLayout,
  designStage,
  isCoarsePointer,
} from './layout'
import {
  button,
  display,
  fadeIn,
  fadeTo,
  formatClock,
  formatNumber,
  hex,
  iconButton,
  label,
  panel,
  toast,
} from './common'
import { FLUFFS } from './textures'

interface JourneyFile {
  version: number
  levels: LevelData[]
}

const LEVELS = (journey as unknown as JourneyFile).levels

const MODE_TITLES: Record<ModeId, string> = {
  classic: 'CLASSIC ARCADE',
  timed: 'TIMED FRENZY',
  zen: 'ZEN GARDEN',
  journey: 'PUZZLE JOURNEY',
  daily: 'DAILY CHALLENGE',
}

interface Tile {
  main: Phaser.GameObjects.Image
  ghost: Phaser.GameObjects.Image
  badge: Phaser.GameObjects.Image
  ghostBadge: Phaser.GameObjects.Image
}

interface DragState {
  axis: Axis
  line: number
  startX: number
  startY: number
  delta: number
  locked: boolean
}

interface BoardPayload {
  mode: ModeId
  levelId?: number
}

/**
 * Gameplay. The simulation owns every rule; this scene only renders snapshots,
 * turns drags into a committed delta, and animates the result.
 */
export class GameScene extends Phaser.Scene {
  private stage!: ReturnType<typeof designStage>
  private backdrop!: Backdrop
  private session!: Session
  private mode: ModeId = 'classic'
  private level?: LevelData
  private layout = boardLayout()
  private boardLayer!: Phaser.GameObjects.Container
  private tileLayer!: Phaser.GameObjects.Container
  private tiles: Tile[] = []
  private drag: DragState | null = null
  private busy = false
  private paused = false
  private cursor = { row: 3, col: 3 }
  private pausePanel: Phaser.GameObjects.Container | null = null
  private scoreText!: Phaser.GameObjects.Text
  private movesText!: Phaser.GameObjects.Text
  private objectiveText!: Phaser.GameObjects.Text
  private objectiveBar!: Phaser.GameObjects.Graphics
  private objectiveIcon?: Phaser.GameObjects.Image
  private feverBar!: Phaser.GameObjects.Graphics
  private feverLabel!: Phaser.GameObjects.Text
  private chainLabel!: Phaser.GameObjects.Text
  private hintLines!: Phaser.GameObjects.Graphics
  private maskShape?: Phaser.GameObjects.Graphics
  private hintsLeft = 3
  private elapsed = 0
  private blinkTimer = 0
  private feverBanner: Phaser.GameObjects.Container | null = null
  private quality: 'low' | 'medium' | 'high' = 'high'
  private reducedMotion = false

  constructor() {
    super('Game')
  }

  create(data: BoardPayload): void {
    fadeIn(this)
    this.stage = designStage(this)
    this.mode = data.mode ?? 'classic'
    this.level = this.mode === 'journey' ? LEVELS[(data.levelId ?? 1) - 1] : undefined
    const settings = save().settings
    this.quality = settings.quality
    this.reducedMotion = settings.reducedMotion

    const worldId =
      this.mode === 'journey'
        ? Math.floor(((data.levelId ?? 1) - 1) / 50)
        : Math.floor(Math.random() * WORLDS.length)
    this.backdrop = new Backdrop(this, WORLDS[worldId]!, { dim: 0.42 })
    this.stage.root.add(this.backdrop.container)

    const seed = this.mode === 'daily' ? dailySeedNumber() : Math.floor(Math.random() * 0xffffffff)
    this.session = new Session({
      mode: this.mode,
      level: this.level,
      seed,
      durationMs: this.mode === 'timed' ? 120_000 : this.mode === 'daily' ? 90_000 : undefined,
    })

    this.buildHud()
    this.buildBoard()
    this.renderBoard(this.session.board)
    this.bindInput()

    sound.startMusic('play')
    if (this.mode === 'journey' && this.level) {
      toast(this, this.level.objective.label, '#ffe066', 214, 2200)
    }

    this.scale.on(Phaser.Scale.Events.RESIZE, this.paintBoardMask, this)
    document.body.classList.add('ff-playing')
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      sound.stopMusic()
      this.backdrop.destroy()
      this.input.removeAllListeners()
      this.scale.off(Phaser.Scale.Events.RESIZE, this.paintBoardMask, this)
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this)
      document.body.classList.remove('ff-playing')
    })
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this)
  }

  private onBlur(): void {
    if (!this.paused && this.session.status === 'playing') this.setPaused(true)
  }

  private buildHud(): void {
    const root = this.stage.root
    root.add(label(this, 32, 26, MODE_TITLES[this.mode], 13, '#ffe066', { fontStyle: 'bold', letterSpacing: 1.6 }))
    const subtitle =
      this.mode === 'journey' && this.level
        ? `WORLD ${this.level.world + 1} \u00b7 LEVEL ${this.level.id}`
        : this.mode === 'daily'
          ? 'ONE SEEDED PUZZLE PER DAY'
          : 'SLIDE ANY ROW OR COLUMN'
    root.add(label(this, 32, 46, subtitle, 11, '#ffffff', { alpha: 0.6, letterSpacing: 1 }))
    root.add(iconButton(this, DESIGN_W - 46, 44, '\u2016', () => this.setPaused(true), { size: 48, fill: '#1b2547' }))

    this.scoreText = display(this, DESIGN_W / 2, 106, '0', 52, '#ffffff', 0.5)
    root.add(this.scoreText)
    root.add(label(this, DESIGN_W / 2, 140, 'SCORE', 10, '#ffe066', { origin: 0.5, fontStyle: 'bold', letterSpacing: 1.6 }))

    this.movesText = label(this, DESIGN_W - 32, 96, '', 20, '#ffffff', {
      origin: [1, 0],
      fontStyle: 'bold',
      align: 'right',
    })
    root.add(this.movesText)

    const chip = panel(this, 32, 176, DESIGN_W - 64, 78, {
      fill: '#131c38',
      side: '#070b16',
      radius: 22,
      stroke: '#ffe066',
      strokeAlpha: 0.3,
    })
    root.add(chip)
    this.objectiveText = label(this, 20, 14, '', 15, '#ffffff', { fontStyle: 'bold' })
    chip.add(this.objectiveText)
    this.objectiveBar = this.add.graphics()
    chip.add(this.objectiveBar)
    if (this.level && this.level.objective.kind === 'color') {
      this.objectiveIcon = this.add.image(DESIGN_W - 74, 39, `fluff-${this.level.objective.color ?? 0}`).setScale(0.3)
      chip.add(this.objectiveIcon)
    }

    this.buildFeverBar()
    this.chainLabel = display(this, DESIGN_W / 2, 560, '', 46, '#ffe066', 0.5).setAlpha(0)
    root.add(this.chainLabel)
    this.hintLines = this.add.graphics()
    root.add(this.hintLines)

    const hint = iconButton(this, DESIGN_W - 62, DESIGN_H - 78, '\u2600', () => this.useHint(), {
      size: 50,
      fill: '#1b2547',
      caption: 'HINT',
    })
    root.add(hint)
    root.add(
      label(this, 32, DESIGN_H - 64, isCoarsePointer() ? 'Drag a row or column to slide it' : 'Drag, or use arrow keys / WASD', 11, '#ffffff', {
        alpha: 0.55,
      }),
    )
  }

  private buildFeverBar(): void {
    const root = this.stage.root
    this.feverLabel = label(this, 32, DESIGN_H - 122, 'FLUFF FEVER', 11, '#ff8bf0', { fontStyle: 'bold', letterSpacing: 1.4 })
    root.add(this.feverLabel)
    this.feverBar = this.add.graphics()
    root.add(this.feverBar)
  }

  private buildBoard(): void {
    this.layout = boardLayout(288, 1008, 616)
    const { left, top, size } = this.layout
    const frame = this.add.graphics()
    frame.fillStyle(0x0a1224, 0.72)
    frame.fillRoundedRect(left - 14, top - 14, size + 28, size + 28, 34)
    frame.lineStyle(5, 0xffffff, 0.16)
    frame.strokeRoundedRect(left - 14, top - 14, size + 28, size + 28, 34)
    frame.lineStyle(2, 0xffe066, 0.22)
    frame.strokeRoundedRect(left - 8, top - 8, size + 16, size + 16, 28)
    this.stage.root.add(frame)

    this.boardLayer = this.add.container(0, 0)
    this.stage.root.add(this.boardLayer)
    this.maskShape = this.make.graphics({ x: 0, y: 0 })
    this.boardLayer.setMask(this.maskShape.createGeometryMask())
    this.paintBoardMask()

    this.tileLayer = this.add.container(0, 0)
    this.boardLayer.add(this.tileLayer)

    // The checkerboard sits under the fluffs, never over them.
    const shade = this.add.graphics()
    this.tileLayer.add(shade)
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if ((row + col) % 2 === 0) continue
        shade.fillStyle(0xffffff, 0.035)
        shade.fillRect(left + col * this.layout.cell, top + row * this.layout.cell, this.layout.cell, this.layout.cell)
      }
      void row
    }

    for (let index = 0; index < 64; index += 1) {
      const main = this.add.image(0, 0, 'fluff-0')
      const ghost = this.add.image(0, 0, 'fluff-0').setAlpha(0)
      const badge = this.add.image(0, 0, 'special-rainbow').setAlpha(0)
      const ghostBadge = this.add.image(0, 0, 'special-rainbow').setAlpha(0)
      this.tileLayer.add([main, ghost, ghostBadge, badge])
      this.tiles.push({ main, ghost, badge, ghostBadge })
    }
  }

  /**
   * The stage is scaled to the viewport, so the board mask has to be drawn in
   * screen coordinates and repainted whenever that transform changes.
   */
  private paintBoardMask(): void {
    if (!this.maskShape) return
    const { left, top, size } = this.layout
    const root = this.stage.root
    const scale = this.stage.scale
    const graphics = this.maskShape
    graphics.clear()
    graphics.fillStyle(0xffffff)
    graphics.fillRoundedRect(
      root.x + left * scale,
      root.y + top * scale,
      size * scale,
      size * scale,
      18 * scale,
    )
  }

  /** Draws a board instantly. Motion is owned by the step animator below. */
  private renderBoard(board: Board): void {
    const { cell } = this.layout
    const baseScale = (cell * 0.94) / 128
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const index = row * 8 + col
        const tile = this.tiles[index]!
        const data = board.cells[index]!
        const x = this.layout.left + col * cell + cell / 2
        const y = this.layout.top + row * cell + cell / 2
        const filled = data.color >= 0
        if (filled) tile.main.setTexture(`fluff-${data.color}`)
        tile.main
          .setPosition(x, y)
          .setScale(baseScale)
          .setAngle(0)
          .setAlpha(filled ? 1 : 0)
          .setVisible(filled)
        tile.ghost.setPosition(x, y).setScale(baseScale).setVisible(false).setAlpha(0)
        this.applyBadge(tile.badge, data.special, cell, x, y)
        tile.ghostBadge.setVisible(false).setAlpha(0)
      }
    }
  }

  private applyBadge(badge: Phaser.GameObjects.Image, special: Special, cell: number, x: number, y: number): void {
    if (special === 'none') {
      badge.setVisible(false).setAlpha(0)
      return
    }
    badge.setTexture(`special-${special}`)
    badge.setPosition(x, y)
    badge.setScale((cell * (special === 'rainbow' ? 1.02 : 0.9)) / 128)
    badge.setAlpha(special === 'rainbow' ? 0.45 : 0.95)
    badge.setVisible(true)
  }

  private bindInput(): void {
    const zone = this.add
      .zone(this.layout.left, this.layout.top, this.layout.size, this.layout.size)
      .setOrigin(0)
      .setInteractive()
    this.stage.root.add(zone)

    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(pointer))
    zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.updateCursor(pointer)
      if (this.drag) this.moveDrag(pointer)
    })
    zone.on('pointerup', () => this.endDrag())
    zone.on('pointerupoutside', () => this.endDrag())
    zone.on('pointerout', () => {
      if (this.drag && !this.input.activePointer.isDown) this.endDrag()
    })
    this.input.on('pointerup', () => this.endDrag())

    const keyboard = this.input.keyboard
    if (keyboard) {
      keyboard.on('keydown-LEFT', () => this.keyboardSlide('row', -1))
      keyboard.on('keydown-A', () => this.keyboardSlide('row', -1))
      keyboard.on('keydown-RIGHT', () => this.keyboardSlide('row', 1))
      keyboard.on('keydown-D', () => this.keyboardSlide('row', 1))
      keyboard.on('keydown-UP', () => this.keyboardSlide('col', -1))
      keyboard.on('keydown-W', () => this.keyboardSlide('col', -1))
      keyboard.on('keydown-DOWN', () => this.keyboardSlide('col', 1))
      keyboard.on('keydown-S', () => this.keyboardSlide('col', 1))
      keyboard.on('keydown-R', () => this.scene.restart({ mode: this.mode, levelId: this.level?.id }))
      keyboard.on('keydown-P', () => this.setPaused(!this.paused))
      keyboard.on('keydown-ESC', () => this.setPaused(!this.paused))
    }
  }

  private updateCursor(pointer: Phaser.Input.Pointer): void {
    const x = pointer.worldX - this.stage.root.x
    const y = pointer.worldY - this.stage.root.y
    const scale = this.stage.scale
    const localX = x / scale
    const localY = y / scale
    const col = Math.floor((localX - this.layout.left) / this.layout.cell)
    const row = Math.floor((localY - this.layout.top) / this.layout.cell)
    if (row >= 0 && row < 8 && col >= 0 && col < 8) {
      this.cursor = { row, col }
    }
  }

  private localPointer(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return {
      x: (pointer.worldX - this.stage.root.x) / this.stage.scale,
      y: (pointer.worldY - this.stage.root.y) / this.stage.scale,
    }
  }

  private beginDrag(pointer: Phaser.Input.Pointer): void {
    if (this.busy || this.paused || this.session.status !== 'playing') return
    this.updateCursor(pointer)
    const local = this.localPointer(pointer)
    this.drag = {
      axis: 'row',
      line: this.cursor.row,
      startX: local.x,
      startY: local.y,
      delta: 0,
      locked: false,
    }
  }

  private moveDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.drag || this.busy) return
    const local = this.localPointer(pointer)
    const dx = local.x - this.drag.startX
    const dy = local.y - this.drag.startY
    if (!this.drag.locked) {
      const threshold = this.layout.cell * 0.22
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
      this.drag.locked = true
      this.drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'row' : 'col'
      this.drag.line = this.drag.axis === 'row' ? this.cursor.row : this.cursor.col
      sound.slide()
    }
    const raw = this.drag.axis === 'row' ? dx : dy
    this.drag.delta = raw / this.layout.cell
    this.positionDragLine(this.drag.axis, this.drag.line, this.drag.delta)
  }

  /** Positions every fluff in the dragged line with a seamless wrap. */
  private positionDragLine(axis: Axis, line: number, delta: number): void {
    const { cell, left, top, size } = this.layout
    const offsetX = axis === 'row' ? delta * cell : 0
    const offsetY = axis === 'col' ? delta * cell : 0
    for (let slot = 0; slot < 8; slot += 1) {
      const row = axis === 'row' ? line : slot
      const col = axis === 'row' ? slot : line
      const tile = this.tiles[row * 8 + col]!
      const baseX = left + col * cell + cell / 2
      const baseY = top + row * cell + cell / 2
      let x = baseX + offsetX
      let y = baseY + offsetY
      const spanX = axis === 'row' ? size : 0
      const spanY = axis === 'col' ? size : 0
      if (spanX) x = left + ((((x - left) % spanX) + spanX) % spanX)
      if (spanY) y = top + ((((y - top) % spanY) + spanY) % spanY)
      tile.main.setPosition(x, y)
      tile.main.setAngle(Phaser.Math.Clamp(delta * (axis === 'row' ? 6 : 0), -10, 10))
      // A second copy one board-width away fills the gap at the wrapping edge.
      // Anything outside the mask is clipped, so this costs nothing visually.
      tile.ghost.setTexture(tile.main.texture.key).setScale(tile.main.scaleX, tile.main.scaleY)
      tile.ghost.setAngle(tile.main.angle)
      if (spanX) {
        tile.ghost.setPosition(x < left + size / 2 ? x + spanX : x - spanX, y)
      } else {
        tile.ghost.setPosition(x, y < top + size / 2 ? y + spanY : y - spanY)
      }
      tile.ghost.setVisible(true).setAlpha(1)
      tile.badge.setPosition(x, y)
      tile.badge.setAngle(tile.main.angle)
    }
  }

  private endDrag(): void {
    if (!this.drag || this.busy) return
    const drag = this.drag
    this.drag = null
    if (!drag.locked) return
    const snapped = Math.round(drag.delta)
    const shift = ((snapped % 8) + 8) % 8
    if (shift === 0) {
      this.tweens.add({
        targets: this.tiles.map((tile) => tile.main),
        angle: 0,
        duration: 120,
      })
      this.renderBoard(this.session.board)
      return
    }
    this.positionDragLine(drag.axis, drag.line, snapped)
    sound.snap()
    this.commitMove(drag.axis, drag.line, shift)
  }

  private keyboardSlide(axis: Axis, direction: 1 | -1): void {
    if (this.busy || this.paused || this.session.status !== 'playing') return
    const line = axis === 'row' ? this.cursor.row : this.cursor.col
    this.commitMove(axis, line, direction)
  }

  /** Commits a move, then animates every cascade step in order. */
  private commitMove(axis: Axis, line: number, delta: number): void {
    if (this.busy) return
    const result = this.session.move(axis, line, delta)
    if (!result.accepted) {
      if (result.reason === 'anchored') toast(this, 'That line is anchored by an icy fluff', '#8fd7ff', 240, 1200)
      this.renderBoard(this.session.board)
      return
    }
    this.busy = true
    this.clearHint()
    this.updateHud()

    const scoreBefore = this.session.score - result.score
    if (result.score > 0) this.bumpScore(scoreBefore, this.session.score)
    const chain = chainWord(result.chain, result.bestRun)
    if (chain) this.showChain(chain, result.chain)
    if (result.chain >= 3 && !this.reducedMotion) this.cameras.main.shake(110, 0.0035)

    // Re-sync the tile views to the board exactly as it stood after the slide,
    // so the first pop animates the fluffs the player can actually see.
    const first = result.steps[0]
    this.renderBoard(first ? first.before : this.session.board)

    this.playSteps(result.steps, 0, () => {
      this.renderBoard(this.session.board)
      this.busy = false
      this.updateHud()
      if (this.session.feverMs > 0 && !this.feverBanner) this.enterFever()
      if (this.session.status !== 'playing') this.finish()
    })
  }

  /** Pops one match, then lets the survivors fall and the refill drop in. */
  private playSteps(steps: ClearStep[], index: number, done: () => void): void {
    if (index >= steps.length) {
      done()
      return
    }
    const step = steps[index]!
    const cleared = [...new Set(step.cleared)]
    const { cell } = this.layout
    const pop = this.reducedMotion ? 60 : 160
    let popped = 0
    for (const cellIndex of cleared) {
      const tile = this.tiles[cellIndex]
      if (!tile) continue
      const x = this.layout.left + (cellIndex % 8) * cell + cell / 2
      const y = this.layout.top + Math.floor(cellIndex / 8) * cell + cell / 2
      this.burst(x, y, step.before.cells[cellIndex]?.color ?? 0)
      if (!tile.main.visible) continue
      popped += 1
      this.tweens.add({
        targets: tile.main,
        scaleX: 0.12,
        scaleY: 0.12,
        alpha: 0,
        angle: Phaser.Math.Between(-35, 35),
        duration: pop,
        ease: 'Back.In',
        onComplete: () => tile.main.setVisible(false),
      })
      this.tweens.add({ targets: tile.badge, alpha: 0, duration: pop })
    }
    if (popped > 0) sound.pop(step.chain)
    if (step.score > 0) this.floatScore(step.score, step.chain)

    this.time.delayedCall(pop + 30, () => this.settleStep(step, () => this.playSteps(steps, index + 1, done)))
  }

  /**
   * Gravity, animated per column: surviving fluffs tween down into the gaps and
   * the refilled fluffs drop in from above the board frame.
   */
  private settleStep(step: ClearStep, done: () => void): void {
    const { cell, top, left } = this.layout
    const cleared = new Set(step.cleared)
    const free = [...cleared].map((cellIndex) => this.tiles[cellIndex]).filter((tile): tile is Tile => Boolean(tile))
    const next: Tile[] = new Array<Tile>(64)
    const falls: { tile: Tile; x: number; y: number }[] = []

    for (let col = 0; col < 8; col += 1) {
      const survivors: { row: number; tile: Tile }[] = []
      for (let row = 7; row >= 0; row -= 1) {
        const cellIndex = row * 8 + col
        if (cleared.has(cellIndex)) continue
        const data = step.before.cells[cellIndex]
        if (!data || data.color < 0) continue
        survivors.push({ row, tile: this.tiles[cellIndex]! })
      }
      survivors.forEach((survivor, order) => {
        const targetRow = 7 - order
        next[targetRow * 8 + col] = survivor.tile
        if (targetRow === survivor.row) return
        falls.push({ tile: survivor.tile, x: left + col * cell + cell / 2, y: top + targetRow * cell + cell / 2 })
      })

      // Refill enters from above the frame, one cell per empty slot.
      const newCount = 8 - survivors.length
      for (let row = 0; row < newCount; row += 1) {
        const cellIndex = row * 8 + col
        const data = step.after.cells[cellIndex]
        if (!data || data.color < 0) continue
        const tile = free.pop() ?? this.tiles[cellIndex]!
        next[cellIndex] = tile
        const x = left + col * cell + cell / 2
        const startY = top + (row - newCount) * cell + cell / 2
        tile.main
          .setTexture(`fluff-${data.color}`)
          .setPosition(x, startY)
          .setScale((cell * 0.94) / 128)
          .setAngle(0)
          .setAlpha(1)
          .setVisible(true)
        tile.badge.setVisible(false).setAlpha(0)
        falls.push({ tile, x, y: top + row * cell + cell / 2 })
      }
    }

    const duration = this.reducedMotion ? 110 : 270
    falls.forEach((fall, order) => {
      fall.tile.ghost.setVisible(false)
      fall.tile.ghostBadge.setVisible(false)
      this.tweens.add({
        targets: fall.tile.main,
        x: fall.x,
        y: fall.y,
        duration,
        delay: Math.min(90, order * 6),
        ease: 'Quad.In',
      })
      if (fall.tile.badge.visible) {
        this.tweens.add({ targets: fall.tile.badge, x: fall.x, y: fall.y, duration, delay: Math.min(90, order * 6), ease: 'Quad.In' })
      }
    })

    this.time.delayedCall(duration + 110, () => {
      this.tiles = next.map((tile, cellIndex) => tile ?? this.tiles[cellIndex]!)
      this.renderBoard(step.after)
      done()
    })
  }

  private floatScore(score: number, chain: number): void {
    const text = label(this, DESIGN_W / 2, this.layout.top + 70, `+${formatNumber(score)}`, 26, chain >= 3 ? '#ff8bf0' : '#ffe066', {
      origin: 0.5,
      fontStyle: 'bold',
    })
    this.stage.root.add(text)
    this.tweens.add({ targets: text, y: text.y - 66, alpha: 0, duration: 760, ease: 'Quad.Out', onComplete: () => text.destroy() })
  }

  private burst(x: number, y: number, color: number): void {
    const palette = FLUFFS[color] ?? FLUFFS[0]!
    const tint = hex(palette.base)
    const amount = this.quality === 'low' ? 4 : this.quality === 'medium' ? 7 : 11
    for (let index = 0; index < amount; index += 1) {
      const spark = this.add.image(x, y, 'spark').setTint(tint).setDepth(40)
      spark.setScale(0.35 + Math.random() * 0.35)
      const angle = Math.random() * Math.PI * 2
      const distance = 30 + Math.random() * 60
      this.stage.root.add(spark)
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.05,
        duration: 340 + Math.random() * 220,
        ease: 'Quad.Out',
        onComplete: () => spark.destroy(),
      })
    }
    if (this.reducedMotion || this.quality === 'low') return
    const ring = this.add.image(x, y, 'ring').setTint(tint).setScale(0.2).setAlpha(0.7).setDepth(39)
    this.stage.root.add(ring)
    this.tweens.add({
      targets: ring,
      scale: 0.9,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    })
  }

  private bumpScore(from: number, to: number): void {
    const counter = { value: from }
    this.tweens.add({
      targets: counter,
      value: to,
      duration: 320,
      onUpdate: () => {
        this.scoreText.setText(formatNumber(counter.value))
      },
    })
    this.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.08, to: 1 },
      duration: 220,
    })
  }

  private showChain(text: string, chain: number): void {
    this.chainLabel.setText(text)
    this.chainLabel.setColor(chain >= 4 ? '#ff8bf0' : '#ffe066')
    this.chainLabel.setAlpha(1)
    this.chainLabel.setScale(0.7)
    this.tweens.add({
      targets: this.chainLabel,
      scale: 1,
      duration: 220,
      ease: 'Back.Out',
    })
    this.tweens.add({
      targets: this.chainLabel,
      alpha: 0,
      y: 480,
      delay: 520,
      duration: 320,
      onComplete: () => this.chainLabel.setY(520),
    })
  }

  private enterFever(): void {
    sound.fever()
    sound.startMusic('fever')
    const banner = this.add.container(DESIGN_W / 2, 292).setDepth(4000)
    const bg = panel(this, -220, -34, 440, 68, {
      fill: '#47206b',
      side: '#1c0a2c',
      radius: 34,
      stroke: '#ff8bf0',
      strokeAlpha: 0.8,
    })
    banner.add(bg)
    banner.add(display(this, 0, 2, 'FLUFF FEVER', 28, '#ffe066', 0.5))
    banner.add(label(this, 0, 20, 'DOUBLE POINTS', 10, '#ffd9f5', { origin: 0.5, letterSpacing: 1.6 }))
    this.stage.root.add(banner)
    banner.setScale(0.6)
    this.tweens.add({ targets: banner, scale: 1, duration: 260, ease: 'Back.Out' })
    this.feverBanner = banner
    this.cameras.main.flash(200, 255, 140, 240, false)
    this.cameras.main.shake(200, 0.006)
  }

  private exitFever(): void {
    sound.startMusic('play')
    if (this.feverBanner) {
      const banner = this.feverBanner
      this.feverBanner = null
      this.tweens.add({ targets: banner, alpha: 0, y: banner.y - 30, duration: 300, onComplete: () => banner.destroy(true) })
    }
  }

  private updateHud(): void {
    this.scoreText.setText(formatNumber(this.session.score))
    if (this.session.timeLeftMs > 0) {
      this.movesText.setText(formatClock(this.session.timeLeftMs))
      this.movesText.setColor(this.session.timeLeftMs < 15_000 ? '#ff6b6b' : '#ffffff')
    } else if (this.session.movesLeft === Infinity) {
      this.movesText.setText('ZEN')
      this.movesText.setColor('#6fe3a0')
    } else {
      this.movesText.setText(`${Math.max(0, this.session.movesLeft)}\nMOVES`)
      this.movesText.setColor(this.session.movesLeft <= 3 ? '#ff6b6b' : '#ffffff')
    }

    const progress = this.session.progress()
    if (this.level) {
      this.objectiveText.setText(`${progress.label.toUpperCase()}  ${Math.min(progress.current, progress.target)}/${progress.target}`)
      this.objectiveBar.clear()
      const ratio = Math.min(1, progress.target > 0 ? progress.current / progress.target : 0)
      this.objectiveBar.fillStyle(0xffffff, 0.12)
      this.objectiveBar.fillRoundedRect(20, 46, DESIGN_W - 108, 12, 6)
      this.objectiveBar.fillStyle(hex(progress.complete ? '#6fe3a0' : '#ffe066'), 1)
      this.objectiveBar.fillRoundedRect(20, 46, Math.max(6, (DESIGN_W - 108) * ratio), 12, 6)
    } else {
      const cleared = `${this.session.clearedTotal} fluffs freed`
      this.objectiveText.setText(cleared.toUpperCase())
      this.objectiveBar.clear()
      this.objectiveBar.fillStyle(0xffffff, 0.1)
      this.objectiveBar.fillRoundedRect(20, 46, DESIGN_W - 108, 10, 5)
      this.objectiveBar.fillStyle(0xff8bf0, 0.9)
      this.objectiveBar.fillRoundedRect(20, 46, Math.max(6, Math.min(1, this.session.clearedTotal / 300) * (DESIGN_W - 108)), 10, 5)
    }
  }

  private updateFever(delta: number): void {
    const ratio = this.session.feverActive
      ? this.session.feverMs / (this.session.feverMs + 1) // full bar while active
      : this.session.feverCharge / 100
    this.feverBar.clear()
    this.feverBar.fillStyle(0xffffff, 0.12)
    this.feverBar.fillRoundedRect(32, DESIGN_H - 104, DESIGN_W - 64, 14, 7)
    const width = Math.max(8, (DESIGN_W - 64) * Math.min(1, ratio))
    this.feverBar.fillStyle(hex(this.session.feverActive ? '#ff8bf0' : '#8a6bff'), 1)
    this.feverBar.fillRoundedRect(32, DESIGN_H - 104, width, 14, 7)
    if (this.session.feverActive) {
      this.feverLabel.setText(`FLUFF FEVER  ${(this.session.feverMs / 1000).toFixed(1)}s  \u00d72`)
    } else {
      this.feverLabel.setText('FLUFF FEVER')
    }
    if (this.session.feverActive === false && this.feverBanner) this.exitFever()
    void delta
  }

  private useHint(): void {
    if (this.busy || this.paused || this.session.status !== 'playing') return
    if (this.hintsLeft <= 0) {
      toast(this, 'No hints left this run', '#ff9f9f', 240, 1200)
      return
    }
    const move = bestMove(this.session.clone())
    if (!move) {
      toast(this, 'No slides left - shuffle coming', '#ffe066', 240, 1200)
      return
    }
    this.hintsLeft -= 1
    sound.squeak(true)
    this.clearHint()
    const { left, top, cell, size } = this.layout
    const graphics = this.hintLines
    graphics.lineStyle(4, 0xffe066, 0.9)
    if (move.axis === 'row') {
      const y = top + move.line * cell + cell / 2
      graphics.strokeRoundedRect(left + 2, y - cell / 2 + 2, size - 4, cell - 4, 16)
      graphics.fillStyle(0xffe066, 1)
      const direction = move.delta > 0 ? 1 : -1
      const arrowX = direction > 0 ? left + size - 26 : left + 26
      graphics.fillTriangle(arrowX, y - 12, arrowX, y + 12, arrowX + direction * 18, y)
    } else {
      const x = left + move.line * cell + cell / 2
      graphics.strokeRoundedRect(x - cell / 2 + 2, top + 2, cell - 4, size - 4, 16)
      const direction = move.delta > 0 ? 1 : -1
      const arrowY = direction > 0 ? top + size - 26 : top + 26
      graphics.fillTriangle(x - 12, arrowY, x + 12, arrowY, x, arrowY + direction * 18)
    }
    this.time.delayedCall(2200, () => this.clearHint())
  }

  private clearHint(): void {
    this.hintLines.clear()
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    if (paused) {
      sound.stopMusic()
      const container = this.add.container(0, 0).setDepth(6000)
      const veil = this.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x05070f, 0.72).setOrigin(0)
      veil.setInteractive()
      container.add(veil)
      const card = panel(this, 80, 380, DESIGN_W - 160, 430, {
        fill: '#161f3d',
        side: '#070a14',
        radius: 30,
        stroke: '#ffe066',
        strokeAlpha: 0.4,
      })
      container.add(card)
      card.add(display(this, (DESIGN_W - 160) / 2, 48, 'PAUSED', 30, '#ffffff', 0.5))
      card.add(
        label(this, (DESIGN_W - 160) / 2, 92, 'Take a breath. Your fluffs will wait.', 13, '#b9c6f5', {
          origin: 0.5,
        }),
      )
      const width = DESIGN_W - 240
      card.add(button(this, 40, 140, width, 66, 'RESUME', () => this.setPaused(false), { fill: '#ff7043', size: 22, glow: true }))
      card.add(
        button(this, 40, 222, width, 58, 'RESTART', () => this.scene.restart({ mode: this.mode, levelId: this.level?.id }), {
          fill: '#243056',
          size: 18,
        }),
      )
      card.add(button(this, 40, 296, width, 58, 'QUIT TO MENU', () => fadeTo(this, 'Menu'), { fill: '#243056', size: 18 }))
      this.pausePanel = container
      this.stage.root.add(container)
    } else {
      sound.startMusic(this.session.feverActive ? 'fever' : 'play')
      this.pausePanel?.destroy(true)
      this.pausePanel = null
    }
  }

  private finish(): void {
    if (this.busy) return
    this.busy = true
    const won = this.session.status === 'won'
    if (won) {
      sound.win()
      this.celebrate()
    } else {
      sound.lose()
    }
    this.time.delayedCall(won ? 1200 : 700, () => {
      fadeTo(this, 'Results', {
        mode: this.mode,
        levelId: this.level?.id,
        won,
        score: this.session.score,
        stars: this.session.stars(),
        cleared: this.session.clearedTotal,
        bestChain: this.session.bestChain,
        bestMatch: this.session.bestRun,
        fevers: this.session.fevers,
        moves: this.session.movesUsed,
        elapsed: this.elapsed,
        objectiveComplete: this.session.progress().complete,
      })
    })
  }

  private celebrate(): void {
    const colors = [0xff6b6b, 0xffd166, 0x4ec4f0, 0x6fe3a0, 0xff8bf0]
    for (let index = 0; index < (this.quality === 'low' ? 8 : 26); index += 1) {
      const spark = this.add.image(
        DESIGN_W / 2 + (Math.random() - 0.5) * 300,
        420 + Math.random() * 160,
        'spark',
      )
      spark.setTint(colors[index % colors.length]!)
      spark.setDepth(50)
      this.stage.root.add(spark)
      this.tweens.add({
        targets: spark,
        y: spark.y - 120 - Math.random() * 180,
        x: spark.x + (Math.random() - 0.5) * 200,
        alpha: 0,
        scale: 0.1,
        duration: 900 + Math.random() * 500,
        ease: 'Quad.Out',
        onComplete: () => spark.destroy(),
      })
    }
  }

  override update(_time: number, delta: number): void {
    this.backdrop.update(delta)
    if (this.paused || this.busy) return
    if (this.session.status === 'playing') {
      this.elapsed += delta
      this.session.update(delta)
      this.updateHud()
      this.updateFever(delta)
      if (this.session.status !== 'playing') this.finish()
    }
    this.blinkTimer += delta
    if (this.blinkTimer > 240) {
      this.blinkTimer = 0
      for (let count = 0; count < 2; count += 1) {
        const index = Math.floor(Math.random() * 64)
        const tile = this.tiles[index]
        if (!tile?.main.visible) continue
        const key = tile.main.texture.key
        if (key.includes('blink')) continue
        tile.main.setTexture(`${key}-blink`)
        this.time.delayedCall(130, () => {
          if (tile.main.texture.key.endsWith('-blink')) tile.main.setTexture(key)
        })
      }
    }
  }
}

function dailySeedNumber(): number {
  const now = new Date()
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
}

function chainWord(chain: number, bestRun: number): string | null {
  if (bestRun >= 5) return 'MEGA FLUFF!'
  if (chain >= 6) return 'UNBELIEVABLE!'
  if (chain >= 5) return 'FLUFF FRENZY!'
  if (chain >= 4) return 'MEGA FLUFF!'
  if (chain >= 3) return 'TRIPLE TROUBLE!'
  if (chain >= 2) return 'DOUBLE FLUFF!'
  return null
}
