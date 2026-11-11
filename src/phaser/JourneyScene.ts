import Phaser from 'phaser'
import { sound } from '../core/audio'
import { save, totalStars } from '../core/saves'
import journey from '../data/journey.json'
import { WORLDS } from '../data/worlds'
import { Backdrop } from './Backdrop'
import {
  button,
  display,
  fadeIn,
  fadeTo,
  formatNumber,
  header,
  hex,
  label,
  panel,
  starRow,
} from './common'
import { DESIGN_H, DESIGN_W, designStage } from './layout'
import type { LevelData } from '../game/types'

interface JourneyFile {
  version: number
  levels: LevelData[]
}

const LEVELS = (journey as unknown as JourneyFile).levels

/**
 * Journey map: ten world cards holding fifty level chips each, scrollable with
 * a drag or the wheel. Locked levels show a padlock; completed levels show the
 * stars earned and replay from the same card.
 */
export class JourneyScene extends Phaser.Scene {
  private stage!: ReturnType<typeof designStage>
  private backdrop!: Backdrop
  private content!: Phaser.GameObjects.Container
  private scrollY = 0
  private dragStart: number | null = null
  private contentHeight = 0
  private viewTop = 120
  private viewHeight = DESIGN_H - 200
  private modal: Phaser.GameObjects.Container | null = null
  private maskShape?: Phaser.GameObjects.Graphics

  constructor() {
    super('Journey')
  }

  create(): void {
    fadeIn(this)
    this.stage = designStage(this)
    const data = save()
    const world = WORLDS[Math.min(9, Math.floor((data.unlocked - 1) / 50))]!
    this.backdrop = new Backdrop(this, world, { dim: 0.35 })
    this.stage.root.add(this.backdrop.container)

    header(this, this.stage.root, 'PUZZLE JOURNEY', () => this.scene.start('Menu'), '#ffe066', `${totalStars(data)} \u2605`)

    // Masks are drawn in screen space because the whole stage is scaled.
    this.maskShape = this.make.graphics({ x: 0, y: 0 })
    this.content = this.add.container(0, this.viewTop)
    this.content.setMask(this.maskShape.createGeometryMask())
    this.stage.root.add(this.content)
    this.paintMask()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.paintMask, this)

    let y = 0
    WORLDS.forEach((world) => {
      const stars = this.worldStars(world.id, data.journey)
      y = this.buildWorld(world.id, y, stars)
    })
    this.contentHeight = y
    this.scrollY = this.levelOffset(data.unlocked)
    this.applyScroll()

