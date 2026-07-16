<template>
  <div class="rounded flex flex-col h-full">
    <!-- 星期頭 -->
    <div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 p-px">
      <div v-for="day in weekdayNames" :key="day" class="bg-white dark:bg-gray-800 px-2 py-2 text-center font-semibold text-xs text-gray-500 dark:text-gray-400">
        {{ day }}
      </div>
    </div>

    <!-- 日期網格 -->
    <div class="flex-1 gap-px bg-gray-200 dark:bg-gray-700">
      <template v-for="week in calendarDays" :key="week[0].date">
        <div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 p-px pt-0" :style="{ height: `${100 / calendarDays.length}%` }">
          <div
            v-for="(day, idx) in week"
            :key="`${day.date}-${idx}`"
            :ref="el => cellRefs[`${day.date}`] = el"
            :data-date="day.date"
            :class="getCellClass(day)"
            @click="selectDate(day.date)"
          >
            <div class="font-semibold text-sm">{{ dateNum(day.date) }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 flex-1 overflow-hidden">
              <div v-for="event in getEventsForDate(day.date).slice(0, getMaxEvents(day.date))" :key="event.id" :class="getEventClass() + ' flex items-center gap-1 text-black opacity-85'" :style="getEventStyle(event)" @click.stop="editEvent(event.id)">
                <span v-if="!event.allDay" class="flex-shrink-0">{{ formatTime(event.startTime) }}</span>
                <span class="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{{ event.title }}</span>
              </div>
              <div v-if="getEventsForDate(day.date).length > getMaxEvents(day.date)" class="text-xs px-1 py-0.5 cursor-pointer text-blue-600 dark:text-white hover:dark:bg-gray-900 hover:opacity-75 rounded" @click.stop="showAllEvents(day.date)">
                還有 {{ getEventsForDate(day.date).length - getMaxEvents(day.date) }} 個
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 事件編輯表單 -->
    <EventForm
      v-if="showEventForm"
      :date="eventsStore.selectedDate"
      :event-id="editingEventId"
      @close="showEventForm = false"
      @save="handleEventSave"
    />

    <!-- 所有事件列表浮動窗口 -->
    <div v-if="showEventListModal && eventListDate" class="fixed inset-0 z-40" @click="showEventListModal = false"></div>
    <div v-if="showEventListModal && eventListDate" class="fixed bg-white dark:bg-gray-900 rounded-lg shadow-lg p-3 z-50 max-w-xs max-h-80 overflow-y-auto w-[190px]" :style="{ top: eventListPosition.top + 'px', left: eventListPosition.left + 'px' }">
      <div class="flex justify-between items-center mb-2 sticky top-0 bg-white dark:bg-gray-900 pb-2">
        <h3 class="text-sm font-semibold">{{ eventListDate }}</h3>
        <button class="text-lg cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-1.5 py-0 bg-transparent" @click="showEventListModal = false">✕</button>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="event in getEventsForDate(eventListDate)" :key="event.id" class="p-1 rounded text-xs cursor-pointer transition flex items-center gap-1 text-black opacity-85" :style="getEventStyle(event)" @click="editEvent(event.id)">
          <span v-if="!event.allDay" class="flex-shrink-0">
            {{ formatTime(event.startTime) }}
          </span>
          <span class="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{{ event.title }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 34, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--panel, white);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  width: 420px;
  max-width: 92vw;
  max-height: 92vh;
  overflow-y: auto;
  padding: 22px;
  color: var(--text, black);
}
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from 'vue'
import { useEventsStore } from '../stores/events'
import { useGoogleStore } from '../stores/google'
import { getCalendarGrid } from '../../utils/calendar'
import EventForm from './EventForm.vue'

const eventsStore = useEventsStore()
const googleStore = useGoogleStore()
const cellRefs: Record<string, any> = reactive({})
const cellHeights: Record<string, number> = reactive({})
const showEventForm = ref(false)
const editingEventId = ref<string | null>(null)
const showEventListModal = ref(false)
const eventListDate = ref<string | null>(null)
const maxEventCounts: Record<string, number> = reactive({})
const eventListPosition = ref({ top: 0, left: 0 })

const weekdayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

const calendarDays = computed(() => {
  const year = eventsStore.currentMonth.getFullYear()
  const month = eventsStore.currentMonth.getMonth()
  const weeks = getCalendarGrid(year, month)
  return weeks.filter(week => week.some(day => day.isCurrentMonth))
})

