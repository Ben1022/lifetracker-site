// Simple line icons standing in for the Mac's SF Symbols. Decorative: buttons that show only an
// icon carry their own aria-label.
import type { JSX } from 'preact'

const paths: Record<string, JSX.Element> = {
  house: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M10 20v-6h4v6" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  checkCircle: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.8 2.8L16.2 9.5" /></>,
  circle: <circle cx="12" cy="12" r="8.5" />,
  envelope: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6.5L20.5 7" /></>,
  envelopeOpen: <><path d="M3 10v9.5h18V10L12 4z" /><path d="m3.5 10.5 8.5 6 8.5-6" /></>,
  doc: <><path d="M6 3h8.5L19 7.5V21H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /><circle cx="12" cy="12" r="6.3" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  plusCircle: <><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /><path d="M12 7.5v9M7.5 12h9" stroke="var(--card)" stroke-width="2.2" /></>,
  repeat: <><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19l-3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5l3 3" /></>,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  bellSlash: <><path d="M6.3 9.5A5.7 5.7 0 0 1 17.7 9.5c0 4.5 1.8 6.5 1.8 6.5h-15s1.8-2 1.8-6.5M10 19.5a2 2 0 0 0 4 0" /><path d="M3.5 3.5l17 17" /></>,
  bell: <path d="M6.3 9.5A5.7 5.7 0 0 1 17.7 9.5c0 4.5 1.8 6.5 1.8 6.5h-15s1.8-2 1.8-6.5M10 19.5a2 2 0 0 0 4 0" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  sparkle: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" fill="currentColor" stroke="none" />,
  pin: <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" />,
  pinFill: <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" fill="currentColor" />,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  xmark: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <path d="M4 6.5h16M9 6.5V4h6v2.5M6.5 6.5l1 13.5h9l1-13.5" />,
  sun: <><circle cx="12" cy="12" r="4" fill="currentColor" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3 7 7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" /></>,
  sunset: <><path d="M7 16a5 5 0 0 1 10 0M3 16h18M5.5 20h13M12 4v5M9.5 7 12 9.5 14.5 7" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" fill="currentColor" />,
  warning: <><path d="M12 3.5 2.5 20h19z" fill="currentColor" stroke="none" /><path d="M12 10v4.5M12 17v.5" stroke="var(--card)" stroke-width="2" /></>,
  hash: <path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M3.5 15h15" />,
  flag: <path d="M5 21V4h11l-2 4 2 4H5" fill="currentColor" />,
  sidebarRight: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M15 4.5v15" /></>,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15" />,
  person: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3.2" /><path d="M6.3 18.6a6.5 6.5 0 0 1 11.4 0" /></>,
  ellipsis: <><circle cx="6" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18" cy="12" r="1.3" fill="currentColor" /></>,
  tray: <path d="M3.5 13.5 6 5h12l2.5 8.5V19h-17zM3.5 13.5H9a3 3 0 0 0 6 0h5.5" />,
  reply: <path d="M10 6 4 12l6 6M4.5 12H14a6 6 0 0 1 6 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  newspaper: <><path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2" /><path d="M7.5 9h6M7.5 12.5h6M7.5 16h4" /></>,
  compose: <path d="M12 4H5v15h15v-7M18 3.5l2.5 2.5-8 8H10v-2.5z" />,
  signOut: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
}

export type IconName = keyof typeof paths

export function Icon({ name, size, class: className, style }: { name: IconName; size?: number; class?: string; style?: JSX.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} class={className} style={style} aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      {paths[name]}
    </svg>
  )
}
