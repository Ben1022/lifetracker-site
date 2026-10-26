// The "Web application" OAuth client from Google Cloud Console (same project as the Mac app).
// Client IDs aren't secret: Google only accepts it from https://ben1022.github.io (and localhost while testing).
export const GOOGLE_CLIENT_ID = '392037162423-vkarrsdssu4dhgusiqkbgk253n0mo1t0.apps.googleusercontent.com'

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  // Only LifeTracker's own hidden app folder, never your Drive files.
  'https://www.googleapis.com/auth/drive.appdata',
]
