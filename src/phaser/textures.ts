import Phaser from 'phaser'

/**
 * Every fluff character is painted at boot on a canvas: a fuzzy pom-pom body,
 * highlighted crown, big eyes, a tiny mouth and cheek blush. Three expression
 * frames are baked per colour (idle, blink, wow) so the board can animate
 * without paying for per-cell graphics. Nothing is downloaded.
 */

export interface FluffPalette {
  name: string
  base: string
  light: string
  dark: string
  personality: string
}

export const FLUFFS: FluffPalette[] = [
  { name: 'Ruby', base: '#f0495f', light: '#ff8f9c', dark: '#b3223a', personality: 'Energetic and excitable' },
  { name: 'Sunshine', base: '#ffcb2e', light: '#ffe98a', dark: '#d09a00', personality: 'Cheerful and enthusiastic' },
  { name: 'Ocean', base: '#38a8f2', light: '#9ad8ff', dark: '#1d6fb8', personality: 'Calm and curious' },
  { name: 'Emerald', base: '#31c46c', light: '#9deebc', dark: '#1a8b4a', personality: 'Playful and mischievous' },
  { name: 'Amethyst', base: '#9a6cff', light: '#c9b0ff', dark: '#6438c4', personality: 'Sleepy and mysterious' },
  { name: 'Tangerine', base: '#ff8a3d', light: '#ffc38c', dark: '#c25a10', personality: 'Silly and expressive' },
]

export const FLUFF_SIZE = 128

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const mix = (channel: number, target: number): number => Math.round(channel + (target - channel) * amount)
  return `rgb(${mix(r, 255)}, ${mix(g, 255)}, ${mix(b, 255)})`
}

