export const TIP_URL = 'https://www.buymeacoffee.com/jd4rider'

type TipWindow = Window & {
  LittleJoyArcade?: { tipJar?: { url?: string; open?: () => void } }
  LJA_TIP_URL?: string
}

/**
 * Open the arcade tip jar. The drop-in client owns the URL and the new-tab
 * handling; this fallback keeps the button working in a build that loads
 * without it (a bare static copy or an old Electron shell).
 */
export function openTipJar(): void {
  if (typeof window === 'undefined') return
  const arcade = (window as TipWindow).LittleJoyArcade
  if (arcade?.tipJar?.open) {
    arcade.tipJar.open()
    return
  }
  window.open(TIP_URL, '_blank', 'noopener,noreferrer')
}