function setupResizeObserver() {
  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach(entry => {
      const el = entry.target as HTMLElement
      const dateKey = el.getAttribute('data-date')
      if (!dateKey) return

      const totalHeight = entry.contentRect.height
      const availableHeight = totalHeight - 32 // 日期文字 + 邊距
      const eventHeight = 20 // 每個事件的高度（px）
      const moreInfoHeight = 20 // "還有 X 項"的高度（px）

      // 獲取該日期的事件數量
      const events = eventsStore.getEventsForDate(dateKey)

      // 計算最多能顯示多少事件
      // 如果有超出的事件，需要留空間給"還有 X 項"
      let maxEvents = 1
      if (events.length <= 1) {
        maxEvents = 1
      } else {
        // 試著顯示更多事件，但留下"還有 X 項"的空間
        maxEvents = Math.floor((availableHeight - moreInfoHeight) / eventHeight)
        maxEvents = Math.max(1, maxEvents)

        // 如果沒有超出，可以再顯示一個
        if (events.length <= maxEvents) {
          maxEvents = events.length
        }
      }

      maxEventCounts[dateKey] = maxEvents
    })
  })

  // 監測所有日期格子
  Object.values(cellRefs).forEach((el: any) => {
    if (el) {
      resizeObserver.observe(el)
    }
  })
}

onMounted(async () => {
  // 等待 DOM 完全渲染後再設置 ResizeObserver
  await nextTick()
  setTimeout(() => {
    setupResizeObserver()
  }, 50)

  // 視窗大小改變時關閉事件列表
  const handleWindowResize = () => {
    showEventListModal.value = false
  }
  window.addEventListener('resize', handleWindowResize)
})

// 月份改變時重新設置 ResizeObserver
watch(() => eventsStore.currentMonth, async () => {
  Object.keys(maxEventCounts).forEach(key => delete maxEventCounts[key])

  // 等待新的 DOM 渲染完成
  await nextTick()
  setTimeout(() => {
    setupResizeObserver()
  }, 50)
})

function dateNum(dateStr: string): number {
  return parseInt(dateStr.split('-')[2], 10)
}

function formatTime(timeStr: string): string {
  if (!timeStr) return ''
  // 相容完整 ISO（YYYY-MM-DDTHH:mm）與 HH:mm
  return timeStr.includes('T') ? timeStr.substring(11, 16) : timeStr
}

function getEventsForDate(dateStr: string) {
  const events = eventsStore.getEventsForDate(dateStr)

  // 排序：全天事件優先，然後按開始時間排序
  return events.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1
    if (!a.allDay && b.allDay) return 1
    if (a.allDay && b.allDay) return 0

    // 非全天事件按開始時間排序
    return a.startTime.localeCompare(b.startTime)
  })
}

function getMaxEvents(dateStr: string): number {
  return maxEventCounts[dateStr] ?? 2
}

function getEventStyle(event: any): any {
  let bgColor: string | null = null

  // 優先級 1：使用 event 的 colorId
  if (event.colorId) {
    bgColor = googleStore.colorMap[event.colorId]
  }

  // 優先級 2：使用所屬日曆的顏色（備用）
  if (!bgColor && event.calendarId) {
    const calendar = googleStore.calendars.find(cal => cal.id === event.calendarId)
    if (calendar?.backgroundColor) {
      bgColor = calendar.backgroundColor
    }
  }

  // 優先級 3：使用默認顏色
  if (!bgColor) {
    bgColor = 'rgb(165, 153, 140)'
  }

  return {
    backgroundColor: bgColor
  }
}

function getEventClass(): string {
  return 'px-1 py-0.5 rounded text-xs my-0.5 whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer hover:opacity-75 text-white'
}

function getCellClass(day: any): string {
  let bgClass = 'bg-white dark:bg-gray-800'
  let opacityClass = ''

  if (!day.isCurrentMonth) {
    opacityClass = 'opacity-50'
  } else if (day.isToday) {
    bgClass = 'bg-yellow-100 dark:bg-gray-900'
  }

  return `${bgClass} ${opacityClass} px-1.5 py-1 flex flex-col cursor-pointer overflow-hidden`
}

function selectDate(date: string) {
  eventsStore.selectedDate = date
  eventsStore.selectedDate = date
  editingEventId.value = null
  showEventForm.value = true
}

function editEvent(eventId: string) {
  editingEventId.value = eventId
  showEventForm.value = true
}

function handleEventSave() {
  showEventForm.value = false
  // 重新計算事件數量
  setTimeout(() => {
    setupResizeObserver()
  }, 50)
}

function showAllEvents(date: string) {
  eventListDate.value = date

  // 計算日期格子的位置
  const el = cellRefs[date]
  if (el) {
    const rect = el.getBoundingClientRect()
    let top = rect.top
    let left = rect.left

    // 窗口尺寸
    const popupWidth = 190
    const popupHeight = 320 // max-h-80

    // 檢查右邊界
    if (left + popupWidth > window.innerWidth) {
      left = window.innerWidth - popupWidth - 8
    }

    // 檢查左邊界
    if (left < 8) {
      left = 8
    }

    // 檢查下邊界
    if (top + popupHeight > window.innerHeight) {
      top = window.innerHeight - popupHeight - 8
    }

    // 檢查上邊界
    if (top < 8) {
      top = 8
    }

    eventListPosition.value = { top, left }
  }

  showEventListModal.value = true
}
</script>
