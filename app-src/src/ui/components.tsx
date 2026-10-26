// Shared pieces, matching DesignSystem/Card.swift: Card, PageTitle, AccentButton, empty states,
// the Reconnect banner, sheets, pop-up menus and the Undo toast.
import { signal } from '@preact/signals'
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { toast, undoLastTaskChange } from '../state'
import { Icon, type IconName } from './icons'

export function Card({ title, footer, onFooter, children, class: className, action }: {
  title: string; footer?: string; onFooter?: () => void; children: ComponentChildren; class?: string; action?: ComponentChildren
}) {
  return (
    <section class={`card ${className ?? ''}`} aria-label={title}>
      <div class="row">
        <h2 class="t-section" style={{ margin: 0 }}>{title}</h2>
        <span class="spacer" />
        {action}
      </div>
      {children}
      {footer && <button class="card-footer" onClick={onFooter}>{footer}</button>}
    </section>
  )
}

export function PageTitle({ title, subtitle, dot }: { title: string; subtitle?: string; dot?: string }) {
  return (
    <div class="page-title">
      <h1>
        {dot && <span class="dot" style={{ background: dot }} />}
        <span class="ellipsis">{title}</span>
      </h1>
      {subtitle && <div class="t-body secondary">{subtitle}</div>}
    </div>
  )
}

export function Empty({ icon, title, description, children }: { icon: IconName; title: string; description?: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      {description && <div class="t-body">{description}</div>}
      {children}
    </div>
  )
}

export function ReconnectBanner({ message, action = 'Reconnect', onReconnect }: { message: string; action?: string; onReconnect: () => void }) {
  return (
    <div class="banner" role="status">
      <Icon name="warning" />
      <span class="spacer">{message}</span>
      <button class="accent-button compact" onClick={onReconnect}>{action}</button>
    </div>
  )
}

export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color, flex: 'none', display: 'inline-block' }} />
}

// MARK: Sheets

export function Sheet({ title, onClose, children, actions, width }: {
  title?: string; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren; width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [])
  return (
    <div class="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={width ? { width } : undefined}>
        <div class="sheet-body">
          {title && <h2 class="t-headline" style={{ margin: 0 }}>{title}</h2>}
          {children}
        </div>
        {actions && <div class="sheet-actions">{actions}</div>}
      </div>
    </div>
  )
}

/** A yes/no question, like the Mac's confirmation dialogs. */
export const confirmation = signal<{ title: string; message?: string; action: string; destructive?: boolean; onConfirm: () => void } | undefined>(undefined)

export function confirm(options: { title: string; message?: string; action: string; destructive?: boolean; onConfirm: () => void }) {
  confirmation.value = options
}

function ConfirmSheet() {
  const c = confirmation.value
  if (!c) return null
  const close = () => { confirmation.value = undefined }
  return (
    <Sheet title={c.title} onClose={close} width={380} actions={<>
      <span class="spacer" />
      <button class="plain-button" onClick={close}>Cancel</button>
      <button class={c.destructive ? 'plain-button destructive' : 'accent-button'} data-autofocus onClick={() => { close(); c.onConfirm() }}>{c.action}</button>
    </>}>
      {c.message && <div class="t-body secondary">{c.message}</div>}
    </Sheet>
  )
}

// MARK: Menus

export type MenuItem =
  | { label: string; action: () => void; disabled?: boolean; destructive?: boolean; icon?: IconName }
  | { section: string }
  | 'divider'

const openMenu = signal<{ x: number; y: number; items: MenuItem[] } | undefined>(undefined)

/** Shows a menu at the pointer (right-click) or under the clicked button. */
export function showMenu(event: MouseEvent, items: MenuItem[]) {
  event.preventDefault()
  event.stopPropagation()
  let { clientX: x, clientY: y } = event
  if (event.type === 'click' && event.currentTarget instanceof HTMLElement) {
    const rect = event.currentTarget.getBoundingClientRect()
    x = rect.left
    y = rect.bottom + 4
  }
  openMenu.value = { x, y, items }
}

function Menu() {
  const menu = openMenu.value
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu || !ref.current) return
    // Keep it on screen.
    const rect = ref.current.getBoundingClientRect()
    const x = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))
    const y = menu.y + rect.height > window.innerHeight - 8 ? Math.max(8, menu.y - rect.height) : menu.y
    ref.current.style.left = `${x}px`
    ref.current.style.top = `${y}px`
    ref.current.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const close = () => { openMenu.value = undefined }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const buttons = [...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement as HTMLElement)
        buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }
    }
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])
  if (!menu) return null
  return (
    <div class="menu" role="menu" ref={ref} style={{ left: menu.x, top: menu.y }} onContextMenu={e => e.preventDefault()}>
      {menu.items.map((item, i) => {
        if (item === 'divider') return <hr key={i} />
        if ('section' in item) return <div key={i} class="menu-label">{item.section}</div>
        return (
          <button key={i} role="menuitem" disabled={item.disabled} class={item.destructive ? 'destructive' : ''}
            onClick={() => { openMenu.value = undefined; item.action() }}>
            {item.icon && <Icon name={item.icon} size={14} />}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

// MARK: Toast

function Toast() {
  const t = toast.value
  if (!t) return null
  return (
    <div class="toast" role="status" key={t.id}>
      <span>{t.message}</span>
      <button onClick={undoLastTaskChange}>Undo</button>
    </div>
  )
}

/** The pop-ups that float over every page. */
export function Overlays() {
  return <><Menu /><ConfirmSheet /><Toast /></>
}

/** A segmented control (the Mac's `.pickerStyle(.segmented)`). */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string
}) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function IconButton({ icon, label, onClick, class: className, style }: {
  icon: IconName; label: string; onClick: (e: MouseEvent) => void; class?: string; style?: JSX.CSSProperties
}) {
  return (
    <button class={`icon-button ${className ?? ''}`} aria-label={label} title={label} onClick={onClick} style={style}>
      <Icon name={icon} />
    </button>
  )
}

/** True while typing in a field, so page shortcuts leave the keys alone. */
export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** Up/down arrows move through `ids` (the Mac's arrowKeySelection). Returns true when handled. */
export function stepSelection(event: KeyboardEvent, ids: string[], selected: string | undefined, select: (id: string) => void): boolean {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false
  if (!ids.length) return false
  event.preventDefault()
  const index = selected ? ids.indexOf(selected) : -1
  const next = index < 0 ? ids[0] : ids[Math.min(Math.max(index + (event.key === 'ArrowDown' ? 1 : -1), 0), ids.length - 1)]
  select(next)
  document.getElementById(`row-${next}`)?.scrollIntoView({ block: 'nearest' })
  return true
}

/** True while the window is narrower than `width` px (the Mac's narrow-window rules). */
export function useNarrow(width: number): boolean {
  const query = `(max-width: ${width - 1}px)`
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return narrow
}
