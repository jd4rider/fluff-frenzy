import Phaser from 'phaser'
import { sound } from '../core/audio'
import {
  ACHIEVEMENTS,
  defaultSave,
  persist,
  save,
  totalStars,
  update,
  type Quality,
} from '../core/saves'
import { arcade } from '../integration/LittleJoyAdapter'
import { Backdrop } from './Backdrop'
import { button, display, fadeIn, fadeTo, header, label, panel } from './common'
import { DESIGN_W, designStage } from './layout'
import { WORLDS } from '../data/worlds'

/** Settings: audio, graphics quality, motion, input and account. */
const STYLE_UNLOCKS = [0, 40, 120]

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings')
  }

  create(): void {
    fadeIn(this)
    const stage = designStage(this)
    const backdrop = new Backdrop(this, WORLDS[0]!, { dim: 0.42 })
    stage.root.add(backdrop.container)
    header(this, stage.root, 'SETTINGS', () => this.scene.start('Menu'), '#ffe066')

    const data = save()
    let y = 130
    const row = (title: string, value: string, onTap: () => void, hint?: string): void => {
      const card = panel(this, 36, y, DESIGN_W - 72, 78, {
        fill: '#141d38',
        side: '#070a14',
        radius: 20,
        raised: 3,
      })
      stage.root.add(card)
      card.add(label(this, 20, 14, title, 15, '#ffffff', { fontStyle: 'bold' }))
      if (hint) card.add(label(this, 20, 38, hint, 11, '#8fa2d8'))
      card.add(label(this, DESIGN_W - 112, 30, value, 17, '#ffe066', { origin: [1, 0], fontStyle: 'bold' }))
      const hit = this.add.rectangle((DESIGN_W - 72) / 2, 39, DESIGN_W - 72, 78, 0xffffff, 0).setInteractive({ useHandCursor: true })
      card.add(hit)
      hit.on('pointerup', () => {
        sound.click()
        onTap()
        this.scene.restart()
      })
      y += 90
    }

    row('SOUND EFFECTS', `${Math.round(data.settings.sfx * 100)}%`, () => {
      update((save) => {
        save.settings.sfx = save.settings.sfx >= 0.95 ? 0 : Math.round((save.settings.sfx + 0.2) * 10) / 10
      })
      const next = save()
      sound.setVolumes(next.settings.sfx, next.settings.music)
      sound.pop(1)
    })
    row('MUSIC', `${Math.round(data.settings.music * 100)}%`, () => {
      update((save) => {
        save.settings.music = save.settings.music >= 0.95 ? 0 : Math.round((save.settings.music + 0.25) * 10) / 10
      })
      const next = save()
      sound.setVolumes(next.settings.sfx, next.settings.music)
      sound.startMusic('menu')
    })
    row('MUTE EVERYTHING', data.settings.muted ? 'ON' : 'OFF', () => {
      update((save) => {
        save.settings.muted = !save.settings.muted
      })
      sound.setMuted(save().settings.muted)
    })
    const order: Quality[] = ['low', 'medium', 'high']
    row('GRAPHICS', data.settings.quality.toUpperCase(), () => {
      update((save) => {
        const index = order.indexOf(save.settings.quality)
        save.settings.quality = order[(index + 1) % order.length]!
      })
    }, 'Low trims particles, medium keeps everything readable')
    row('REDUCED MOTION', data.settings.reducedMotion ? 'ON' : 'OFF', () => {
      update((save) => {
        save.settings.reducedMotion = !save.settings.reducedMotion
      })
    }, 'Shortens shakes, flashes and drops')
    const stars = totalStars(data)
    const style = data.settings.furStyle
    row('FUR STYLE', ['CLASSIC', 'SPARKLE', 'CROWNED'][style] ?? 'CLASSIC', () => {
      update((save) => {
        const next = (save.settings.furStyle + 1) % 3
        // Only styles the player has actually unlocked can be worn.
        save.settings.furStyle = stars >= STYLE_UNLOCKS[next]! ? next : 0
      })
    }, `Unlocked by stars: 0 / 40 / 120 \u00b7 you have ${stars}`)

    stage.root.add(label(this, DESIGN_W / 2, 1052, arcade.available() ? `Arcade account: ${arcade.status()}` : 'Playing locally. Saves stay on this device.', 13, '#b9c6f5', { origin: 0.5 }))
    stage.root.add(
      button(this, 36, 1084, DESIGN_W - 72, 54, 'RESET ALL PROGRESS', () => this.reset(), { fill: '#5b2030', size: 15 }),
    )
    stage.root.add(button(this, 36, 1150, DESIGN_W - 72, 58, 'BACK', () => fadeTo(this, 'Menu'), { fill: '#243056', size: 18 }))
    stage.root.add(display(this, DESIGN_W / 2, 1225, 'v1.0.0', 12, '#ffffff', 0.5).setAlpha(0.4))

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => backdrop.destroy())
    void ACHIEVEMENTS
    void defaultSave
    void persist
  }

  private reset(): void {
    let armed = sessionStorage.getItem('fluff-reset') === '1'
    if (!armed) {
      sessionStorage.setItem('fluff-reset', '1')
      this.scene.restart()
      return
    }
    sessionStorage.removeItem('fluff-reset')
    const fresh = defaultSave()
    persist(fresh)
    this.scene.restart()
  }
}
