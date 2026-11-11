import Phaser from 'phaser'

/**
 * The animated fluffs. art/blender/fluff.py renders each action with real fur
 * geometry (strand tips pushed by a wind field, body breathing, squashing and
 * bouncing), scripts/export-fluffs.mjs packs the frames into 4-column grids and
 * BootScene loads them as spritesheets.
 *
 * Frame counts must match ACTIONS in the Blender script.
 */
export type FluffAction = 'idle' | 'wind' | 'squish' | 'happy' | 'blink' | 'wow'

export const FLUFF_ACTIONS: FluffAction[] = ['idle', 'wind', 'squish', 'happy', 'blink', 'wow']

export const FLUFF_FRAMES: Record<FluffAction, number> = {
  idle: 12,
  wind: 8,
  squish: 8,
  happy: 8,
  blink: 4,
  wow: 4,
}

/** One cell of every strip; the board's scale maths assumes this size. */
export const FLUFF_FRAME_SIZE = 128

/**
 * The spritesheet key for an action, or null when that artwork is absent.
 * `anim` keeps these clear of the single-frame `fluff-N-blink`/`-wow` keys the
 * menus still use.
 */
export function fluffAnimKey(scene: Phaser.Scene, color: number, action: FluffAction): string | null {
  const key = `fluff-${color}-anim-${action}`
  return scene.textures.exists(key) ? key : null
}

/** Single-frame fallback the menus use, and the board uses if strips are missing. */
export function fluffStillKey(color: number, action: FluffAction): string {
  if (action === 'blink') return `fluff-${color}-blink`
  if (action === 'wow') return `fluff-${color}-wow`
  return `fluff-${color}`
}
