import Phaser from 'phaser'
import { sound } from '../core/audio'
import { save, totalStars, update } from '../core/saves'
import { WORLDS } from '../data/worlds'
import { Backdrop } from './Backdrop'
import { display, fadeIn, fadeTo, header, hex, label, panel } from './common'
import { DESIGN_W, designStage } from './layout'
import { FLUFFS } from './textures'

const STYLE_UNLOCKS = [0, 40, 120]
const STYLE_NAMES = ['Classic fluff', 'Sparkle coat', 'Royal crown']

/**
 * The fluff collection: every colour with its personality, the lifetime count
 * of that colour freed, and the three fur styles unlocked by star totals.
 */
export class CollectionScene extends Phaser.Scene {
  constructor() {
    super('Collection')
  }

  create(): void {
    fadeIn(this)
    const stage = designStage(this)
    const data = save()
    const stars = totalStars(data)
    const backdrop = new Backdrop(this, WORLDS[2]!, { dim: 0.4 })
    stage.root.add(backdrop.container)
    header(this, stage.root, 'FLUFF COLLECTION', () => this.scene.start('Menu'), '#ffe066', `${stars} \u2605`)

    const width = (DESIGN_W - 72 - 16) / 2
    FLUFFS.forEach((fluff, index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const card = panel(this, 36 + col * (width + 16), 120 + row * 232, width, 216, {
        fill: '#141d38',
        side: '#070a14',
        radius: 24,
        raised: 4,
        stroke: fluff.base,
        strokeAlpha: 0.4,
      })
      stage.root.add(card)
      const image = this.add.image(width / 2, 66, `fluff-${index}`).setScale(0.62)
      card.add(image)
      this.tweens.add({
        targets: image,
        y: 60,
        duration: 1400 + index * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })
      if (data.settings.furStyle === 1) {
        const sparkle = this.add.image(width / 2 + 26, 34, 'spark').setTint(hex(fluff.light)).setScale(0.5).setAlpha(0.85)
        card.add(sparkle)
        this.tweens.add({ targets: sparkle, alpha: 0.2, duration: 900, yoyo: true, repeat: -1 })
      }
      if (data.settings.furStyle === 2) {
        card.add(label(this, width / 2, 26, '\u265B', 26, '#ffe066', { origin: 0.5 }))
      }
      card.add(label(this, width / 2, 126, fluff.name.toUpperCase(), 17, '#ffffff', { origin: 0.5, fontStyle: 'bold' }))
      card.add(
        label(this, width / 2, 150, fluff.personality, 11, '#9fb0e4', {
          origin: 0.5,
          align: 'center',
          wrap: width - 24,
        }),
      )
      card.add(
        label(this, width / 2, 188, `${data.clearedByColor[index] ?? 0} freed`, 12, fluff.light, {
          origin: 0.5,
          fontStyle: 'bold',
        }),
      )
    })

    stage.root.add(label(this, 36, 826, 'FUR STYLES', 13, '#ffe066', { fontStyle: 'bold', letterSpacing: 1.5 }))
    STYLE_NAMES.forEach((name, index) => {
      const unlocked = stars >= STYLE_UNLOCKS[index]!
      const selected = data.settings.furStyle === index
      const card = panel(this, 36, 852 + index * 88, DESIGN_W - 72, 74, {
        fill: selected ? '#26406b' : '#131b33',
        side: '#070a14',
        radius: 20,
        raised: 3,
        stroke: selected ? '#ffe066' : '#ffffff',
        strokeAlpha: selected ? 0.7 : 0.12,
      })
      stage.root.add(card)
      card.add(label(this, 20, 16, name.toUpperCase(), 15, unlocked ? '#ffffff' : '#5d6a90', { fontStyle: 'bold' }))
      card.add(
        label(
          this,
          20,
          40,
          unlocked ? (selected ? 'Selected' : 'Tap to wear') : `Unlocks at ${STYLE_UNLOCKS[index]} stars`,
          11,
          unlocked ? '#9fb0e4' : '#5d6a90',
        ),
      )
      if (unlocked) {
        const hit = this.add.rectangle((DESIGN_W - 72) / 2, 37, DESIGN_W - 72, 74, 0xffffff, 0).setInteractive({ useHandCursor: true })
        card.add(hit)
        hit.on('pointerup', () => {
          sound.click()
          update((save) => {
            save.settings.furStyle = index
          })
          this.scene.restart()
        })
      }
    })

    stage.root.add(display(this, DESIGN_W / 2, 1150, `${stars} / 1500 stars collected`, 14, '#ffffff', 0.5).setAlpha(0.6))
    stage.root.add(
      label(this, DESIGN_W / 2, 1180, 'Stars come from Journey levels. Three per level, awarded on efficiency.', 11, '#b9c6f5', {
        origin: 0.5,
        alpha: 0.8,
      }),
    )
    stage.root.add(
      label(this, DESIGN_W / 2, 1230, 'TAP BACK TO RETURN', 11, '#ffffff', { origin: 0.5, alpha: 0.4, letterSpacing: 1.4 }),
    )
    void fadeTo
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => backdrop.destroy())
  }
}
