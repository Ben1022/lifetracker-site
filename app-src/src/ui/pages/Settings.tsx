// Settings: your Google account and sync, then the settings shared with the Mac (name, default
// list, accent, sidebar, muted events). Light/dark applies to this visit only.
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { auth, signOut } from '../../auth'
import { timeText } from '../../logic/dates'
import { DEFAULT_ACCENT, PRESETS, parseHex, prefersWhiteText } from '../../logic/appearance'
import { addMuteKeyword, deleteRules } from '../../logic/calendar'
import { defaultList } from '../../logic/filters'
import type { MuteKind, SyncMuteRule } from '../../sync/document'
import { syncNow } from '../../sync/engine'
import { change, claudeEnabled, colorMode, doc, lists, muteRules, sync, updateSettings } from '../../state'
import { PageTitle, Segmented } from '../components'
import { Icon, type IconName } from '../icons'

function Section({ title, footer, children }: { title: string; footer?: string; children: ComponentChildren }) {
  return (
    <section class="settings-section" aria-label={title}>
      <h2 class="t-section secondary">{title}</h2>
      <div class="settings-group">{children}</div>
      {footer && <p class="t-caption secondary">{footer}</p>}
    </section>
  )
}

function Row({ label, children }: { label?: ComponentChildren; children?: ComponentChildren }) {
  return <div class="settings-row">{label && <span class="t-body">{label}</span>}<span class="spacer" />{children}</div>
}

