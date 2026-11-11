import Phaser from 'phaser'
import { sound } from '../core/audio'
import { recordLevel, recordRun, save, syncAchievements, totalStars } from '../core/saves'
import journey from '../data/journey.json'
import { WORLDS } from '../data/worlds'
import { arcade } from '../integration/LittleJoyAdapter'
import { Backdrop } from './Backdrop'
import {
  button,
  display,
  fadeIn,
  fadeTo,
  formatDuration,
  formatNumber,
  label,
  panel,
  starRow,
} from './common'
import { DESIGN_H, DESIGN_W, designStage } from './layout'
import type { LevelData, ModeId } from '../game/types'

interface JourneyFile {
  version: number
  levels: LevelData[]
}

const LEVELS = (journey as unknown as JourneyFile).levels

export interface ResultsPayload {
  mode: ModeId
  levelId?: number
  won: boolean
  score: number
  stars: number
  cleared: number
  bestChain: number
  bestMatch: number
  fevers: number
  moves: number
  elapsed: number
  objectiveComplete: boolean
}

/**
 * Results. Records are written here, once, so a restart can never double count
 * a run. Journey clears unlock the next level and award up to three stars.
 */
export class ResultsScene extends Phaser.Scene {
  private payload!: ResultsPayload

  constructor() {
    super('Results')
  }

  create(data: ResultsPayload): void {
    fadeIn(this)
    this.payload = data
    const stage = designStage(this)
    const level = data.mode === 'journey' && data.levelId ? LEVELS[data.levelId - 1] : undefined
    const world = WORLDS[level ? level.world : 0]!
    const backdrop = new Backdrop(this, world, { dim: data.won ? 0.25 : 0.45 })
    stage.root.add(backdrop.container)

    const isBest = this.persist(level)
    this.buildHeader(stage.root, data, level, isBest)
    this.buildStats(stage.root, data)
    this.buildActions(stage.root, data, level)
    this.shower(stage.root, data)

    if (data.won) sound.star()
    void DESIGN_H
    void totalStars
    void arcade
  }

  private persist(level: LevelData | undefined): boolean {
    const data = this.payload
    if (data.mode === 'journey' && level && data.objectiveComplete) {
      recordLevel(level.id, Math.max(1, data.stars), data.score, data.moves)
      syncAchievements()
      void arcade.sync()
      return false
    }
    if (data.mode === 'zen') return false
    const best = data.mode === 'classic' ? save().classicBest : data.mode === 'timed' ? save().timedBest : save().dailyBest
    recordRun(
      data.mode === 'classic' ? 'classic' : data.mode === 'timed' ? 'timed' : data.mode === 'daily' ? 'daily' : 'zen',
      data.score,
      {
        matches: data.cleared,
        cleared: data.cleared,
        bestMatch: data.bestMatch,
        bestChain: data.bestChain,
        fevers: data.fevers,
        playMs: data.elapsed,
      },
    )
    syncAchievements()
    void arcade.sync()
    return data.score > best && data.score > 0
  }

  private buildHeader(
    root: Phaser.GameObjects.Container,
    data: ResultsPayload,
    level: LevelData | undefined,
    isBest: boolean,
  ): void {
    const title = data.won ? (data.mode === 'journey' ? 'LEVEL CLEAR!' : 'RUN COMPLETE') : 'OUT OF MOVES'
    root.add(
      label(this, DESIGN_W / 2, 70, data.mode === 'journey' && level ? `WORLD ${level.world + 1} \u00b7 LEVEL ${level.id}` : this.modeName(data.mode), 12, '#ffe066', {
        origin: 0.5,
        fontStyle: 'bold',
        letterSpacing: 1.6,
      }),
    )
    root.add(display(this, DESIGN_W / 2, 120, title, 44, '#ffffff', 0.5))
    root.add(
      label(this, DESIGN_W / 2, 162, data.won ? 'Beautifully fused fluff' : 'The fluffs needed one more slide', 14, '#ffffff', {
        origin: 0.5,
        alpha: 0.8,
      }),
    )

    const card = panel(this, 44, 206, DESIGN_W - 88, 268, {
      fill: '#141d3a',
      side: '#070a16',
      radius: 30,
      stroke: data.won ? '#ffe066' : '#ff8a8a',
      strokeAlpha: 0.4,
    })
    root.add(card)
    card.add(label(this, (DESIGN_W - 88) / 2, 30, 'SCORE', 11, '#ffe066', { origin: 0.5, letterSpacing: 1.8 }))
    const score = display(this, (DESIGN_W - 88) / 2, 78, formatNumber(data.score), 62, '#ffffff', 0.5)
    card.add(score)
    if (isBest) {
      const badge = panel(this, (DESIGN_W - 88) / 2 - 96, 118, 192, 30, {
        fill: '#ffb703',
        side: '#c47f00',
        radius: 15,
        raised: 2,
        highlight: false,
      })
      card.add(badge)
      badge.add(label(this, 96, 15, 'NEW PERSONAL BEST', 10, '#3a2400', { origin: 0.5, fontStyle: 'bold', letterSpacing: 1 }))
    }
    card.add(starRow(this, (DESIGN_W - 88) / 2, isBest ? 178 : 148, data.mode === 'journey' ? data.stars : data.won ? 3 : 0, 30, 3, true))
    if (level) {
      card.add(
        label(
          this,
          (DESIGN_W - 88) / 2,
          isBest ? 216 : 188,
          `${data.moves} moves used \u00b7 ${level.stars[1]} earns three stars`,
          13,
          '#b9c6f5',
          { origin: 0.5 },
        ),
      )
    } else {
      card.add(
        label(this, (DESIGN_W - 88) / 2, isBest ? 216 : 188, `${formatDuration(data.elapsed)} played`, 13, '#b9c6f5', {
          origin: 0.5,
        }),
      )
    }
  }

