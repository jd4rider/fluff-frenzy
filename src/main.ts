import Phaser from 'phaser'
import './style.css'
import { sound } from './core/audio'
import { BootScene } from './phaser/BootScene'
import { CollectionScene } from './phaser/CollectionScene'
import { GameScene } from './phaser/GameScene'
import { JourneyScene } from './phaser/JourneyScene'
import { MenuScene } from './phaser/MenuScene'
import { ResultsScene } from './phaser/ResultsScene'
import { SettingsScene } from './phaser/SettingsScene'
import { StatsScene } from './phaser/StatsScene'

declare global {
  interface Window {
    __FLUFF_FRENZY__?: Phaser.Game
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1024',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: typeof window === 'undefined' ? 720 : window.innerWidth,
    height: typeof window === 'undefined' ? 1280 : window.innerHeight,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  input: {
    activePointers: 3,
    gamepad: true,
  },
  fps: { target: 60, forceSetTimeOut: false, smoothStep: false },
  scene: [
    BootScene,
    MenuScene,
    JourneyScene,
    GameScene,
    ResultsScene,
    SettingsScene,
    CollectionScene,
    StatsScene,
  ],
}

export const game = new Phaser.Game(config)
window.__FLUFF_FRENZY__ = game

document.addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true })
document.addEventListener('keydown', () => sound.unlock(), { once: true, capture: true })

// iOS Safari rubber-bands the page when a drag starts on the canvas.
document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches.length > 1) return
    const target = event.target as HTMLElement | null
    if (target && target.tagName === 'CANVAS') event.preventDefault()
  },
  { passive: false },
)
