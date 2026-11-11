import Phaser from 'phaser'
import type { World } from '../data/worlds'
import { DESIGN_H, DESIGN_W } from './layout'
import { hex } from './common'

/**
 * A world backdrop: gradient sky, three layers of themed scenery and a handful
 * of slow ambient motes. Everything is vector-drawn, so switching worlds costs
 * nothing and the game still has no image downloads.
 */
export class Backdrop {
  readonly container: Phaser.GameObjects.Container
  private motes: Phaser.GameObjects.Arc[] = []
  private drift = 0

  constructor(scene: Phaser.Scene, world: World, options: { motes?: boolean; dim?: number } = {}) {
    this.container = scene.add.container(0, 0)
    const graphics = scene.add.graphics()
    this.container.add(graphics)

    const sky = scene.add.graphics()
    const bands = 26
    for (let band = 0; band < bands; band += 1) {
      const ratio = band / (bands - 1)
      sky.fillStyle(Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.HexStringToColor(world.sky[0]),
        Phaser.Display.Color.HexStringToColor(world.sky[1]),
        bands,
        band,
      ).color, 1)
      sky.fillRect(0, (DESIGN_H * ratio) - 1, DESIGN_W, DESIGN_H / bands + 2)
    }
    this.container.add(sky)

    this.paintMotif(graphics, world)
    this.container.add(graphics)

    if (options.motes !== false) {
      const count = 18
      for (let index = 0; index < count; index += 1) {
        const mote = scene.add.circle(
          Math.random() * DESIGN_W,
          Math.random() * DESIGN_H,
          2 + Math.random() * 4,
          hex(world.accent),
          0.18 + Math.random() * 0.3,
        )
        this.motes.push(mote)
        this.container.add(mote)
        scene.tweens.add({
          targets: mote,
          y: mote.y - 60 - Math.random() * 90,
          x: mote.x + (Math.random() - 0.5) * 50,
          alpha: { from: mote.alpha, to: 0 },
          duration: 6000 + Math.random() * 6000,
          repeat: -1,
          delay: Math.random() * 4000,
          onRepeat: () => {
            mote.x = Math.random() * DESIGN_W
            mote.y = DESIGN_H + 20
            mote.alpha = 0.18 + Math.random() * 0.3
          },
        })
      }
    }

