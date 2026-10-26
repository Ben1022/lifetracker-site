// Google sign-in with Google Identity Services' token model: a short-lived access token kept in
// memory only (never in browser storage), renewed while you stay signed in to Google, revoked on
// sign-out. Each browser tab signs in once per visit.
import { signal } from '@preact/signals'
import { GOOGLE_CLIENT_ID, SCOPES } from './config'

export type AuthStatus = 'loading' | 'signedOut' | 'signingIn' | 'signedIn' | 'expired'

export const auth = signal<{ status: AuthStatus; email?: string; error?: string; missingScopes?: boolean }>({ status: 'loading' })

let tokenClient: any
let accessToken: string | undefined
let expiresAt = 0
let renewTimer: ReturnType<typeof setTimeout> | undefined
let waiting: { resolve: () => void; reject: (e: Error) => void } | undefined
let loginHint: string | undefined

declare global {
  interface Window { google?: any }
}

export class AuthError extends Error {}

/** Loads Google's sign-in script (the only third-party script, allowed by the page's CSP). */
export function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Couldn't load Google sign-in. Check your connection."))
    document.head.appendChild(script)
  })
}

export async function initAuth(onSignedIn: () => void) {
  try {
    await loadGoogleScript()
  } catch (error) {
    auth.value = { status: 'signedOut', error: (error as Error).message }
    return
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES.join(' '),
    include_granted_scopes: true,
    callback: async (response: any) => {
      if (response.error) {
        failWaiting(response.error_description ?? response.error)
        return
      }
      const granted = window.google.accounts.oauth2.hasGrantedAllScopes(response, ...SCOPES.slice(2))
      accessToken = response.access_token
      expiresAt = Date.now() + Number(response.expires_in ?? 3600) * 1000
      scheduleRenewal()
      const wasSignedIn = auth.value.status === 'signedIn' || auth.value.status === 'expired'
      const email = auth.value.email ?? (await fetchEmail())
      loginHint = email
      auth.value = { status: 'signedIn', email, missingScopes: !granted }
      waiting?.resolve()
      waiting = undefined
      if (!wasSignedIn) onSignedIn()
    },
    error_callback: (error: any) => {
      // Usually a blocked or closed pop-up; renewal then needs a click.
      failWaiting(error?.type === 'popup_closed' ? 'Sign-in was cancelled.' : error?.message ?? 'Sign-in failed.')
    },
  })
  auth.value = { status: 'signedOut' }
}

function failWaiting(message: string) {
  if (auth.value.status === 'signingIn') auth.value = { status: 'signedOut', error: message }
  else if (auth.value.status === 'signedIn' && Date.now() >= expiresAt - 60_000) auth.value = { ...auth.value, status: 'expired' }
  waiting?.reject(new AuthError(message))
  waiting = undefined
}

/** Opens Google's sign-in pop-up. Call from a click. */
export function signIn() {
  if (!tokenClient) return
  auth.value = { status: 'signingIn' }
  tokenClient.requestAccessToken({ prompt: '' })
}

/** "Continue" on the expired banner: a fresh token without a new consent screen. */
export function renew(): Promise<void> {
  if (!tokenClient) return Promise.reject(new AuthError('Not signed in'))
  return new Promise((resolve, reject) => {
    waiting = { resolve, reject }
    tokenClient.requestAccessToken({ prompt: '', login_hint: loginHint })
  })
}

function scheduleRenewal() {
  clearTimeout(renewTimer)
  // Five minutes before it runs out. Browsers may block the silent pop-up; then the banner asks for a click.
  renewTimer = setTimeout(() => { renew().catch(() => { auth.value = { ...auth.value, status: 'expired' } }) }, Math.max(expiresAt - Date.now() - 5 * 60_000, 10_000))
}

export function signOut() {
  clearTimeout(renewTimer)
  if (accessToken) window.google?.accounts?.oauth2?.revoke(accessToken, () => {})
  accessToken = undefined
  expiresAt = 0
  auth.value = { status: 'signedOut' }
}

/** A valid access token, or an AuthError (the UI then shows "Continue"). */
export function token(): string {
  if (!accessToken || Date.now() >= expiresAt - 30_000) {
    if (auth.value.status === 'signedIn') auth.value = { ...auth.value, status: 'expired' }
    throw new AuthError('Google sign-in expired')
  }
  return accessToken
}

async function fetchEmail(): Promise<string | undefined> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
    return response.ok ? (await response.json()).email : undefined
  } catch {
    return undefined
  }
}

/** For the demo/test harness only. */
export function setTestToken(value: string, email: string) {
  accessToken = value
  expiresAt = Date.now() + 3600_000
  auth.value = { status: 'signedIn', email }
}
