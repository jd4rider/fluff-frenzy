import Phaser from 'phaser'
import { ACHIEVEMENTS, save, totalStars } from '../core/saves'
import { WORLDS } from '../data/worlds'
import { Backdrop } from './Backdrop'
import { display, fadeIn, fadeTo, formatDuration, formatNumber, header, label, panel } from './common'
import { DESIGN_H, DESIGN_W, designStage } from './layout'

/** Statistics and trophies, read straight from the save. */
export class StatsScene extends Phaser.Scene {
  constructor() {
    super('Stats')
  }

  create(): void {
    fadeIn(this)
    const stage = designStage(this)
    const data = save()
    const backdrop = new Backdrop(this, WORLDS[9]!, { dim: 0.45 })
    stage.root.add(backdrop.container)
    header(this, stage.root, 'STATISTICS', () => this.scene.start('Menu'), '#ffe066')

    const entries: [string, string][] = [
      ['FLUFFS FREED', formatNumber(data.stats.cleared)],
      ['STARS', `${totalStars(data)} / 1500`],
      ['BEST CHAIN', `x${data.stats.bestChain}`],
      ['BIGGEST MATCH', String(data.stats.bestMatch)],
      ['FEVERS', String(data.stats.fevers)],
      ['GOLDEN FLUFFS', String(data.stats.golden)],
      ['CLASSIC BEST', formatNumber(data.classicBest)],
      ['TIMED BEST', formatNumber(data.timedBest)],
      ['JOURNEY LEVELS', `${Object.keys(data.journey).length} / 500`],
      ['PLAY TIME', formatDuration(data.stats.playMs)],
    ]
    const width = (DESIGN_W - 72 - 14) / 2
    entries.forEach(([title, value], index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const card = panel(this, 36 + col * (width + 14), 120 + row * 76, width, 66, {
        fill: '#131b33',
        side: '#070a14',
        radius: 18,
        raised: 3,
      })
      stage.root.add(card)
      card.add(label(this, 16, 12, title, 10, '#ffe066', { fontStyle: 'bold', letterSpacing: 1 }))
      card.add(label(this, 16, 30, value, 19, '#ffffff', { fontStyle: 'bold' }))
    })

    stage.root.add(label(this, 36, 530, 'TROPHIES', 13, '#ffe066', { fontStyle: 'bold', letterSpacing: 1.5 }))
    ACHIEVEMENTS.forEach((achievement, index) => {
      const earned = data.achievements.includes(achievement.id)
      const y = 558 + index * 58
      const card = panel(this, 36, y, DESIGN_W - 72, 50, {
        fill: earned ? '#1e3a2f' : '#121a30',
        side: '#070a14',
        radius: 14,
        raised: 2,
        highlight: false,
      })
      stage.root.add(card)
      card.add(label(this, 16, 15, earned ? '\u2605' : '\u2606', 16, earned ? '#ffe066' : '#5d6a90', { origin: 0 }))
      card.add(label(this, 44, 10, achievement.name, 13, earned ? '#ffffff' : '#7d89ad', { fontStyle: 'bold' }))
      card.add(label(this, 44, 27, achievement.hint, 10, earned ? '#9fb0e4' : '#5d6a90'))
      if (earned) card.add(label(this, DESIGN_W - 104, 17, 'EARNED', 9, '#6fe3a0', { origin: [1, 0], fontStyle: 'bold', letterSpacing: 1 }))
    })

    stage.root.add(display(this, DESIGN_W / 2, DESIGN_H - 66, 'TAP BACK TO RETURN', 12, '#ffffff', 0.5).setAlpha(0.4))
    void fadeTo
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => backdrop.destroy())
  }
}
