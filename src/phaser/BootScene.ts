import Phaser from 'phaser'
import { save } from '../core/saves'
import { sound } from '../core/audio'
import { FLUFFS, buildEffectTextures, buildFluffTextures } from './textures'
import { worldOf } from '../data/worlds'
import { Backdrop } from './Backdrop'
import { display, label } from './common'
import { DESIGN_H, DESIGN_W } from './layout'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  /**
   * The fluffy cast is rendered in Blender (see art/blender/fluff.py) and
   * shipped as transparent sprites. If a sprite is missing, buildFluffTextures
   * paints the canvas fallback under the same key instead.
   */
  preload(): void {
    FLUFFS.forEach((palette, index) => {
      const slug = palette.name.toLowerCase()
      for (const suffix of ['', '-blink', '-wow']) {
        this.load.image(`fluff-${index}${suffix}`, `fluffs/${slug}${suffix}.png`)
      }
    })
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
