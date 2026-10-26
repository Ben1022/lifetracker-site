// Applies the synced accent color and sidebar style, and this visit's light/dark choice, to the
// page's CSS variables (the web side of Appearance.swift).
import { effect } from '@preact/signals'
import { accentPalette } from './logic/appearance'
import { accentHex, colorMode, doc } from './state'

export function startTheme() {
  effect(() => {
    const palette = accentPalette(accentHex.value)
    const root = document.documentElement.style
    root.setProperty('--accent-light', palette.accentLight)
    root.setProperty('--accent-dark', palette.accentDark)
    root.setProperty('--accent-soft-light', palette.softLight)
    root.setProperty('--accent-soft-dark', palette.softDark)
    root.setProperty('--accent-fill', palette.fill)
    root.setProperty('--on-accent', palette.onAccent)
    // "Tinted" takes a very dark shade of the accent; "Neutral" is graphite.
    root.setProperty('--sidebar-bg', doc.value.settings?.sidebarStyle === 'tinted' ? palette.sidebarTinted : '#131316')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.fill)
  })
  effect(() => {
    const mode = colorMode.value
    if (mode === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', mode)
  })
}
