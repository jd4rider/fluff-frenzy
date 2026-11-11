/* Visual smoke test: drives the built game in Chromium and saves each screen. */
const { chromium } = require('/tmp/nr-smoke/node_modules/playwright-core')
const fs = require('node:fs')
const path = require('node:path')

const URL = process.env.URL || 'http://localhost:4180/'

/** Uses whichever Chromium build is already cached instead of downloading one. */
function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright')
  if (!fs.existsSync(cache)) return undefined
  const candidates = []
  for (const entry of fs.readdirSync(cache)) {
    if (entry.startsWith('chromium-')) {
      candidates.push(path.join(cache, entry, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'))
    }
    if (entry.startsWith('chromium_headless_shell-')) {
      candidates.push(path.join(cache, entry, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate))
}

async function main() {
  const browser = await chromium.launch({ executablePath: findChromium() })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '/tmp/ffz-menu.png' })

  const go = async (scene, data) => {
    await page.evaluate(
      ([key, payload]) => {
        const game = window.__FLUFF_FRENZY__
        if (!game) throw new Error('game missing')
        game.scene.start(key, payload)
      },
      [scene, data || {}],
    )
    await page.waitForTimeout(900)
  }

  await go('Journey')
  await page.screenshot({ path: '/tmp/ffz-journey.png' })

  await go('Game', { mode: 'journey', levelId: 1 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/ffz-game.png' })

  // Drag the third row to the right and let the cascade settle.
  const box = await page.locator('canvas').boundingBox()
  const scale = Math.min(box.width / 720, box.height / 1280)
  const offsetX = (box.width - 720 * scale) / 2
  const offsetY = (box.height - 1280 * scale) / 2
  const at = (x, y) => ({ x: offsetX + x * scale, y: offsetY + y * scale })
  const start = at(200, 470)
  const end = at(330, 470)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.waitForTimeout(120)
  await page.screenshot({ path: '/tmp/ffz-drag.png' })
  await page.mouse.up()
  await page.waitForTimeout(900)
  await page.screenshot({ path: '/tmp/ffz-cascade.png' })

  await go('Results', {
    mode: 'journey',
    levelId: 1,
    won: true,
    score: 8120,
    stars: 3,
    cleared: 96,
    bestChain: 4,
    bestMatch: 5,
    fevers: 1,
    moves: 9,
    elapsed: 74000,
    objectiveComplete: true,
  })
  await page.screenshot({ path: '/tmp/ffz-results.png' })

  await go('Settings')
  await page.screenshot({ path: '/tmp/ffz-settings.png' })

  await go('Collection')
  await page.screenshot({ path: '/tmp/ffz-collection.png' })

  await go('Stats')
  await page.screenshot({ path: '/tmp/ffz-stats.png' })

  console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors')
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
