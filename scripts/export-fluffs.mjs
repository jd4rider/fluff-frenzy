import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Converts the Blender renders in art/render into the 128px sprites that
 * Phaser loads from public/fluffs. Three expressions are shipped, matching the
 * texture keys the board already uses:
 *
 *   fluff-N        idle
 *   fluff-N-blink  eyes closed
 *   fluff-N-wow    surprised
 *
 * Re-run after `blender ... --color all` to refresh the artwork. Files that are
 * missing are skipped, and BootScene falls back to the painted canvas fluff, so
 * the game still runs from a clean checkout.
 */

const COLORS = ['ruby', 'sunshine', 'ocean', 'emerald', 'amethyst', 'tangerine']
const SOURCES = [
  { action: 'idle', frame: 'idle_00.png', suffix: '' },
  { action: 'blink', frame: 'blink_02.png', suffix: '-blink' },
  { action: 'wow', frame: 'wow_00.png', suffix: '-wow' },
]

const root = dirname(new URL(import.meta.url).pathname)
const outDir = join(root, '..', 'public', 'fluffs')
mkdirSync(outDir, { recursive: true })

let exported = 0
for (const color of COLORS) {
  for (const source of SOURCES) {
    const input = join(root, '..', 'art', 'render', color, source.action, source.frame)
    const output = join(outDir, `${color}${source.suffix}.png`)
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vf', 'scale=128:128:flags=lanczos', output])
      exported += 1
    } catch {
      console.warn(`skipped ${color}${source.suffix}: ${input} not rendered yet`)
    }
  }
}
console.log(`exported ${exported} fluff sprites to public/fluffs`)
