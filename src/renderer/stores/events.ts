import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Event } from '../types'
import { electronAPI } from '../services/ipc'

function generateLocalEventId(): string {
  return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

export const useEventsStore = defineStore('events', () => {
  const events = ref<Event[]>([])
  const currentMonth = ref(new Date())
  const loading = ref(false)

  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date()
  const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const selectedDate = ref<string>(todayStr)

  const eventsByDate = computed(() => {
    const map = new Map<string, Event[]>()

    for (const event of events.value) {
      const startDate = new Date(event.date)
      const endDate = new Date(event.endTime?.split('T')[0] || event.date)

      // 如果是多天的全天事件，展開到每一天（endDate 不包含，遵循 ISO 8601）
      if (event.allDay && event.endTime && startDate < endDate) {
        const currentDate = new Date(startDate)
        while (currentDate < endDate) {
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
          if (!map.has(dateStr)) {
            map.set(dateStr, [])
          }
          map.get(dateStr)!.push(event)
          currentDate.setDate(currentDate.getDate() + 1)
        }
      } else {
        // 單天事件或時間事件
        if (!map.has(event.date)) {
          map.set(event.date, [])
        }
        map.get(event.date)!.push(event)
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
    try {
      const created = await electronAPI.google.createEvent({
        calendarId: newEvent.calendarId || 'primary',
        event: convertToGoogleFormat(newEvent)
      })
      if (created.ok && created.id) {
        newEvent.googleId = created.id
        await saveEvents()
      }
    } catch (err) {
      console.error('推送新事件到 Google 失敗:', err)
    }

    return newEvent
  }

  async function updateEvent(id: string, updates: Partial<Event>) {
    const idx = events.value.findIndex(e => e.id === id)
    if (idx >= 0) {
      const oldEvent = events.value[idx]
      events.value[idx] = {
        ...oldEvent,
        ...updates,
        updatedAt: new Date().toISOString()
      }
      const newEvent = events.value[idx]
      await saveEvents()

      // 推送修改到 Google
      await pushEventToGoogle(oldEvent, newEvent)
    }
  }

  async function pushEventToGoogle(oldEvent: Event, newEvent: Event) {
    if (!newEvent.googleId) {
      // 新事件，創建到 Google
      try {
        const created = await electronAPI.google.createEvent({
          calendarId: newEvent.calendarId || 'primary',
          event: convertToGoogleFormat(newEvent)
        })
        if (created.ok && created.id) {
          newEvent.googleId = created.id
          await saveEvents()
        }
      } catch (err) {
        console.error('推送新事件失敗:', err)
      }
    } else if (oldEvent.googleId === newEvent.googleId) {
      // 現有 Google 事件，更新
      try {
        await electronAPI.google.updateEvent({
          calendarId: newEvent.calendarId || 'primary',
          googleId: newEvent.googleId,
          event: convertToGoogleFormat(newEvent)
        })
      } catch (err) {
        console.error('更新 Google 事件失敗:', err)
      }
    }
  }

  function convertToGoogleFormat(event: Event): any {
    const body: any = {
      summary: event.title || '(無標題)',
      description: event.description || '',
      location: event.location || ''
    }
    if (event.allDay) {
      // 全天事件：只需要日期
      let dateStr = event.date

      // 確保日期格式正確 (YYYY-MM-DD)，移除時區信息
      if (!dateStr || typeof dateStr !== 'string') {
        console.error('Invalid date for all-day event:', event.date)
        return null
      }

      // 只取日期部分 (YYYY-MM-DD)
      dateStr = dateStr.slice(0, 10)
      if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.error('Invalid date format for all-day event:', event.date)
        return null
      }

      const start = dateStr
      try {
        const startDate = new Date(dateStr + 'T00:00:00Z')
        const endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + 1)
        const end = endDate.toISOString().slice(0, 10)
        body.start = { date: start }
        body.end = { date: end }
      } catch (err) {
        console.error('Error processing all-day event date:', err, 'Input:', dateStr)
        return null
      }
    } else {
      // 非全天事件：必須有有效的時間
      let dateStr = event.date

      // 確保日期格式正確 (YYYY-MM-DD)，移除時區信息
      if (!dateStr || typeof dateStr !== 'string') {
        console.error('Invalid date:', event.date)
        return null
      }

      // 只取日期部分 (YYYY-MM-DD)
      dateStr = dateStr.slice(0, 10)
      if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.error('Invalid date format:', event.date)
        return null
      }

      // 提取時間，確保格式是 HH:mm
      let startTimeStr = event.startTime
      let endTimeStr = event.endTime

      if (startTimeStr && startTimeStr.includes('T')) {
        startTimeStr = startTimeStr.slice(11, 16)
      } else if (!startTimeStr || !startTimeStr.match(/^\d{2}:\d{2}$/)) {
        startTimeStr = '09:00'
      }

      if (endTimeStr && endTimeStr.includes('T')) {
        endTimeStr = endTimeStr.slice(11, 16)
      } else if (!endTimeStr || !endTimeStr.match(/^\d{2}:\d{2}$/)) {
        endTimeStr = '10:00'
      }

      console.log('Creating event with date:', dateStr, 'startTime:', startTimeStr, 'endTime:', endTimeStr)

      try {
        const startDate = new Date(dateStr + 'T' + startTimeStr + ':00')
        const endDate = new Date(dateStr + 'T' + endTimeStr + ':00')

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error('Invalid date/time')
        }

        body.start = { dateTime: startDate.toISOString() }
        body.end = { dateTime: endDate.toISOString() }
      } catch (err) {
        console.error('Error creating date:', err, 'Input:', { dateStr, startTimeStr, endTimeStr })
        return null
      }
    }
    return body
  }

  async function deleteEvent(id: string) {
    const event = events.value.find(e => e.id === id)
    events.value = events.value.filter(e => e.id !== id)
    await saveEvents()

    // 如果是 Google 事件，從 Google 刪除
    if (event?.googleId) {
      await electronAPI.google.deleteEvent({
        googleId: event.googleId,
        calendarId: event.calendarId || 'primary'
      })
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
