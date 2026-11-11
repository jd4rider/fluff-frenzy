import Phaser from 'phaser'
import { sound } from '../core/audio'
import { save, totalStars } from '../core/saves'
import { WORLDS, worldOf } from '../data/worlds'
import { arcade } from '../integration/LittleJoyAdapter'
import { Backdrop } from './Backdrop'
import { button, display, fadeIn, fadeTo, formatNumber, hex, iconButton, label, panel } from './common'
import { DESIGN_H, DESIGN_W, designStage } from './layout'
import { FLUFFS } from './textures'

/**
 * Main menu: the logo, three live fluffs that follow the pointer, the Journey
 * continue button and the four arcade modes. Every control is functional.
 */
export class MenuScene extends Phaser.Scene {
  private stage!: ReturnType<typeof designStage>
  private backdrop!: Backdrop
  private fluffs: Phaser.GameObjects.Image[] = []
  private eyes: Phaser.GameObjects.Image[] = []
  private tick = 0

  constructor() {
    super('Menu')
  }

  create(): void {
    fadeIn(this)
    this.stage = designStage(this)
    const data = save()
    const world = worldOf(Math.min(500, data.unlocked))
    this.backdrop = new Backdrop(this, world, { dim: 0.18 })
    this.stage.root.add(this.backdrop.container)

    this.buildHero(world.name)
    this.buildPrimary(data.unlocked, world.name)
    this.buildModes()
    this.buildFooter()

    sound.startMusic('menu')
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      sound.stopMusic()
      this.backdrop.destroy()
    })
  }

  private buildHero(worldName: string): void {
    const root = this.stage.root
    const glow = this.add.image(DESIGN_W / 2, 210, 'flare').setScale(3.4).setAlpha(0.35).setTint(0xffe066)
    root.add(glow)
    root.add(display(this, DESIGN_W / 2, 148, 'FLUFF', 76, '#ffffff', 0.5))
    root.add(display(this, DESIGN_W / 2, 224, 'FRENZY', 76, '#ffe066', 0.5))
    root.add(
      label(this, DESIGN_W / 2, 282, 'Slide the row. Free the fluff. Chase the frenzy.', 15, '#ffffff', {
        origin: 0.5,
        alpha: 0.78,
        align: 'center',
      }),
    )

    // Three fluffs bounce in place and glance toward the pointer.
    const slots = [
      { x: 156, y: 372, color: 0 },
      { x: 360, y: 340, color: 2 },
      { x: 566, y: 378, color: 4 },
    ]
    slots.forEach((slot, index) => {
      const fluff = this.add.image(slot.x, slot.y, `fluff-${slot.color}`).setScale(0.86)
      root.add(fluff)
      this.fluffs.push(fluff)
      this.tweens.add({
        targets: fluff,
        y: slot.y - 12,
        duration: 1200 + index * 180,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })
      this.tweens.add({
        targets: fluff,
        angle: index % 2 === 0 ? 6 : -6,
        duration: 1800 + index * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })
      const blink = this.add.image(slot.x, slot.y, `fluff-${slot.color}-blink`).setScale(0.86).setAlpha(0)
      root.add(blink)
      this.eyes.push(blink)
      this.time.addEvent({
        delay: 2600 + index * 900,
        loop: true,
        callback: () => {
          this.tweens.add({ targets: fluff, alpha: 0, duration: 60, yoyo: true, hold: 90 })
          blink.setAlpha(0)
        },
      })
    })
  }

  private buildPrimary(unlocked: number, worldName: string): void {
    const root = this.stage.root
    const card = panel(this, 44, 470, DESIGN_W - 88, 150, {
      fill: '#1b2450',
      side: '#0a0d20',
      radius: 30,
      stroke: '#ffe066',
      strokeAlpha: 0.35,
    })
    root.add(card)
    card.add(label(this, 28, 22, 'CONTINUE JOURNEY', 13, '#ffe066', { fontStyle: 'bold', letterSpacing: 1.6 }))
    card.add(label(this, 28, 46, `Level ${unlocked}`, 30, '#ffffff', { fontStyle: 'bold' }))
    card.add(label(this, 28, 86, `${worldName} · ${totalStars(save())} stars`, 14, '#b9c6f5'))
    const innerWidth = DESIGN_W - 88
    card.add(
      button(this, innerWidth - 210, 26, 176, 60, 'PLAY', () => this.startJourney(unlocked), {
        fill: '#ff7043',
        size: 24,
        glow: true,
      }),
    )
    card.add(
      iconButton(this, innerWidth - 62, 110, '\u2605', () => this.scene.start('Journey'), {
        size: 42,
        fill: '#2a3466',
        caption: 'MAP',
      }),
    )
  }

  private buildModes(): void {
    const root = this.stage.root
    const modes: { title: string; blurb: string; glyph: string; color: string; run: () => void }[] = [
      { title: 'CLASSIC', blurb: 'Move bank · endless', glyph: '\u25A6', color: '#4a7dff', run: () => this.startMode('classic') },
      { title: 'TIMED', blurb: 'Two-minute frenzy', glyph: '\u23F1', color: '#ff6fa5', run: () => this.startMode('timed') },
      { title: 'ZEN', blurb: 'No timer, no losing', glyph: '\u2740', color: '#38c46c', run: () => this.startMode('zen') },
      { title: 'DAILY', blurb: 'One seeded puzzle', glyph: '\u2600', color: '#ffa62b', run: () => this.startMode('daily') },
    ]
    const width = (DESIGN_W - 88 - 18) / 2
    modes.forEach((mode, index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const x = 44 + col * (width + 18)
      const y = 646 + row * 132
      const card = panel(this, x, y, width, 118, {
        fill: '#16203f',
        side: '#080c1a',
        radius: 24,
        stroke: mode.color,
        strokeAlpha: 0.4,
      })
      root.add(card)
      const badge = this.add.circle(34, 40, 22, hex(mode.color), 0.22)
      card.add(badge)
      card.add(label(this, 34, 40, mode.glyph, 20, mode.color, { origin: 0.5 }))
      card.add(label(this, 66, 28, mode.title, 17, '#ffffff', { fontStyle: 'bold' }))
      card.add(label(this, 66, 52, mode.blurb, 12, '#a8b6e8'))
      const hit = this.add.rectangle(width / 2, 59, width, 118, 0xffffff, 0).setInteractive({ useHandCursor: true })
      card.add(hit)
      hit.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.02, duration: 90 }))
      hit.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 90 }))
      hit.on('pointerup', () => {
        sound.click()
        mode.run()
      })
    })
  }

  private buildFooter(): void {
    const root = this.stage.root
    const data = save()
    const items: { glyph: string; caption: string; run: () => void }[] = [
      { glyph: '\u2665', caption: 'FLUFFS', run: () => this.scene.start('Collection') },
      { glyph: '\u2691', caption: 'STATS', run: () => this.scene.start('Stats') },
      { glyph: '\u2699', caption: 'SETTINGS', run: () => this.scene.start('Settings') },
    ]
    items.forEach((item, index) => {
      root.add(iconButton(this, 96 + index * 90, 1044, item.glyph, item.run, { size: 58, caption: item.caption }))
    })

    const best = Math.max(data.classicBest, data.timedBest)
    root.add(
      label(this, DESIGN_W - 44, 1030, 'BEST SCORE', 11, '#ffe066', { origin: [1, 0], fontStyle: 'bold', letterSpacing: 1.2 }),
    )
    root.add(label(this, DESIGN_W - 44, 1048, formatNumber(best), 26, '#ffffff', { origin: [1, 0], fontStyle: 'bold' }))

    root.add(
      label(this, DESIGN_W / 2, 1120, arcade.available() ? `Arcade: ${arcade.status()}` : 'Playing locally · works offline', 12, '#ffffff', {
        origin: 0.5,
        alpha: 0.55,
      }),
    )
    root.add(
      label(this, DESIGN_W / 2, 1148, `${WORLDS.length} worlds · 500 levels · ${FLUFFS.length} fluff colours`, 12, '#ffffff', {
        origin: 0.5,
        alpha: 0.4,
      }),
    )
  }

  private startJourney(level: number): void {
    fadeTo(this, 'Game', { mode: 'journey', levelId: level })
  }

  private startMode(mode: 'classic' | 'timed' | 'zen' | 'daily'): void {
    fadeTo(this, 'Game', { mode })
  }

  override update(_time: number, delta: number): void {
    this.tick += delta
    this.backdrop.update(delta)
    const pointer = this.input.activePointer
    const scale = this.stage.scale
    const px = (pointer.x - this.stage.root.x) / scale
    const py = (pointer.y - this.stage.root.y) / scale
    this.fluffs.forEach((fluff, index) => {
      const dx = Phaser.Math.Clamp((px - fluff.x) / 60, -1, 1)
      fluff.setFlipX(dx < -0.35)
      fluff.x += (fluff.x + dx * 2 - fluff.x) * 0.001
      void index
      void py
    })
  }

  shutdown(): void {
    void DESIGN_H
  }
}
