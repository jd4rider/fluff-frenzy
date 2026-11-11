/*
 * Little Joy Arcade integration.
 *
 * The platform contract is the drop-in public/arcade-client.js that mirrors the
 * game's Web Storage keys into a signed-in player's arcade account and exposes
 * a small imperative API. That client has no achievement or leaderboard
 * endpoint, so this adapter reports only what the save payload can prove and
 * never invents a platform call. Everything degrades to local-only play.
 */

interface ArcadeUser {
  id?: string
  email?: string | null
}

interface ArcadeStatus {
  text: string
  signedIn: boolean
}

interface ArcadeClient {
  gameId: string
  configured: boolean
  signIn?: (email: string, password: string) => Promise<{ error: string | null }>
  signUp?: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>
  signOut?: () => Promise<void>
  syncNow?: (reason?: string) => Promise<void>
  push?: () => Promise<boolean>
  user?: () => ArcadeUser | null
  status?: () => ArcadeStatus
}

declare global {
  interface Window {
    LittleJoyArcade?: ArcadeClient
  }
}

export const ARCADE_URL = 'https://littlejoyarcade.site'
export const GAME_ID = 'fluff-frenzy'

function client(): ArcadeClient | undefined {
  return typeof window === 'undefined' ? undefined : window.LittleJoyArcade
}

function entitlementList(): string[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem('lja:entitlements')
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export const arcade = {
  available(): boolean {
    return Boolean(client()?.configured)
  },
  gameId(): string {
    return client()?.gameId ?? GAME_ID
  },
  signedIn(): boolean {
    return Boolean(client()?.status?.()?.signedIn)
  },
  userLabel(): string {
    return client()?.user?.()?.email ?? 'Guest player'
  },
  status(): string {
    return client()?.status?.()?.text ?? 'Playing locally'
  },
  async sync(reason = GAME_ID): Promise<void> {
    try {
      await client()?.syncNow?.(reason)
    } catch {
      // Offline is supported; the local save is already written.
    }
  },
  async push(): Promise<void> {
    try {
      await client()?.push?.()
    } catch {
      // ignore
    }
  },
  openArcade(): void {
    if (typeof window !== 'undefined') window.open(ARCADE_URL, '_blank', 'noopener,noreferrer')
  },
  adsAllowed(): boolean {
    const entitlements = entitlementList()
    return !entitlements.includes('arcade.ad_free') && !entitlements.includes(`${GAME_ID}.ad_free`)
  },
}
