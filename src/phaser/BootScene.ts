import Phaser from 'phaser'
import { save } from '../core/saves'
import { sound } from '../core/audio'
import { FLUFF_ACTIONS, FLUFF_FRAMES, FLUFF_FRAME_SIZE } from './fluffAnim'
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
   * The fluffy cast is rendered and animated in Blender (art/blender/fluff.py)
   * and shipped as transparent spritesheets: each action is a 4-column grid of
   * 128px frames. The single frames stay loaded for menus and as the fallback
   * if an animation sheet is missing.
   */
  preload(): void {
    FLUFFS.forEach((palette, index) => {
      const slug = palette.name.toLowerCase()
      for (const suffix of ['', '-blink', '-wow']) {
        this.load.image(`fluff-${index}${suffix}`, `fluffs/${slug}${suffix}.png`)
      }
      for (const action of FLUFF_ACTIONS) {
        this.load.spritesheet(`fluff-${index}-anim-${action}`, `fluffs/${slug}-${action}.png`, {
          frameWidth: FLUFF_FRAME_SIZE,
          frameHeight: FLUFF_FRAME_SIZE,
          endFrame: FLUFF_FRAMES[action] - 1,
        })
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
