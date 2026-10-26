// Port of Appearance.swift's color rules: readable accent text (blended in 5% steps until it reads
// at 4.5:1) and white or near-black text on accent fills, whichever contrasts more.

export const DEFAULT_ACCENT = '#5B3FD9'
export const PRESETS: { name: string; hex: string }[] = [
  { name: 'Purple', hex: '#5B3FD9' }, { name: 'Blue', hex: '#2F6BFF' }, { name: 'Teal', hex: '#0F9D9A' },
  { name: 'Green', hex: '#2E9E5B' }, { name: 'Orange', hex: '#F07A1A' }, { name: 'Red', hex: '#E5484D' },
  { name: 'Pink', hex: '#E54C9A' }, { name: 'Graphite', hex: '#5E6370' },
]

export type RGB = [number, number, number]

export const WHITE: RGB = [1, 1, 1]
export const BLACK: RGB = [0, 0, 0]
export const NEAR_BLACK: RGB = [0x14 / 255, 0x14 / 255, 0x1a / 255]
export const DARK_CARD: RGB = [0x22 / 255, 0x22 / 255, 0x28 / 255]
const DARK_WINDOW: RGB = [0.086, 0.086, 0.102]

export function parseHex(hex: string | undefined): RGB | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '')
  if (!match) return undefined
  const value = parseInt(match[1], 16)
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]
}

export function toHex([r, g, b]: RGB): string {
  const byte = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase()
}

/** NSColor.blended(withFraction:of:). */
export const blend = (a: RGB, fraction: number, b: RGB): RGB => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * fraction) as RGB

export function luminance([r, g, b]: RGB): number {
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const prefersWhiteText = (fill: RGB) => contrast(WHITE, fill) >= contrast(NEAR_BLACK, fill)

/** `color` blended toward `target` in 5% steps until it reads at 4.5:1 on `background`. */
export function readable(color: RGB, background: RGB, target: RGB): RGB {
  let result = color
  for (let step = 1; contrast(result, background) < 4.5 && step <= 20; step++) result = blend(color, step * 0.05, target)
  return result
}

/** Every accent-derived color, for light and dark mode, as CSS values. */
export function accentPalette(hex: string | undefined) {
  const base = parseHex(hex) ?? parseHex(DEFAULT_ACCENT)!
  return {
    accentLight: toHex(readable(base, WHITE, BLACK)),
    accentDark: toHex(readable(blend(base, 0.22, WHITE), DARK_CARD, WHITE)),
    softLight: toHex(blend(base, 0.9, WHITE)),
    softDark: toHex(blend(base, 0.78, DARK_WINDOW)),
    fill: toHex(base),
    onAccent: prefersWhiteText(base) ? '#FFFFFF' : '#14141A',
    sidebarTinted: toHex(blend(base, 0.86, BLACK)),
  }
}
