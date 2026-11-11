import Phaser from 'phaser'
import { sound } from '../core/audio'
import { DESIGN_H, DESIGN_W } from './layout'

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif'
export const DISPLAY = '"Arial Black", "Trebuchet MS", "Segoe UI", sans-serif'

/**
 * The design canvas is 720x1280, so on a 390px phone every design pixel is
 * about 0.54 CSS pixels. Type is authored at its comfortable design size and
 * scaled here so labels stay legible on a handset instead of shrinking to
 * five pixels.
 */
export const UI_SCALE = 1.28

export function hex(value: string): number {
  return Phaser.Display.Color.HexStringToColor(value).color
}

export function mix(from: string, to: string, amount: number): string {
  const a = Phaser.Display.Color.HexStringToColor(from)
  const b = Phaser.Display.Color.HexStringToColor(to)
  const ratio = Math.max(0, Math.min(1, amount))
  const component = (x: number, y: number): string =>
    Math.round(x * (1 - ratio) + y * ratio)
      .toString(16)
      .padStart(2, '0')
  return `#${component(a.red, b.red)}${component(a.green, b.green)}${component(a.blue, b.blue)}`
}

export interface TextOptions {
  origin?: number | [number, number]
  align?: 'left' | 'center' | 'right'
  fontStyle?: string
  wrap?: number
  alpha?: number
  lineSpacing?: number
  fontFamily?: string
  letterSpacing?: number
  shadow?: boolean
}

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size = 20,
  color = '#ffffff',
  options: TextOptions = {},
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, content, {
    fontFamily: options.fontFamily ?? FONT,
    fontSize: `${Math.round(size * UI_SCALE)}px`,
    color,
    align: options.align ?? 'left',
    fontStyle: options.fontStyle,
    lineSpacing: options.lineSpacing,
    resolution: 2,
    wordWrap: options.wrap ? { width: options.wrap, useAdvancedWrap: true } : undefined,
  })
  if (options.shadow) text.setShadow(0, 3, '#00000066', 4)
  if (options.origin !== undefined) {
    if (Array.isArray(options.origin)) text.setOrigin(options.origin[0], options.origin[1])
    else text.setOrigin(options.origin, options.origin)
  }
  if (options.alpha !== undefined) text.setAlpha(options.alpha)
  if (options.letterSpacing !== undefined) text.setLetterSpacing(options.letterSpacing)
  return text
}

export function display(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size = 48,
  color = '#ffffff',
  origin = 0.5,
): Phaser.GameObjects.Text {
  return label(scene, x, y, content, size, color, {
    origin,
    fontFamily: DISPLAY,
    fontStyle: 'bold',
    letterSpacing: 1,
    shadow: true,
  })
}

export interface PanelOptions {
  radius?: number
  fill?: string
  side?: string
  alpha?: number
  raised?: number
  stroke?: string
  strokeAlpha?: number
  shadow?: boolean
  highlight?: boolean
}

export function drawPanel(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  options: PanelOptions = {},
): void {
  const radius = options.radius ?? 24
  const raised = options.raised ?? 5
  const fill = hex(options.fill ?? '#182b45')
  const side = hex(options.side ?? '#091323')
  if (options.shadow !== false) {
    graphics.fillStyle(0x000000, 0.3)
    graphics.fillRoundedRect(3, raised + 6, width, height, radius)
  }
  graphics.fillStyle(side, 1)
  graphics.fillRoundedRect(0, raised, width, height, radius)
  graphics.fillStyle(fill, options.alpha ?? 1)
  graphics.fillRoundedRect(0, 0, width, height, radius)
  if (options.highlight !== false) {
    graphics.fillStyle(0xffffff, 0.08)
    graphics.fillRoundedRect(6, 4, width - 12, height * 0.32, radius * 0.8)
  }
  graphics.lineStyle(1.5, hex(options.stroke ?? '#ffffff'), options.strokeAlpha ?? 0.14)
  graphics.strokeRoundedRect(1, 1, width - 2, height - 2, radius)
}

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PanelOptions = {},
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y)
  const graphics = scene.add.graphics()
  drawPanel(graphics, width, height, options)
  container.add(graphics)
  return container
}

