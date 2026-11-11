import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Packs the Blender animation renders in art/render into the spritesheets
 * Phaser plays, and refreshes the single-frame fallbacks the menus use.
 *
 *   public/fluffs/<slug>-idle.png    12 frames  (4x3 grid, 128px cells)
 *   public/fluffs/<slug>-wind.png     8 frames  (4x2)
 *   public/fluffs/<slug>-squish.png   8 frames
 *   public/fluffs/<slug>-happy.png    8 frames
 *   public/fluffs/<slug>-blink.png    4 frames  (4x1)
 *   public/fluffs/<slug>-wow.png      4 frames
 *   public/fluffs/<slug>.png          idle frame 0, for menu thumbnails
 *
 * Re-run after `blender ... --color all --action all`. Missing renders are
 * skipped, and BootScene falls back to the painted canvas fluff, so the game
 * still runs from a clean checkout.
 */

const COLORS = ['ruby', 'sunshine', 'ocean', 'emerald', 'amethyst', 'tangerine']
const ACTIONS = ['idle', 'wind', 'squish', 'happy', 'blink', 'wow']
const COLUMNS = 4
const FRAME = 128

const root = dirname(new URL(import.meta.url).pathname)
const renderDir = join(root, '..', 'art', 'render')
const outDir = join(root, '..', 'public', 'fluffs')
mkdirSync(outDir, { recursive: true })

function scale(input, output) {
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    input,
    '-vf',
    `scale=${FRAME}:${FRAME}:flags=lanczos`,
    output,
  ])
}

let sheets = 0
let stills = 0
for (const color of COLORS) {
  for (const action of ACTIONS) {
    const dir = join(renderDir, color, action)
    if (!existsSync(dir)) continue
    const frames = readdirSync(dir)
      .filter((name) => name.endsWith('.png'))
      .sort()
    if (frames.length === 0) continue
    const rows = Math.ceil(frames.length / COLUMNS)
    // The grid must be exact, so repeat the last frame into any empty cells.
    const padded = [...frames]
    while (padded.length < rows * COLUMNS) padded.push(frames[frames.length - 1])
    const sequence = padded.map((name) => join(dir, name))
    // ffmpeg needs a printf pattern, so stage the padded sequence with links.
    const staged = join(dir, `.sheet_%02d.png`)
    for (let index = 0; index < sequence.length; index += 1) {
      execFileSync('ln', ['-sf', sequence[index], join(dir, `.sheet_${String(index).padStart(2, '0')}.png`)])
    }
    const output = join(outDir, `${color}-${action}.png`)
    try {
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        '1',
        '-i',
        staged,
        '-frames:v',
        '1',
        '-vf',
        `scale=${FRAME}:${FRAME}:flags=lanczos,tile=${COLUMNS}x${rows}:padding=0:margin=0`,
        output,
      ])
      sheets += 1
      console.log(`sheet ${color}-${action}: ${frames.length} frames (${COLUMNS}x${rows})`)
    } catch (error) {
      console.warn(`skipped ${color}-${action}: ${String(error).slice(0, 120)}`)
    }
  }

  // Single frames for menus, the collection and level cards.
  const stillsFor = [
    { action: 'idle', frame: 'idle_00.png', suffix: '' },
    { action: 'blink', frame: 'blink_02.png', suffix: '-blink' },
    { action: 'wow', frame: 'wow_00.png', suffix: '-wow' },
  ]
  for (const still of stillsFor) {
    const input = join(renderDir, color, still.action, still.frame)
    if (!existsSync(input)) continue
    try {
      scale(input, join(outDir, `${color}${still.suffix}.png`))
      stills += 1
    } catch {
      console.warn(`skipped still ${color}${still.suffix}`)
    }
  }
}

console.log(`exported ${sheets} animation sheets and ${stills} stills to public/fluffs`)
