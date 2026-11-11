import Phaser from 'phaser'

export const DESIGN_W = 720
export const DESIGN_H = 1280

export interface Stage {
  root: Phaser.GameObjects.Container
  scale: number
  width: number
  height: number
}

/**
 * Every screen is authored on a 720x1280 canvas and scaled to fit whatever the
 * browser gives us, so a phone, a tablet and a desktop window all get the same
 * layout with no stretching.
 */
export function designStage(scene: Phaser.Scene): Stage {
  const state: Stage = { root: scene.add.container(0, 0), scale: 1, width: DESIGN_W, height: DESIGN_H }
  const fit = (): void => {
    const width = scene.scale.width
    const height = scene.scale.height
    const scale = Math.min(width / DESIGN_W, height / DESIGN_H)
    state.scale = scale
    state.width = width
    state.height = height
    state.root.setScale(scale)
    state.root.setPosition(Math.round((width - DESIGN_W * scale) / 2), Math.round((height - DESIGN_H * scale) / 2))
  }
  fit()
  scene.scale.on(Phaser.Scale.Events.RESIZE, fit)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, fit)
  })
  return state
}

export interface BoardLayout {
  left: number
  top: number
  size: number
  cell: number
}

/** The board is a centred square that leaves room for HUD and the fever bar. */
export function boardLayout(top = 300, bottom = 1030, width = 640): BoardLayout {
  const size = Math.min(width, bottom - top)
  return {
    left: Math.round((DESIGN_W - size) / 2),
    top: Math.round(top + (bottom - top - size) / 2),
    size,
    cell: size / 8,
  }
}

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window
}
