export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

export function isSameDay(d1: Date | string, d2: Date | string): boolean {
  const date1 = typeof d1 === 'string' ? parseDate(d1) : d1
  const date2 = typeof d2 === 'string' ? parseDate(d2) : d2
  return formatDate(date1) === formatDate(date2)
}

export function isToday(date: Date | string): boolean {
  return isSameDay(date, new Date())
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function getDayOfWeek(date: Date): number {
  return date.getDay()
}