function drawFluff(
  ctx: CanvasRenderingContext2D,
  palette: FluffPalette,
  expression: 'idle' | 'blink' | 'wow',
  seed: number,
): void {
  const size = FLUFF_SIZE
  const center = size / 2
  const radius = size * 0.34
  ctx.clearRect(0, 0, size, size)

  // A deterministic jitter keeps every colour's fur silhouette distinct.
  let state = seed * 977 + 13
  const random = (): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }

  // Soft shadow under the body.
  const shadow = ctx.createRadialGradient(center, center + radius * 0.85, radius * 0.2, center, center + radius * 0.85, radius * 1.05)
  shadow.addColorStop(0, 'rgba(12, 18, 40, 0.34)')
  shadow.addColorStop(1, 'rgba(12, 18, 40, 0)')
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.ellipse(center, center + radius * 0.9, radius * 1.02, radius * 0.38, 0, 0, Math.PI * 2)
  ctx.fill()

  // Fur strands around the silhouette.
  ctx.lineCap = 'round'
  const strands = 64
  for (let index = 0; index < strands; index += 1) {
    const angle = (index / strands) * Math.PI * 2 + random() * 0.06
    const length = radius * (1.06 + random() * 0.24)
    const inner = radius * 0.82
    ctx.strokeStyle = index % 3 === 0 ? shade(palette.dark, 0.12) : palette.base
    ctx.lineWidth = size * (0.035 + random() * 0.018)
    ctx.beginPath()
    ctx.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner)
    ctx.lineTo(center + Math.cos(angle) * length, center + Math.sin(angle) * length)
    ctx.stroke()
  }

  // Body.
  const body = ctx.createRadialGradient(center - radius * 0.32, center - radius * 0.38, radius * 0.15, center, center, radius * 1.04)
  body.addColorStop(0, palette.light)
  body.addColorStop(0.55, palette.base)
  body.addColorStop(1, palette.dark)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(center, center, radius, 0, Math.PI * 2)
  ctx.fill()

  // Inner fluff texture: short arcs so the body reads as soft, not plastic.
  ctx.strokeStyle = shade(palette.light, 0.35)
  ctx.lineWidth = 1.8
  for (let index = 0; index < 26; index += 1) {
    const angle = random() * Math.PI * 2
    const distance = radius * (0.2 + random() * 0.68)
    const x = center + Math.cos(angle) * distance
    const y = center + Math.sin(angle) * distance
    ctx.beginPath()
    ctx.arc(x, y, size * 0.03, angle, angle + 1.5)
    ctx.stroke()
  }

  // Glossy crown highlight.
  const gloss = ctx.createRadialGradient(center - radius * 0.36, center - radius * 0.44, 2, center - radius * 0.2, center - radius * 0.2, radius * 0.95)
  gloss.addColorStop(0, 'rgba(255,255,255,0.62)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.beginPath()
  ctx.ellipse(center - radius * 0.22, center - radius * 0.3, radius * 0.66, radius * 0.46, -0.5, 0, Math.PI * 2)
  ctx.fill()

  // Cheeks.
  ctx.fillStyle = 'rgba(255, 120, 150, 0.32)'
  ctx.beginPath()
  ctx.ellipse(center - radius * 0.52, center + radius * 0.16, radius * 0.16, radius * 0.1, 0, 0, Math.PI * 2)
  ctx.ellipse(center + radius * 0.52, center + radius * 0.16, radius * 0.16, radius * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()

  // Eyes.
  const eyeY = center - radius * 0.06
  const eyeX = radius * 0.34
  const eyeRadius = expression === 'wow' ? radius * 0.19 : radius * 0.16
  if (expression === 'blink') {
    ctx.strokeStyle = '#2a1c33'
    ctx.lineWidth = radius * 0.09
    ctx.lineCap = 'round'
    for (const direction of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(center + direction * eyeX, eyeY, radius * 0.15, Math.PI * 0.15, Math.PI * 0.85)
      ctx.stroke()
    }
  } else {
    for (const direction of [-1, 1]) {
      ctx.fillStyle = '#241a2e'
      ctx.beginPath()
      ctx.ellipse(center + direction * eyeX, eyeY, eyeRadius * 0.82, eyeRadius, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(center + direction * eyeX - eyeRadius * 0.28, eyeY - eyeRadius * 0.34, eyeRadius * 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.arc(center + direction * eyeX + eyeRadius * 0.22, eyeY + eyeRadius * 0.3, eyeRadius * 0.14, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Mouth.
  ctx.strokeStyle = '#31203a'
  ctx.fillStyle = '#42283f'
  ctx.lineWidth = radius * 0.07
  if (expression === 'wow') {
    ctx.beginPath()
    ctx.ellipse(center, center + radius * 0.36, radius * 0.15, radius * 0.19, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (expression === 'blink') {
    ctx.beginPath()
    ctx.moveTo(center - radius * 0.1, center + radius * 0.38)
    ctx.lineTo(center + radius * 0.1, center + radius * 0.38)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(center, center + radius * 0.26, radius * 0.16, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
  }
}

function paintCanvas(scene: Phaser.Scene, key: string, paint: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return
  const texture = scene.textures.createCanvas(key, FLUFF_SIZE, FLUFF_SIZE)
  if (!texture) return
  const ctx = texture.getContext()
  paint(ctx)
  texture.refresh()
}

/** Paints the six fluff characters in three expressions plus badge overlays. */
export function buildFluffTextures(scene: Phaser.Scene): void {
  FLUFFS.forEach((palette, index) => {
    for (const expression of ['idle', 'blink', 'wow'] as const) {
      const key = expression === 'idle' ? `fluff-${index}` : `fluff-${index}-${expression}`
      paintCanvas(scene, key, (ctx) => drawFluff(ctx, palette, expression, index + 3))
    }
  })

  paintCanvas(scene, 'special-rainbow', (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, FLUFF_SIZE, FLUFF_SIZE)
    const stops = ['#ff5f6d', '#ffc371', '#f7ff6b', '#4ef0a6', '#4ec4f0', '#b06bff']
    stops.forEach((color, index) => gradient.addColorStop(index / (stops.length - 1), color))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(FLUFF_SIZE / 2, FLUFF_SIZE / 2, FLUFF_SIZE * 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 5
    ctx.stroke()
  })

  paintCanvas(scene, 'special-bomb', (ctx) => {
    const center = FLUFF_SIZE / 2
    ctx.fillStyle = '#2c2338'
    ctx.beginPath()
    ctx.arc(center, center + 6, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffb703'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(center + 16, center - 30)
    ctx.quadraticCurveTo(center + 40, center - 55, center + 50, center - 26)
    ctx.stroke()
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(center + 50, center - 26, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.ellipse(center - 14, center - 8, 12, 8, -0.6, 0, Math.PI * 2)
    ctx.fill()
  })

  paintCanvas(scene, 'special-lightning', (ctx) => {
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    ctx.moveTo(74, 12)
    ctx.lineTo(38, 68)
    ctx.lineTo(60, 68)
    ctx.lineTo(48, 118)
    ctx.lineTo(92, 54)
    ctx.lineTo(68, 54)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#fff8c4'
    ctx.lineWidth = 4
    ctx.stroke()
  })

  paintCanvas(scene, 'special-golden', (ctx) => {
    ctx.strokeStyle = '#ffe066'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(FLUFF_SIZE / 2, FLUFF_SIZE / 2, 50, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#ffe066'
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2 - Math.PI / 2
      ctx.beginPath()
      ctx.arc(FLUFF_SIZE / 2 + Math.cos(angle) * 54, FLUFF_SIZE / 2 + Math.sin(angle) * 54, 7, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  paintCanvas(scene, 'special-frozen', (ctx) => {
    ctx.strokeStyle = 'rgba(190, 240, 255, 0.95)'
    ctx.fillStyle = 'rgba(180, 235, 255, 0.3)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(FLUFF_SIZE / 2, FLUFF_SIZE / 2, 52, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(30, 40)
    ctx.lineTo(46, 78)
    ctx.lineTo(34, 96)
    ctx.moveTo(84, 30)
    ctx.lineTo(72, 66)
    ctx.lineTo(96, 84)
    ctx.stroke()
  })

  paintCanvas(scene, 'special-locked', (ctx) => {
    ctx.strokeStyle = '#d9dbe6'
    ctx.lineWidth = 11
    ctx.beginPath()
    ctx.arc(FLUFF_SIZE / 2, 48, 20, Math.PI, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#e9ecf6'
    ctx.beginPath()
    ctx.roundRect(FLUFF_SIZE / 2 - 32, 56, 64, 50, 12)
    ctx.fill()
    ctx.fillStyle = '#5b6178'
    ctx.beginPath()
    ctx.arc(FLUFF_SIZE / 2, 78, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(FLUFF_SIZE / 2 - 4, 84, 8, 14)
  })
}

/** A soft round particle used by every burst. */
export function buildEffectTextures(scene: Phaser.Scene): void {
  const size = 64
  if (!scene.textures.exists('spark')) {
    const texture = scene.textures.createCanvas('spark', size, size)
    if (texture) {
      const ctx = texture.getContext()
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.45, 'rgba(255,255,255,0.65)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, size, size)
      texture.refresh()
    }
  }
  if (!scene.textures.exists('ring')) {
    const texture = scene.textures.createCanvas('ring', 128, 128)
    if (texture) {
      const ctx = texture.getContext()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(64, 64, 54, 0, Math.PI * 2)
      ctx.stroke()
      texture.refresh()
    }
  }
  if (!scene.textures.exists('fluff-wisp')) {
    // A soft tuft of fur: faded ends, thicker middle, so a fast drag reads as
    // strands being combed backwards by the wind rather than spark particles.
    const width = 76
    const height = 24
    const texture = scene.textures.createCanvas('fluff-wisp', width, height)
    if (texture) {
      const ctx = texture.getContext()
      ctx.clearRect(0, 0, width, height)
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, 'rgba(255,255,255,0)')
      gradient.addColorStop(0.42, 'rgba(255,255,255,0.9)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = gradient
      ctx.lineCap = 'round'
      for (const [offset, weight] of [[0.28, 5], [0.5, 7], [0.72, 4]] as const) {
        ctx.lineWidth = weight
        ctx.beginPath()
        ctx.moveTo(2, height * offset)
        ctx.quadraticCurveTo(width * 0.45, height * offset - weight * 0.9, width * 0.62, height * offset)
        ctx.quadraticCurveTo(width * 0.8, height * offset + weight * 0.7, width - 2, height * offset)
        ctx.stroke()
      }
      texture.refresh()
    }
  }
  if (!scene.textures.exists('flare')) {
    const texture = scene.textures.createCanvas('flare', 128, 128)
    if (texture) {
      const ctx = texture.getContext()
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
      gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
      gradient.addColorStop(0.3, 'rgba(255,255,255,0.4)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 128, 128)
      texture.refresh()
    }
  }
}
