import Phaser from 'phaser'
import { save } from '../core/saves'
import { sound } from '../core/audio'
import { buildEffectTextures, buildFluffTextures } from './textures'
import { worldOf } from '../data/worlds'
import { Backdrop } from './Backdrop'
import { display, label } from './common'
import { DESIGN_H, DESIGN_W } from './layout'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create(): void {
    buildFluffTextures(this)
    buildEffectTextures(this)

    const data = save()
    sound.setVolumes(data.settings.sfx, data.settings.music)
    sound.setMuted(data.settings.muted)

    const world = worldOf(data.unlocked)
    new Backdrop(this, world, { motes: false })
    display(this, DESIGN_W / 2, DESIGN_H / 2 - 40, 'FLUFF FRENZY', 44, '#ffffff')
    label(this, DESIGN_W / 2, DESIGN_H / 2 + 30, 'Warming up the fluffs...', 18, '#ffffff', {
      origin: 0.5,
      alpha: 0.75,
    })

    this.cameras.main.fadeIn(220, 255, 255, 255)
    this.time.delayedCall(280, () => {
      this.cameras.main.fadeOut(180, 12, 16, 32)
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Menu'))
    })
  }
}