export function SettingsPage() {
  const settings = doc.value.settings
  const s = sync.value
  const [name, setName] = useState(settings?.userName ?? '')
  const accent = settings?.accentColor ?? DEFAULT_ACCENT
  const defaultID = defaultList(lists.value, settings?.defaultListID)?.id

  return (
    <div class="settings-page">
      <PageTitle title="Settings" />

      <Section title="Google Account" footer="LifeTracker on the web reads your Google Calendar and Gmail, and keeps your tasks and notes in step with your Mac through a hidden LifeTracker folder in your Google Drive. Nothing is saved in this browser.">
        <Row label={<span class="row"><Icon name="person" size={16} class="secondary" />{auth.value.email ?? 'Signed in'}</span>}>
          <button class="plain-button" onClick={() => { signOut(); location.reload() }}><Icon name="signOut" size={14} />Sign Out</button>
        </Row>
      </Section>

      <Section title="Sync with Your Mac" footer={s.noFile ? 'Sync is off on your Mac. In the Mac app, open Settings → Accounts and turn on Sync with Google Drive.' : undefined}>
        <Row label={s.syncing ? 'Syncing…' : s.lastSyncedAt ? `Last synced at ${timeText(s.lastSyncedAt)}` : 'Not synced yet'}>
          <button class="plain-button" onClick={() => void syncNow()} disabled={s.syncing}><Icon name="refresh" size={14} />Sync Now</button>
        </Row>
        {s.error && <Row label={<span class="danger">{s.error}</span>} />}
        <Row label={claudeEnabled.value ? 'Claude is on in the Mac app. Its daily briefing shows on the Overview.' : 'Claude is off in the Mac app, so there is no daily briefing.'} />
      </Section>

      <Section title="General">
        <Row label={<label for="settings-name">Your name</label>}>
          <input id="settings-name" class="text-input" style={{ maxWidth: 220 }} placeholder="Shown in the greeting" value={name}
            onInput={e => setName(e.currentTarget.value)} onBlur={() => updateSettings({ userName: name.trim() })}
            onKeyDown={e => { if (e.key === 'Enter') updateSettings({ userName: name.trim() }) }} />
        </Row>
        <Row label={<label for="settings-list">Default list</label>}>
          <select id="settings-list" class="text-input" style={{ maxWidth: 220 }} value={defaultID} disabled={!lists.value.length}
            onChange={e => updateSettings({ defaultListID: e.currentTarget.value })}>
            {lists.value.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Row>
      </Section>

      <Section title="Accent Color" footer="Used for buttons, highlights and the sidebar selection. Changes here apply on your Mac too.">
        <div class="swatches">
          {PRESETS.map(p => {
            const selected = accent.toUpperCase() === p.hex.toUpperCase()
            return (
              <button key={p.hex} class="swatch" aria-pressed={selected} aria-label={p.name} title={p.name} onClick={() => updateSettings({ accentColor: p.hex })}>
                <span style={{ background: p.hex, boxShadow: selected ? '0 0 0 2px var(--card), 0 0 0 4px color-mix(in srgb, var(--text) 50%, transparent)' : undefined }}>
                  {selected && <Icon name="check" size={13} style={{ color: prefersWhiteText(parseHex(p.hex)!) ? '#fff' : '#14141A', strokeWidth: 3 }} />}
                </span>
                <span class="t-caption secondary">{p.name}</span>
              </button>
            )
          })}
        </div>
        <Row label={<label for="settings-color">Custom color</label>}>
          <input id="settings-color" type="color" value={accent} onChange={e => updateSettings({ accentColor: e.currentTarget.value.toUpperCase() })} />
          <button class="plain-button" disabled={accent === DEFAULT_ACCENT} onClick={() => updateSettings({ accentColor: DEFAULT_ACCENT })}>Reset to Purple</button>
        </Row>
      </Section>

      <Section title="Light and Dark" footer="For this visit only. System follows your device's setting.">
        <Row label="Appearance">
          <Segmented label="Appearance" value={colorMode.value} onChange={v => { colorMode.value = v }}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Row>
      </Section>

      <Section title="Sidebar" footer="Neutral is a dark graphite that goes with any accent. Tinted uses a very dark shade of your accent color.">
        <Row label="Sidebar">
          <Segmented label="Sidebar" value={settings?.sidebarStyle === 'tinted' ? 'tinted' : 'neutral'} onChange={v => updateSettings({ sidebarStyle: v })}
            options={[{ value: 'neutral', label: 'Neutral' }, { value: 'tinted', label: 'Tinted' }]} />
        </Row>
      </Section>

      <MutedEvents />
    </div>
  )
}

const kindIcon: Record<MuteKind, IconName> = { series: 'repeat', title: 'calendar', keyword: 'hash' }
const kindText: Record<MuteKind, string> = {
  series: 'Every occurrence of this repeating event', title: 'Events with this exact title', keyword: 'Any event whose title contains this',
}

/** Rules with the same name (e.g. one per event series) show as one row, in the order they were added. */
function MutedEvents() {
  const [keyword, setKeyword] = useState('')
  const groups = new Map<string, SyncMuteRule[]>()
  for (const rule of [...muteRules.value].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    groups.set(rule.label, [...(groups.get(rule.label) ?? []), rule])
  }
  const add = (e: Event) => {
    e.preventDefault()
    if (!keyword.trim()) return
    change(d => addMuteKeyword(d, keyword))
    setKeyword('')
  }
  const describe = (rules: SyncMuteRule[]) => rules.length > 1 && rules.every(r => r.kind === 'series')
    ? `Every occurrence of ${rules.length} repeating events with this name` : kindText[rules[0].kind]
  return (
    <Section title="Muted Events" footer={claudeEnabled.value
      ? "Muted events stay on your calendar and still count as busy time. They're dimmed on Today's Schedule, and the briefing and chat won't remind you about them."
      : "Muted events stay on your calendar and still count as busy time. They're dimmed on Today's Schedule."}>
      {groups.size === 0 && <Row label={<span class="secondary">Nothing muted yet. Right-click any event and choose Don't Mention in Briefing, or add a keyword below.</span>} />}
      {[...groups.entries()].map(([label, rules]) => (
        <Row key={label} label={
          <span class="row" style={{ alignItems: 'flex-start' }}>
            <Icon name={kindIcon[rules[0].kind]} size={16} class="secondary" style={{ marginTop: 1 }} />
            <span class="col"><span>{label}</span><span class="t-caption secondary">{describe(rules)}</span></span>
          </span>
        }>
          <button class="link-button" title={`Stop muting ${label}`} onClick={() => change(d => deleteRules(d, rules.map(r => r.id)))}>Unmute</button>
        </Row>
      ))}
      <form class="settings-row" onSubmit={add}>
        <input class="text-input" aria-label="Mute events containing…" placeholder="Mute events containing… e.g. Lecture, Lab" value={keyword}
          onInput={e => setKeyword(e.currentTarget.value)} />
        <button class="plain-button" type="submit" disabled={!keyword.trim()}>Add</button>
      </form>
      <Row label={<label for="settings-hide">Hide muted events from Today's Schedule</label>}>
        <input id="settings-hide" type="checkbox" checked={doc.value.settings?.hideMuted ?? false} onChange={e => updateSettings({ hideMuted: e.currentTarget.checked })} />
      </Row>
    </Section>
  )
}