    if (options.dim) {
      const veil = scene.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x0a1024, options.dim).setOrigin(0)
      this.container.add(veil)
    }
    this.container.setDepth(-10)
  }

  private paintMotif(graphics: Phaser.GameObjects.Graphics, world: World): void {
    const accent = hex(world.accent)
    const ground = hex(world.ground)
    switch (world.motif) {
      case 'meadow':
        this.hills(graphics, ground, 0.82, 0.1)
        this.hills(graphics, hex('#7ed07a'), 0.92, 0.16)
        for (let index = 0; index < 12; index += 1) {
          const x = 40 + index * 62
          const y = 900 + (index % 3) * 40
          graphics.fillStyle(hex('#2f6b3c'), 0.5)
          graphics.fillRect(x, y, 6, 70)
          graphics.fillStyle(hex('#57b35f'), 0.7)
          graphics.fillCircle(x + 3, y - 6, 26)
        }
        graphics.fillStyle(accent, 0.9)
        graphics.fillCircle(96, 150, 44)
        break
      case 'clouds':
        for (let index = 0; index < 7; index += 1) {
          this.cloud(graphics, 60 + index * 110, 180 + (index % 4) * 90, 0.5)
        }
        this.hills(graphics, hex('#ffd0e6'), 0.9, 0.12)
        break
      case 'bubbles':
        for (let index = 0; index < 26; index += 1) {
          graphics.lineStyle(2, hex('#ffffff'), 0.22)
          graphics.strokeCircle((index * 97) % DESIGN_W, 120 + ((index * 131) % 900), 10 + (index % 5) * 9)
        }
        this.hills(graphics, ground, 0.94, 0.14)
        break
      case 'forest':
        for (let index = 0; index < 9; index += 1) {
          const x = 30 + index * 84
          graphics.fillStyle(hex('#1d4132'), 0.85)
          graphics.fillRect(x, 780, 16, 400)
          graphics.fillStyle(hex('#2f6b48'), 0.9)
          graphics.fillCircle(x + 8, 760, 54)
          graphics.fillCircle(x - 26, 800, 38)
          graphics.fillCircle(x + 40, 804, 34)
        }
        graphics.fillStyle(accent, 0.85)
        for (let index = 0; index < 7; index += 1) graphics.fillCircle(80 + index * 94, 300 + (index % 2) * 60, 6)
        break
      case 'crystal':
        for (let index = 0; index < 8; index += 1) {
          const x = 40 + index * 92
          graphics.fillStyle(hex('#8ef1ff'), 0.2 + (index % 3) * 0.08)
          graphics.beginPath()
          graphics.moveTo(x, 900)
          graphics.lineTo(x + 34, 620 - (index % 4) * 40)
          graphics.lineTo(x + 68, 900)
          graphics.closePath()
          graphics.fillPath()
        }
        this.hills(graphics, ground, 0.95, 0.1)
        break
      case 'snow':
        for (let index = 0; index < 30; index += 1) {
          graphics.fillStyle(0xffffff, 0.5)
          graphics.fillCircle((index * 113) % DESIGN_W, 100 + ((index * 167) % 950), 3 + (index % 3) * 2)
        }
        this.hills(graphics, hex('#ffffff'), 0.9, 0.2)
        this.hills(graphics, ground, 0.98, 0.1)
        break
      case 'carnival':
        for (let index = 0; index < 10; index += 1) {
          const x = 20 + index * 74
          graphics.fillStyle(index % 2 === 0 ? hex('#ff5d73') : hex('#fff0f0'), 0.5)
          graphics.beginPath()
          graphics.moveTo(x, 520)
          graphics.lineTo(x + 40, 420)
          graphics.lineTo(x + 80, 520)
          graphics.closePath()
          graphics.fillPath()
        }
        this.dots(graphics, accent)
        break
      case 'neon':
        for (let index = 0; index < 9; index += 1) {
          const x = 12 + index * 82
          const height = 160 + ((index * 73) % 260)
          graphics.fillStyle(hex('#1b1446'), 0.9)
          graphics.fillRect(x, 940 - height, 66, height)
          graphics.fillStyle(accent, 0.28)
          for (let window = 0; window < 6; window += 1) {
            graphics.fillRect(x + 10 + (window % 2) * 26, 960 - height + window * 34, 14, 16)
          }
        }
        break
      case 'cosmos':
        for (let index = 0; index < 70; index += 1) {
          graphics.fillStyle(0xffffff, 0.18 + ((index * 7) % 10) / 22)
          graphics.fillCircle((index * 137) % DESIGN_W, (index * 191) % DESIGN_H, 2 + (index % 3))
        }
        graphics.fillStyle(accent, 0.16)
        graphics.fillCircle(560, 240, 140)
        graphics.fillStyle(hex('#6a4fbf'), 0.2)
        graphics.fillCircle(140, 520, 90)
        break
      case 'kingdom':
        graphics.fillStyle(hex('#b8632f'), 0.8)
        graphics.fillRect(0, 980, DESIGN_W, 300)
        for (let index = 0; index < 5; index += 1) {
          const x = 30 + index * 150
          graphics.fillStyle(hex('#c9743a'), 0.9)
          graphics.fillRect(x, 840, 100, 160)
          graphics.fillStyle(hex('#ffd88a'), 0.85)
          graphics.beginPath()
          graphics.moveTo(x - 8, 840)
          graphics.lineTo(x + 50, 780)
          graphics.lineTo(x + 108, 840)
          graphics.closePath()
          graphics.fillPath()
        }
        this.dots(graphics, accent)
        break
    }
  }

  private hills(graphics: Phaser.GameObjects.Graphics, color: number, baseY: number, alpha: number): void {
    graphics.fillStyle(color, alpha)
    graphics.beginPath()
    graphics.moveTo(0, DESIGN_H)
    graphics.lineTo(0, DESIGN_H * baseY)
    for (let x = 0; x <= DESIGN_W; x += 90) {
      graphics.lineTo(x, DESIGN_H * baseY - Math.sin(x / 120) * 40)
    }
    graphics.lineTo(DESIGN_W, DESIGN_H)
    graphics.closePath()
    graphics.fillPath()
  }

  private cloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number): void {
    graphics.fillStyle(0xffffff, alpha)
    graphics.fillCircle(x, y, 34)
    graphics.fillCircle(x + 34, y + 8, 26)
    graphics.fillCircle(x - 34, y + 10, 24)
    graphics.fillRoundedRect(x - 44, y + 4, 92, 26, 12)
  }

  private dots(graphics: Phaser.GameObjects.Graphics, accent: number): void {
    for (let index = 0; index < 26; index += 1) {
      graphics.fillStyle(index % 2 === 0 ? accent : 0xffffff, 0.35)
      graphics.fillCircle((index * 89) % DESIGN_W, 120 + ((index * 151) % 800), 4 + (index % 3) * 3)
    }
  }

  update(delta: number): void {
    this.drift += delta
    if (this.motes.length === 0) return
    // Gentle parallax sway; the tweens own the motion, this only adds drift.
    const sway = Math.sin(this.drift / 4000) * 6
    this.container.x = sway
  }

  destroy(): void {
    this.container.destroy(true)
    this.motes = []
  }
}