  private modeName(mode: ModeId): string {
    return mode === 'classic' ? 'CLASSIC ARCADE' : mode === 'timed' ? 'TIMED FRENZY' : mode === 'zen' ? 'ZEN GARDEN' : 'DAILY CHALLENGE'
  }

  private buildStats(root: Phaser.GameObjects.Container, data: ResultsPayload): void {
    const entries: [string, string][] = [
      ['FLUFFS FREED', formatNumber(data.cleared)],
      ['BEST CHAIN', `x${data.bestChain}`],
      ['BIGGEST MATCH', String(data.bestMatch)],
      ['FEVERS', String(data.fevers)],
      ['MOVES', String(data.moves)],
      ['PLAY TIME', formatDuration(data.elapsed)],
    ]
    const width = (DESIGN_W - 88 - 16) / 2
    entries.forEach(([title, value], index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const card = panel(this, 44 + col * (width + 16), 502 + row * 82, width, 70, {
        fill: '#121a33',
        side: '#070a14',
        radius: 18,
        raised: 3,
      })
      root.add(card)
      card.add(label(this, 18, 16, title, 10, '#ffe066', { fontStyle: 'bold', letterSpacing: 1.1 }))
      card.add(label(this, 18, 34, value, 20, '#ffffff', { fontStyle: 'bold' }))
    })
  }

  private buildActions(root: Phaser.GameObjects.Container, data: ResultsPayload, level: LevelData | undefined): void {
    const y = 790
    const nextId = level ? Math.min(500, level.id + 1) : 0
    if (data.mode === 'journey' && data.objectiveComplete && nextId > 0) {
      root.add(
        button(this, 44, y, DESIGN_W - 88, 74, 'NEXT LEVEL', () => fadeTo(this, 'Game', { mode: 'journey', levelId: nextId }), {
          fill: '#ff7043',
          size: 24,
          glow: true,
        }),
      )
      root.add(
        button(this, 44, y + 92, DESIGN_W - 88, 62, 'REPLAY LEVEL', () => fadeTo(this, 'Game', { mode: 'journey', levelId: level!.id }), {
          fill: '#2a5a8f',
          size: 18,
        }),
      )
    } else {
      root.add(
        button(this, 44, y, DESIGN_W - 88, 74, 'PLAY AGAIN', () => fadeTo(this, 'Game', { mode: data.mode, levelId: data.levelId }), {
          fill: '#ff7043',
          size: 24,
          glow: true,
        }),
      )
      root.add(
        button(this, 44, y + 92, DESIGN_W - 88, 62, 'TRY ANOTHER MODE', () => fadeTo(this, 'Menu'), {
          fill: '#2a5a8f',
          size: 18,
        }),
      )
    }
    root.add(
      button(this, 44, y + 172, (DESIGN_W - 88 - 14) / 2, 58, 'JOURNEY MAP', () => fadeTo(this, 'Journey'), {
        fill: '#243056',
        size: 15,
      }),
    )
    root.add(
      button(this, 44 + (DESIGN_W - 88 - 14) / 2 + 14, y + 172, (DESIGN_W - 88 - 14) / 2, 58, 'MENU', () => fadeTo(this, 'Menu'), {
        fill: '#243056',
        size: 15,
      }),
    )
  }

  /** A short celebration confined to the left margin, never over the panels. */
  private shower(root: Phaser.GameObjects.Container, data: ResultsPayload): void {
    if (!data.won) return
    const colors = [0xff6b6b, 0xffd166, 0x4ec4f0, 0x6fe3a0, 0xff8bf0]
    for (let index = 0; index < 22; index += 1) {
      const spark = this.add.image(24 + Math.random() * 130, 180 + Math.random() * 200, 'spark')
      spark.setTint(colors[index % colors.length]!)
      spark.setScale(0.18 + Math.random() * 0.3)
      root.add(spark)
      this.tweens.add({
        targets: spark,
        y: spark.y + 460 + Math.random() * 260,
        x: spark.x + (Math.random() - 0.5) * 60,
        alpha: { from: 0.9, to: 0 },
        angle: 180 + Math.random() * 180,
        duration: 1800 + Math.random() * 1400,
        delay: Math.random() * 900,
        repeat: -1,
        repeatDelay: 400 + Math.random() * 900,
      })
    }
  }
}
