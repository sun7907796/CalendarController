import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Calendar } from '../types'
import { electronAPI } from '../services/ipc'
import { useEventsStore } from './events'

export const useGoogleStore = defineStore('google', () => {
  const hasCredentials = ref(false)
  const signedIn = ref(false)
  const calendars = ref<Calendar[]>([])
  const targetCalendarId = ref('primary')
  const syncLog = ref<string[]>([])
  const isSyncing = ref(false)
  const syncError = ref<string | null>(null)
  const syncAction = ref<{ url: string } | null>(null)
  const colorMap = ref<Record<string, string>>({})
  const showSyncSuccess = ref(false)
  let syncSuccessTimer: number | null = null

  async function loadColors() {
    console.log('開始加載顏色映射...')

    // 首先從本地快速加載
    const localResult = await electronAPI.colors.load()
    if (localResult.ok && localResult.colors) {
      console.log('從本地加載顏色映射')
      applyColors(localResult.colors)
    }

    // 然後在後台從 API 獲取最新顏色
    console.log('在後台檢查 API 最新顏色...')
    const result = await electronAPI.google.colors()
    console.log('google:colors 結果:', result)

    if (result.ok && result.colors) {
      applyColors(result.colors)
      console.log('已更新為最新顏色')
    } else {
      console.log('API 獲取失敗:', result.reason)
    }
  }

  function applyColors(colors: any) {
    const eventColors = colors.event || {}
    console.log('event colors:', eventColors)
    for (const [colorId, colorData] of Object.entries(eventColors)) {
      const bgColor = (colorData as any).background
      colorMap.value[colorId] = bgColor
      console.log(`  colorId ${colorId} => ${bgColor}`)
    }
    console.log('colorMap 顏色映射已加載:', colorMap.value)
  }

  async function checkStatus() {
    const status = await electronAPI.google.status()
    hasCredentials.value = status.hasCredentials
    signedIn.value = status.signedIn
    if (signedIn.value) {
      await loadColors()
      await listCalendars()
      // 自動同步全部日曆
      autoSync()
    }
  }

  async function autoSync() {
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth()

    console.log(`[autoSync] 啟動時快速同步 ±3 個月...`)

    // 啟動時只同步 ±3 個月（快速）
    const startDate = new Date(currentYear, currentMonth - 3, 1)
    const endDate = new Date(currentYear, currentMonth + 4, 0)
    const rangeStart = startDate.toISOString().slice(0, 10)
    const rangeEnd = endDate.toISOString().slice(0, 10)

    for (const calendar of calendars.value) {
      await sync(rangeStart, rangeEnd, calendar.id)
    }

    console.log('[autoSync] ±3 個月同步完成！')

    // 全部完成後顯示一次提示
    showSyncSuccess.value = true
    if (syncSuccessTimer) clearTimeout(syncSuccessTimer)
    syncSuccessTimer = window.setTimeout(() => {
      showSyncSuccess.value = false
    }, 3000)
  }

  async function importCredentials() {
    const result = await electronAPI.google.importCredentials()
    if (result.ok) {
      hasCredentials.value = true
    }
    return result
  }

  async function signin() {
    const result = await electronAPI.google.signin()
    if (result.ok) {
      signedIn.value = true
      await listCalendars()
      await loadColors()
    }
    return result
  }

  async function listCalendars() {
    const result = await electronAPI.google.listCalendars()
    if (result.ok) {
      calendars.value = result.calendars || []
      // 設置第一個日曆為默認同步目標
      if (calendars.value.length > 0) {
        targetCalendarId.value = calendars.value[0].id
      }
    }
    return result
  }

  async function signout() {
    const result = await electronAPI.google.signout()
    if (result.ok) {
      signedIn.value = false
      calendars.value = []
      syncLog.value = []
    }
    return result
  }

  async function sync(rangeStart: string, rangeEnd: string, calendarId?: string) {
    isSyncing.value = true
    syncLog.value = []
    syncError.value = null
    syncAction.value = null

    try {
      const eventsStore = useEventsStore()
      console.log('開始同步...')
      console.log('當前本地事件數:', eventsStore.events.length)
      console.log('同步時間範圍:', rangeStart, '至', rangeEnd)
      console.log('日曆 ID:', calendarId || '(所有日曆)')
      console.log('準備調用 IPC...')
      const result = await electronAPI.google.sync({
        events: JSON.parse(JSON.stringify(eventsStore.events)),
        rangeStart,
        rangeEnd,
        calendarId: calendarId || targetCalendarId.value
      })

      console.log('從 IPC 收到結果:', result)
      console.log('結果是否 ok?', result.ok)
      console.log('結果 log:', result.log)

      if (result.ok) {
        syncLog.value = result.log || []
        console.log('同步日誌:', result.log)
        console.log('開始重新加載事件...')
        await eventsStore.loadEvents()
        console.log('事件重新加載完成，當前事件數:', eventsStore.events.length)
        console.log('當前選中月份:', eventsStore.currentMonth.toISOString().slice(0, 7))

        return { ok: true }
      } else {
        syncError.value = result.reason || '同步失敗'
        syncLog.value = result.log || []
        if (result.action) {
          syncAction.value = result.action
        }
        console.error('同步失敗:', result.reason)
        return { ok: false, reason: result.reason }
      }
    } catch (err) {
      console.error('同步錯誤:', err)
      syncError.value = (err as Error).message
      return { ok: false, reason: (err as Error).message }
    } finally {
      isSyncing.value = false
    }
  }

  function setTargetCalendar(calendarId: string) {
    targetCalendarId.value = calendarId
  }

  return {
    hasCredentials,
    signedIn,
    calendars,
    targetCalendarId,
    syncLog,
    isSyncing,
    syncError,
    syncAction,
    colorMap,
    showSyncSuccess,
    checkStatus,
    importCredentials,
    signin,
    listCalendars,
    signout,
    sync,
    loadColors,
    setTargetCalendar
  }
})