export interface ButtonOptions {
  fill?: string
  textColor?: string
  size?: number
  radius?: number
  subtitle?: string
  disabled?: boolean
  glow?: boolean
  accent?: string
  silent?: boolean
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  onClick: () => void,
  options: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const radius = options.radius ?? Math.min(26, height / 2.3)
  const fill = hex(options.fill ?? '#22395c')
  const accent = hex(options.accent ?? '#ffd166')
  const container = scene.add.container(x, y)
  const graphics = scene.add.graphics()
  graphics.fillStyle(0x000000, 0.32)
  graphics.fillRoundedRect(3, 6, width, height, radius)
  graphics.fillStyle(hex(mix(`#${fill.toString(16).padStart(6, '0')}`, '#000000', 0.34)), 1)
  graphics.fillRoundedRect(0, 4, width, height, radius)
  graphics.fillStyle(fill, options.disabled ? 0.5 : 1)
  graphics.fillRoundedRect(0, 0, width, height, radius)
  graphics.fillStyle(0xffffff, 0.15)
  graphics.fillRoundedRect(6, 4, width - 12, height * 0.36, radius * 0.72)
  if (options.glow) {
    graphics.lineStyle(2.5, accent, 0.55)
    graphics.strokeRoundedRect(1.5, 1.5, width - 3, height - 3, radius)
  }
  container.add(graphics)

  const textY = height / 2 - (options.subtitle ? 11 : 1)
  container.add(
    label(scene, width / 2, textY, text, options.size ?? 22, options.textColor ?? '#ffffff', {
      origin: 0.5,
      fontStyle: 'bold',
      letterSpacing: 0.5,
    }),
  )
  if (options.subtitle) {
    container.add(
      label(scene, width / 2, height - 16, options.subtitle, 12, options.textColor ?? '#ffffff', {
        origin: 0.5,
        alpha: 0.7,
        letterSpacing: 1.2,
      }),
    )
  }
  container.setSize(width, height + 6)
  if (!options.disabled) {
    const hit = scene.add.rectangle(width / 2, (height + 6) / 2, width, height + 6, 0xffffff, 0)
    hit.setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerover', () => scene.tweens.add({ targets: container, scale: 1.018, duration: 90 }))
    hit.on('pointerout', () => scene.tweens.add({ targets: container, scale: 1, duration: 90 }))
    hit.on('pointerdown', () => scene.tweens.add({ targets: container, scale: 0.97, duration: 60 }))
    hit.on('pointerup', () => {
      scene.tweens.add({ targets: container, scale: 1, duration: 130, ease: 'Back.Out' })
      if (!options.silent) sound.click()
      onClick()
    })
  } else {
    container.setAlpha(0.5)
  }
  return container
}

