// Authenticated calls to Google's REST APIs.
import { AuthError, auth, token } from '../auth'

export class GoogleAPIError extends Error {
  constructor(public status: number, public body: string) {
    super(status === 401 ? 'Google sign-in expired.' : status === 403 ? 'Google denied access. Check the API is enabled and you allowed access.' : `Google returned HTTP ${status}.`)
  }
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** Swappable for the demo harness. */
export let fetcher: Fetcher = (url, init) => fetch(url, init)
export const setFetcher = (f: Fetcher) => { fetcher = f }

export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token()}`)
  const response = await fetcher(url, { ...init, headers })
  if (response.status === 401) {
    if (auth.value.status === 'signedIn') auth.value = { ...auth.value, status: 'expired' }
    throw new AuthError('Google sign-in expired')
  }
  if (!response.ok) throw new GoogleAPIError(response.status, await response.text())
  return response
}

export const getJSON = async <T>(url: string): Promise<T> => (await googleFetch(url)).json() as Promise<T>
