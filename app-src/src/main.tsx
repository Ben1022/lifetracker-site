import { render } from 'preact'
import './styles.css'
import { initAuth } from './auth'
import { startGoogle } from './google/loader'
import { startSync } from './sync/engine'
import { startTheme } from './theme'
import { App, startRouting } from './ui/App'

async function boot() {
  startTheme()
  startRouting()
  // `npm run dev` with ?demo runs on sample data and a pretend Google, with no sign-in. Left out of the built site.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    const { startDemo } = await import('./demo/demo')
    startDemo()
  } else {
    void initAuth(() => {
      startSync()
      startGoogle()
    })
  }
  render(<App />, document.getElementById('app')!)
}

void boot()