export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: string,
  onClick: () => void,
  options: { size?: number; fill?: string; color?: string; caption?: string; disabled?: boolean; accent?: string } = {},
): Phaser.GameObjects.Container {
  const size = options.size ?? 54
  const container = scene.add.container(x, y)
  const graphics = scene.add.graphics()
  graphics.fillStyle(0x000000, 0.3)
  graphics.fillRoundedRect(-size / 2 + 2, -size / 2 + 5, size, size, size / 3)
  graphics.fillStyle(hex(options.fill ?? '#1d3350'), 1)
  graphics.fillRoundedRect(-size / 2, -size / 2, size, size, size / 3)
  graphics.fillStyle(0xffffff, 0.1)
  graphics.fillRoundedRect(-size / 2 + 4, -size / 2 + 3, size - 8, size * 0.34, size / 4)
  if (options.accent) {
    graphics.lineStyle(1.5, hex(options.accent), 0.35)
    graphics.strokeRoundedRect(-size / 2 + 1, -size / 2 + 1, size - 2, size - 2, size / 3)
  }
  container.add(graphics)
  container.add(
    label(scene, 0, options.caption ? -size * 0.12 : 0, glyph, size * 0.4, options.color ?? '#ffffff', {
      origin: 0.5,
      fontStyle: 'bold',
    }),
  )
  if (options.caption) {
    container.add(label(scene, 0, size * 0.34, options.caption, 9, options.color ?? '#ffffff', { origin: 0.5, alpha: 0.75 }))
  }
  container.setSize(size, size)
  if (!options.disabled) {
    const hit = scene.add.rectangle(0, 0, size, size, 0xffffff, 0)
    hit.setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerdown', () => scene.tweens.add({ targets: container, scale: 0.92, duration: 55 }))
    hit.on('pointerout', () => scene.tweens.add({ targets: container, scale: 1, duration: 80 }))
    hit.on('pointerup', () => {
      scene.tweens.add({ targets: container, scale: 1, duration: 110, ease: 'Back.Out' })
      sound.click()
      onClick()
    })
  } else {
    container.setAlpha(0.42)
  }
  return container
}

export function starRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stars: number,
  size = 22,
  total = 3,
  animate = false,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y)
  const gap = size * 1.15
  for (let index = 0; index < total; index += 1) {
    const earned = index < stars
    const glyph = label(scene, (index - (total - 1) / 2) * gap, 0, earned ? '\u2605' : '\u2606', size, earned ? '#ffd23f' : '#ffffff', {
      origin: 0.5,
      alpha: earned ? 1 : 0.28,
    })
    container.add(glyph)
    if (earned && animate) {
      glyph.setScale(0.3)
      scene.tweens.add({ targets: glyph, scale: 1, duration: 300, delay: 160 + index * 130, ease: 'Back.Out' })
    }
  }
  return container
}

export function header(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  title: string,
  onBack: (() => void) | null,
  accent: string,
  right = '',
): void {
  if (onBack) parent.add(iconButton(scene, 44, 50, '\u2190', onBack, { size: 46 }))
  parent.add(display(scene, DESIGN_W / 2, 48, title, 27, '#ffffff', 0.5))
  if (right) {
    parent.add(label(scene, DESIGN_W - 24, 50, right, 13, accent, { origin: [1, 0.5], fontStyle: 'bold', letterSpacing: 0.6 }))
  }
}

export function toast(scene: Phaser.Scene, message: string, accent: string, y = 120, duration = 1500): void {
  const width = Math.min(600, DESIGN_W - 40)
  const height = 52
  const container = scene.add.container(DESIGN_W / 2, y).setDepth(6000)
  container.add(
    panel(scene, -width / 2, 0, width, height, {
      fill: '#122036',
      side: '#070d18',
      radius: 16,
      raised: 3,
      stroke: accent,
      strokeAlpha: 0.4,
    }),
  )
  container.add(
    label(scene, 0, height / 2, message, 14, '#ffffff', { origin: 0.5, align: 'center', wrap: width - 32 }),
  )
  container.setAlpha(0)
  scene.tweens.add({
    targets: container,
    alpha: 1,
    y: y + 8,
    duration: 160,
    hold: duration,
    yoyo: true,
    onComplete: () => container.destroy(),
  })
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  const camera = scene.cameras.main
  if (camera.fadeEffect?.isRunning) return
  camera.fadeOut(160, 8, 11, 24)
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data))
}

export function fadeIn(scene: Phaser.Scene): void {
  scene.cameras.main.fadeIn(220, 8, 11, 24)
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${total % 60}s`
}

export function announce(message: string): void {
  if (typeof document === 'undefined') return
  const node = document.getElementById('game-status')
  if (node) node.textContent = message
}

export function safeTop(): number {
  return 0
}

export { DESIGN_H, DESIGN_W }
