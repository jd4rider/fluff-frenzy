/**
 * All audio is synthesised at runtime with the Web Audio API, so the game ships
 * no sound files and works offline. Browsers only allow audio after a gesture,
 * hence `unlock()` wired to the first pointer/key event in main.ts.
 */

type Wave = OscillatorType

class AudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private musicTimer: number | null = null
  private step = 0
  sfxVolume = 0.7
  musicVolume = 0.4
  muted = false

  unlock(): void {
    if (typeof window === 'undefined') return
    if (!this.context) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.context = new Ctor()
      this.master = this.context.createGain()
      this.master.gain.value = this.muted ? 0 : 0.9
      this.master.connect(this.context.destination)
      this.sfxBus = this.context.createGain()
      this.sfxBus.gain.value = this.sfxVolume
      this.sfxBus.connect(this.master)
      this.musicBus = this.context.createGain()
      this.musicBus.gain.value = this.musicVolume * 0.5
      this.musicBus.connect(this.master)
    }
    if (this.context.state === 'suspended') void this.context.resume()
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfx))
    this.musicVolume = Math.max(0, Math.min(1, music))
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume
    if (this.musicBus) this.musicBus.gain.value = this.musicVolume * 0.5
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master && this.context) this.master.gain.value = muted ? 0 : 0.9
  }

  private tone(frequency: number, duration: number, options: { wave?: Wave; gain?: number; delay?: number; slideTo?: number } = {}): void {
    if (!this.context || !this.sfxBus) return
    const start = this.context.currentTime + (options.delay ?? 0)
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = options.wave ?? 'sine'
    osc.frequency.setValueAtTime(frequency, start)
    if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, options.slideTo), start + duration)
    const peak = (options.gain ?? 0.22) * 0.6
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  private noise(duration: number, gainValue = 0.16, delay = 0): void {
    if (!this.context || !this.sfxBus) return
    const frames = Math.floor(this.context.sampleRate * duration)
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < frames; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / frames) ** 2
    }
    const source = this.context.createBufferSource()
    source.buffer = buffer
    const gain = this.context.createGain()
    gain.gain.value = gainValue
    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1800
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxBus)
    source.start(this.context.currentTime + delay)
  }

  click(): void {
    this.tone(560, 0.06, { wave: 'triangle', gain: 0.12 })
  }

  slide(): void {
    this.tone(240, 0.05, { wave: 'sine', gain: 0.06, slideTo: 320 })
  }

  snap(): void {
    this.tone(420, 0.08, { wave: 'triangle', gain: 0.1, slideTo: 300 })
  }

  pop(chain = 1): void {
    const base = 520 + Math.min(chain, 6) * 90
    this.tone(base, 0.12, { wave: 'sine', gain: 0.16, slideTo: base * 1.5 })
    this.tone(base * 2, 0.08, { wave: 'triangle', gain: 0.07, delay: 0.02 })
    this.noise(0.09, 0.05)
  }

  squeak(high = false): void {
    this.tone(high ? 900 : 700, 0.08, { wave: 'square', gain: 0.05, slideTo: high ? 1200 : 950 })
  }

  fever(): void {
    const notes = [523, 659, 784, 1046]
    notes.forEach((note, index) => this.tone(note, 0.26, { wave: 'triangle', gain: 0.14, delay: index * 0.07 }))
  }

  win(): void {
    const notes = [523, 659, 784, 1046, 1318]
    notes.forEach((note, index) => this.tone(note, 0.32, { wave: 'triangle', gain: 0.16, delay: index * 0.1 }))
  }

  lose(): void {
    const notes = [440, 392, 330, 262]
    notes.forEach((note, index) => this.tone(note, 0.3, { wave: 'sine', gain: 0.14, delay: index * 0.12 }))
  }

  star(): void {
    this.tone(1180, 0.22, { wave: 'sine', gain: 0.14, slideTo: 1600 })
  }

  golden(): void {
    ;[784, 988, 1175, 1568].forEach((note, index) =>
      this.tone(note, 0.3, { wave: 'triangle', gain: 0.12, delay: index * 0.05 }),
    )
  }

  /**
   * A four-bar arpeggio that sits under play. It is intentionally sparse so it
   * never fights the match sounds.
   */
  startMusic(mood: 'menu' | 'play' | 'fever' = 'play'): void {
    this.unlock()
    if (!this.context || !this.musicBus) return
    this.stopMusic()
    const scales: Record<string, number[]> = {
      menu: [392, 523, 659, 523, 440, 587, 698, 587],
      play: [523, 659, 784, 659, 587, 698, 880, 698],
      fever: [659, 784, 988, 784, 740, 880, 1046, 880],
    }
    const notes = scales[mood]!
    const beat = mood === 'fever' ? 220 : 340
    this.step = 0
    this.musicTimer = window.setInterval(() => {
      if (!this.context || !this.musicBus) return
      const note = notes[this.step % notes.length]!
      const osc = this.context.createOscillator()
      const gain = this.context.createGain()
      osc.type = 'triangle'
      osc.frequency.value = note
      const start = this.context.currentTime
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + beat / 1000)
      osc.connect(gain)
      gain.connect(this.musicBus)
      osc.start(start)
      osc.stop(start + beat / 1000 + 0.02)
      this.step += 1
    }, beat)
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }
}

export const sound = new AudioEngine()
