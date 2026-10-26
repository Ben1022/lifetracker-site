// Port of Greeting.swift.
export function greetingText(date: Date): string {
  const hour = date.getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export type GreetingIcon = 'sun' | 'sunset' | 'moon'

export function greetingIcon(date: Date): GreetingIcon {
  const hour = date.getHours()
  return hour >= 5 && hour < 17 ? 'sun' : hour >= 17 && hour < 20 ? 'sunset' : 'moon'
}
