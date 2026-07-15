import { addDays, getDayOfWeek } from './date'

export interface CalendarDay {
  date: string
  dayOfWeek: number
  isCurrentMonth: boolean
  isToday: boolean
}

export function getCalendarGrid(year: number, month: number): CalendarDay[][] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = getDayOfWeek(firstDay)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const grid: CalendarDay[][] = []
  let currentDate = addDays(firstDay, -startDayOfWeek)

  for (let week = 0; week < 6; week++) {
    const row: CalendarDay[] = []
    for (let day = 0; day < 7; day++) {
      const y = currentDate.getFullYear()
      const m = String(currentDate.getMonth() + 1).padStart(2, '0')
      const d = String(currentDate.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${d}`

      row.push({
        date: dateStr,
        dayOfWeek: day,
        isCurrentMonth: currentDate.getMonth() === month,
        isToday: dateStr === todayStr
      })

      currentDate = addDays(currentDate, 1)
    }
    grid.push(row)
  }

  return grid
}

export function getPreviousMonth(year: number, month: number) {
  if (month === 0) {
    return { year: year - 1, month: 11 }
  }
  return { year, month: month - 1 }
}

export function getNextMonth(year: number, month: number) {
  if (month === 11) {
    return { year: year + 1, month: 0 }
  }
  return { year, month: month + 1 }
}