    const zone = this.add.zone(0, this.viewTop, DESIGN_W, this.viewHeight).setOrigin(0).setInteractive()
    this.stage.root.add(zone)
    zone.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
      this.scrollY += dy * 0.6
      this.applyScroll()
    })
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < this.viewTop || pointer.y > this.viewTop + this.viewHeight) return
      this.dragStart = pointer.y + this.scrollY
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStart === null || !pointer.isDown) return
      this.scrollY = this.dragStart - pointer.y
      this.applyScroll()
    })
    this.input.on('pointerup', () => {
      this.dragStart = null
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.backdrop.destroy()
      this.scale.off(Phaser.Scale.Events.RESIZE, this.paintMask, this)
      this.input.removeAllListeners()
    })
  }

  private paintMask(): void {
    if (!this.maskShape) return
    const root = this.stage.root
    const scale = this.stage.scale
    this.maskShape.clear()
    this.maskShape.fillStyle(0xffffff)
    this.maskShape.fillRect(root.x, root.y + this.viewTop * scale, DESIGN_W * scale, this.viewHeight * scale)
  }

  private worldStars(world: number, journeyStars: Record<string, number>): number {
    let stars = 0
    for (let id = world * 50 + 1; id <= world * 50 + 50; id += 1) stars += journeyStars[String(id)] ?? 0
    return stars
  }

  private buildWorld(worldId: number, y: number, stars: number): number {
    const world = WORLDS[worldId]!
    const card = this.add.container(0, y)
    this.content.add(card)
    const width = DESIGN_W - 44
    const cardHeight = 456
    const surface = this.add.graphics()
    surface.fillStyle(hex(world.ground), 0.55)
    surface.fillRoundedRect(22, 0, width, cardHeight, 28)
    surface.fillStyle(hex(world.accent), 0.16)
    surface.fillRoundedRect(22, 0, width, 82, 28)
    card.add(surface)

    card.add(label(this, 44, 18, `WORLD ${worldId + 1}`, 11, world.accent, { fontStyle: 'bold', letterSpacing: 1.4 }))
    card.add(label(this, 44, 34, world.name.toUpperCase(), 22, '#ffffff', { fontStyle: 'bold' }))
    card.add(label(this, 44, 62, world.blurb, 12, '#ffffff', { alpha: 0.7 }))
    card.add(
      label(this, DESIGN_W - 44, 40, `${stars}/150 \u2605`, 16, world.accent, {
        origin: [1, 0],
        fontStyle: 'bold',
      }),
    )

    const columns = 10
    const chip = 58
    const gapX = 6
    const startX = (DESIGN_W - (columns * chip + (columns - 1) * gapX)) / 2
    const data = save()
    for (let index = 0; index < 50; index += 1) {
      const levelId = worldId * 50 + index + 1
      const col = index % columns
      const row = Math.floor(index / columns)
      const x = startX + col * (chip + gapX) + chip / 2
      const yPos = 100 + row * (chip + 10) + chip / 2
      const locked = levelId > data.unlocked
      const earned = data.journey[String(levelId)] ?? 0
      const fill = locked ? '#1a2036' : earned > 0 ? '#2a5a8f' : '#1f3a63'
      const tile = this.add.graphics()
      tile.fillStyle(hex(fill), locked ? 0.55 : 1)
      tile.fillRoundedRect(x - chip / 2, yPos - chip / 2, chip, chip, 14)
      tile.lineStyle(2, hex(earned > 0 ? '#ffe066' : world.accent), locked ? 0.12 : earned > 0 ? 0.75 : 0.35)
      tile.strokeRoundedRect(x - chip / 2, yPos - chip / 2, chip, chip, 14)
      card.add(tile)
      card.add(
        label(this, x, yPos - (earned > 0 ? 4 : 0), String(levelId), 15, locked ? '#7c88ab' : '#ffffff', {
          origin: 0.5,
          fontStyle: 'bold',
          alpha: locked ? 0.75 : 1,
        }),
      )
      if (earned > 0) {
        for (let star = 0; star < 3; star += 1) {
          card.add(
            label(this, x - 12 + star * 12, yPos + 16, star < earned ? '\u2605' : '\u2606', 9, star < earned ? '#ffe066' : '#ffffff', {
              origin: 0.5,
              alpha: star < earned ? 1 : 0.3,
            }),
          )
        }
      }
      if (!locked) {
        const hit = this.add.rectangle(x, yPos, chip, chip, 0xffffff, 0).setInteractive({ useHandCursor: true })
        card.add(hit)
        hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          if (pointer.getDistance() > 12) return
          sound.click()
          this.openLevel(levelId)
        })
      }
    }
    return y + cardHeight + 18
  }

  private levelOffset(levelId: number): number {
    const worldIndex = Math.floor((levelId - 1) / 50)
    return Math.max(0, worldIndex * 474 - 40)
  }

  private applyScroll(): void {
    const max = Math.max(0, this.contentHeight - this.viewHeight)
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, max)
    this.content.y = this.viewTop - this.scrollY
  }

  private openLevel(levelId: number): void {
    const level = LEVELS[levelId - 1]
    if (!level) return
    this.closeModal()
    const data = save()
    const earned = data.journey[String(levelId)] ?? 0
    const container = this.add.container(0, 0).setDepth(5000)
    // Design-space parenting: the card is authored at 720x1280 and would
    // otherwise be drawn at raw screen pixels and run off a phone's edge.
    this.stage.root.add(container)
    const veil = this.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x05070f, 0.72).setOrigin(0)
    veil.setInteractive()
    container.add(veil)
    const card = panel(this, 52, 320, DESIGN_W - 104, 470, {
      fill: '#141c38',
      side: '#070a14',
      radius: 30,
      stroke: '#ffe066',
      strokeAlpha: 0.4,
    })
    container.add(card)
    const world = WORLDS[Math.floor((levelId - 1) / 50)]!
    card.add(label(this, 34, 26, `WORLD ${world.id + 1} \u00b7 LEVEL ${levelId}`, 12, world.accent, { fontStyle: 'bold', letterSpacing: 1.4 }))
    card.add(display(this, (DESIGN_W - 104) / 2, 74, `LEVEL ${levelId}`, 34, '#ffffff', 0.5))
    card.add(
      label(this, (DESIGN_W - 104) / 2, 112, level.objective.label.toUpperCase(), 18, '#ffe066', {
        origin: 0.5,
        fontStyle: 'bold',
      }),
    )
    card.add(
      label(this, (DESIGN_W - 104) / 2, 146, `${level.moveLimit} moves max \u00b7 ${level.stars[1]} earns three stars`, 13, '#b9c6f5', {
        origin: 0.5,
      }),
    )
    card.add(starRow(this, (DESIGN_W - 104) / 2, 186, earned, 26))
    card.add(
      button(this, 30, 230, DESIGN_W - 164, 68, 'PLAY LEVEL', () => {
        this.closeModal()
        fadeTo(this, 'Game', { mode: 'journey', levelId })
      }, { fill: '#ff7043', size: 24, glow: true }),
    )
    card.add(
      label(this, (DESIGN_W - 104) / 2, 330, level.specials.length > 0 ? 'Special fluffs on this board' : 'Fresh board every attempt', 12, '#8fa2d8', {
        origin: 0.5,
      }),
    )
    card.add(
      button(this, (DESIGN_W - 104) / 2 - 110, 386, 220, 50, 'CLOSE', () => this.closeModal(), { fill: '#243056', size: 16 }),
    )
    veil.on('pointerup', () => this.closeModal())
    this.modal = container
  }

  private closeModal(): void {
    this.modal?.destroy(true)
    this.modal = null
  }

  override update(_time: number, delta: number): void {
    this.backdrop.update(delta)
  }

  shutdown(): void {
    void formatNumber
  }
}
