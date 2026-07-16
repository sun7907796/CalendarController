import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Event } from '../types'
import { electronAPI } from '../services/ipc'
import { useToast } from '../composables/useToast'

function generateLocalEventId(): string {
  return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// 取時間的 HH:mm 部分（相容舊資料：完整 ISO 或已是 HH:mm）
function timePart(t?: string): string {
  if (!t) return ''
  return t.includes('T') ? t.substring(11, 16) : t
}

// 推導事件的結束日期（含當日）；相容舊資料
function deriveEndDate(ev: Event): string {
  if (ev.endDate) return ev.endDate
  if (ev.endTime && ev.endTime.includes('T')) return ev.endTime.substring(0, 10)
  return ev.date
}

export const useEventsStore = defineStore('events', () => {
  const events = ref<Event[]>([])
  const currentMonth = ref(new Date())
  const loading = ref(false)
  const { show: showToast } = useToast()

  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date()
  const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const selectedDate = ref<string>(todayStr)

  const eventsByDate = computed(() => {
    const map = new Map<string, Event[]>()
    const push = (dateStr: string, ev: Event) => {
      if (!map.has(dateStr)) map.set(dateStr, [])
      map.get(dateStr)!.push(ev)
    }

    for (const event of events.value) {
      const startStr = (event.date || '').slice(0, 10)
      const endStr = deriveEndDate(event).slice(0, 10)
      const start = new Date(startStr + 'T00:00:00')
      const end = new Date(endStr + 'T00:00:00')

      // 跨天事件（全天或時段）展開到每一天（含結束當日）
      if (endStr > startStr && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const cur = new Date(start)
        while (cur <= end) {
          const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
          push(dateStr, event)
          cur.setDate(cur.getDate() + 1)
        }
      } else {
        push(startStr, event)
      }
    }
    return map
  })

  function getEventsForDate(date: string): Event[] {
    return eventsByDate.value.get(date) || []
  }

  async function loadEvents() {
    loading.value = true
    try {
      const loadedEvents = await electronAPI.events.load()
      console.log(`[loadEvents] 從文件加載 ${loadedEvents.length} 個事件`)
      loadedEvents.forEach((event, idx) => {
        console.log(`  事件 ${idx + 1}: ${event.date} ~ ${event.endTime || event.date}, 標題=${event.title}, colorId=${event.colorId}, allDay=${event.allDay}`)
      })
      events.value = loadedEvents
      console.log(`[loadEvents] 設置到 events.value 後，當前長度: ${events.value.length}`)
      console.log(`[loadEvents] events.value:`, events.value)
    } finally {
      loading.value = false
    }
  }

  async function saveEvents() {
    await electronAPI.events.save(JSON.parse(JSON.stringify(events.value)))
  }

  async function addEvent(event: Omit<Event, 'id'>) {
    const newEvent: Event = {
      id: generateLocalEventId(),
      ...event,
      updatedAt: new Date().toISOString()
    }
    events.value.push(newEvent)
    await saveEvents()

    // 推送新事件到 Google
    await pushEventToGoogle(newEvent)

    return newEvent
  }

  async function updateEvent(id: string, updates: Partial<Event>) {
    const idx = events.value.findIndex(e => e.id === id)
    if (idx >= 0) {
      const before = { ...events.value[idx] }
      events.value[idx] = {
        ...before,
        ...updates,
        updatedAt: new Date().toISOString()
      }
      const newEvent = events.value[idx]

      // 若已同步且改選了其他日曆 → 記住原始日曆（供移動用）
      const beforeCal = before.calendarId || 'primary'
      const afterCal = newEvent.calendarId || 'primary'
      if (newEvent.googleId && afterCal !== beforeCal && newEvent._moveFrom === undefined) {
        newEvent._moveFrom = beforeCal
      }

      await saveEvents()
      await pushEventToGoogle(newEvent)
    }
  }

  // 將單一事件推送到 Google（新增 / 更新 / 移動日曆），失敗時提示並保留待同步標記
  async function pushEventToGoogle(ev: Event) {
    const body = convertToGoogleFormat(ev)
    if (!body) return

    if (!ev.googleId) {
      // 新事件 → 建立到 Google
      const created = await electronAPI.google.createEvent({
        calendarId: ev.calendarId || 'primary',
        event: body
      })
      if (created.ok && created.id) {
        ev.googleId = created.id
        await saveEvents()
      } else if (!created.ok) {
        showToast('推送到 Google 失敗：' + (created.reason || '未知'))
      }
    } else {
      // 既有事件 → 更新（必要時連同移動到新日曆）
      const res = await electronAPI.google.updateEvent({
        calendarId: ev.calendarId || 'primary',
        googleId: ev.googleId,
        event: body,
        fromCalendarId: ev._moveFrom
      })
      if (res.ok) {
        if (ev._moveFrom !== undefined) {
          delete ev._moveFrom
          await saveEvents()
        }
      } else {
        // 保留 _moveFrom，讓下次「同步」可重試移動
        showToast('更新 Google 失敗：' + (res.reason || '未知'))
      }
    }
  }

  function convertToGoogleFormat(event: Event): any {
    const body: any = {
      summary: event.title || '(無標題)',
      description: event.description || '',
      location: event.location || ''
    }

    const startStr = (event.date || '').slice(0, 10)
    if (!startStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      console.error('Invalid start date:', event.date)
      return null
    }
    const endStr = deriveEndDate(event).slice(0, 10)

    if (event.allDay) {
      // 全天事件：Google 的 end.date 為排他，需 +1 天
      const endExclusive = new Date(endStr + 'T00:00:00')
      endExclusive.setDate(endExclusive.getDate() + 1)
      const end = `${endExclusive.getFullYear()}-${String(endExclusive.getMonth() + 1).padStart(2, '0')}-${String(endExclusive.getDate()).padStart(2, '0')}`
      body.start = { date: startStr }
      body.end = { date: end }
    } else {
      // 時段事件：可跨天（結束用 endDate）
      const s = timePart(event.startTime).match(/^\d{2}:\d{2}$/) ? timePart(event.startTime) : '09:00'
      const e = timePart(event.endTime).match(/^\d{2}:\d{2}$/) ? timePart(event.endTime) : '10:00'
      const startDate = new Date(startStr + 'T' + s + ':00')
      const endDate = new Date(endStr + 'T' + e + ':00')
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Invalid date/time', { startStr, endStr, s, e })
        return null
      }
      body.start = { dateTime: startDate.toISOString() }
      body.end = { dateTime: endDate.toISOString() }
    }
    return body
  }

  async function deleteEvent(id: string) {
    const event = events.value.find(e => e.id === id)
    events.value = events.value.filter(e => e.id !== id)
    await saveEvents()

    // 如果是 Google 事件，從 Google 刪除
    if (event?.googleId) {
      const res = await electronAPI.google.deleteEvent({
        googleId: event.googleId,
        calendarId: event.calendarId || 'primary'
      })
      if (res && !res.ok) {
        showToast('從 Google 刪除失敗：' + (res.reason || '未知'))
      }
    }
  }

  function setCurrentMonth(date: Date) {
    currentMonth.value = new Date(date)
  }

  function previousMonth() {
    const date = new Date(currentMonth.value)
    date.setMonth(date.getMonth() - 1)
    currentMonth.value = date
  }

  function nextMonth() {
    const date = new Date(currentMonth.value)
    date.setMonth(date.getMonth() + 1)
    currentMonth.value = date
  }

  function goToToday() {
    currentMonth.value = new Date()
    const d = new Date()
    selectedDate.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  return {
    events,
    currentMonth,
    selectedDate,
    loading,
    eventsByDate,
    getEventsForDate,
    loadEvents,
    saveEvents,
    addEvent,
    updateEvent,
    deleteEvent,
    setCurrentMonth,
    previousMonth,
    nextMonth,
    goToToday
  }
})
