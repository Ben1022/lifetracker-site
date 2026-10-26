// The window: sign-in, or the dark sidebar (a tab bar on phones) with the current page.
import { useEffect } from 'preact/hooks'
import { auth, renew, signIn } from '../auth'
import { page, pageTitle, PAGES, sync, undoLastTaskChange, type Page } from '../state'
import { syncNow } from '../sync/engine'
import { Overlays, ReconnectBanner, isTyping } from './components'
import { Icon, type IconName } from './icons'
import { CalendarPage } from './pages/Calendar'
import { EmailsPage } from './pages/Emails'
import { NotesPage } from './pages/Notes'
import { OverviewPage } from './pages/Overview'
import { SettingsPage } from './pages/Settings'
import { TasksPage } from './pages/Tasks'

const pageIcon: Record<Page, IconName> = {
  overview: 'house', calendar: 'calendar', tasks: 'checkCircle', emails: 'envelope', notes: 'doc', settings: 'gear',
}

/** The page lives in the address's #fragment, so Back works and a reload stays put. */
export function startRouting() {
  const read = () => {
    const name = location.hash.slice(1) as Page
    if (name in pageTitle) page.value = name
  }
  read()
  window.addEventListener('hashchange', read)
}

export function go(target: Page) {
  page.value = target
  if (location.hash !== `#${target}`) history.pushState(null, '', `#${target}`)
}

export function App() {
  const status = auth.value.status
  if (status === 'loading') return null
  if (status === 'signedOut' || status === 'signingIn') return <SignIn />
  return <Shell />
}

function SignIn() {
  const { error, status } = auth.value
  return (
    <main class="signin">
      <div class="card">
        <div class="row" style={{ gap: 12 }}>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} width={44} height={44} alt="" style={{ borderRadius: 10 }} />
          <h1 class="t-title" style={{ margin: 0 }}>LifeTracker</h1>
        </div>
        <p class="t-callout" style={{ margin: 0 }}>
          Your calendar, unread email, tasks and notes from the LifeTracker Mac app.
        </p>
        <p class="t-body secondary" style={{ margin: 0 }}>
          Sign in with the Google account you use in the Mac app. Tasks and notes come from LifeTracker's own hidden
          folder in your Google Drive; nothing is kept in this browser after you close the tab.
        </p>
        {error && <div class="t-caption danger" role="alert">{error}</div>}
        <button class="accent-button" onClick={signIn} disabled={status === 'signingIn'}>
          <Icon name="person" size={16} />
          {status === 'signingIn' ? 'Signing in…' : 'Sign in with Google'}
        </button>
        <a class="t-caption" href="../privacy.html">Privacy</a>
      </div>
    </main>
  )
}

function Shell() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘Z / Ctrl+Z undoes the last task change, like the Mac.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTyping(e)) {
        e.preventDefault()
        undoLastTaskChange()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const current = page.value
  return (
    <div class="shell">
      <nav class="sidebar" aria-label="Pages">
        <div class="sidebar-title"><Icon name="person" size={18} />My Dashboard</div>
        {PAGES.map(p => <SidebarRow key={p} target={p} current={current} />)}
        <span class="spacer" />
        <SidebarRow target="settings" current={current} />
      </nav>
      <div class="main">
        <Banners />
        <main class="page" id="page" key={current}>
          {current === 'overview' && <OverviewPage />}
          {current === 'calendar' && <CalendarPage />}
          {current === 'tasks' && <TasksPage />}
          {current === 'emails' && <EmailsPage />}
          {current === 'notes' && <NotesPage />}
          {current === 'settings' && <SettingsPage />}
        </main>
        <nav class="tabbar" aria-label="Pages">
          {[...PAGES, 'settings' as Page].map(p => (
            <button key={p} aria-current={p === current ? 'page' : undefined} onClick={() => go(p)}>
              <Icon name={pageIcon[p]} />
              {pageTitle[p]}
            </button>
          ))}
        </nav>
      </div>
      <Overlays />
    </div>
  )
}

function SidebarRow({ target, current }: { target: Page; current: Page }) {
  return (
    <button class="sidebar-row" aria-current={target === current ? 'page' : undefined} onClick={() => go(target)}>
      <Icon name={pageIcon[target]} />
      {pageTitle[target]}
    </button>
  )
}

/** Sign-in expired, missing permissions, sync off on the Mac, or a sync error. */
function Banners() {
  const a = auth.value
  const s = sync.value
  if (a.status === 'expired') {
    return <ReconnectBanner message="Your Google sign-in expired. You're seeing what was loaded before." action="Continue"
      onReconnect={() => { renew().then(() => syncNow()).catch(() => {}) }} />
  }
  if (a.missingScopes) {
    return <ReconnectBanner message="LifeTracker needs access to Calendar, Gmail and its own Drive folder. Some pages are empty until you allow it."
      action="Allow" onReconnect={signIn} />
  }
  if (s.noFile) {
    return <ReconnectBanner message="Sync is off on your Mac. In the Mac app, turn on Settings → Accounts → Sync with Google Drive to see your tasks and notes here."
      action="Check Again" onReconnect={() => void syncNow()} />
  }
  if (s.error) {
    return <ReconnectBanner message={`Couldn't sync with Google Drive: ${s.error}`} action="Try Again" onReconnect={() => void syncNow()} />
  }
  return null
}
