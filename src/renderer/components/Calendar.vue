<template>
  <div class="rounded flex flex-col h-full">
    <!-- 星期頭 -->
    <div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 p-px">
      <div v-for="day in weekdayNames" :key="day" class="bg-white dark:bg-gray-800 px-2 py-2 text-center font-semibold text-xs text-gray-500 dark:text-gray-400">
        {{ day }}
      </div>
    </div>

    <!-- 日期網格（以週為單位，事件以跨欄橫條呈現）-->
    <div class="flex-1 flex flex-col gap-px bg-gray-200 dark:bg-gray-700 p-px pt-0">
      <div
        v-for="(wl, wi) in weekLayouts"
        :key="wl.week[0].date"
        :ref="el => (weekRefs[wi] = el)"
        :data-week="wi"
        class="relative grid grid-cols-7 gap-px"
        :style="{ height: `${100 / weekLayouts.length}%` }"
      >
        <!-- 背景日期格（點空白處新增）-->
        <div
          v-for="day in wl.week"
          :key="day.date"
          :data-date="day.date"
          :class="getCellClass(day)"
          @click="selectDate(day.date)"
        >
          <div class="font-semibold text-sm">{{ dateNum(day.date) }}</div>
        </div>

        <!-- 事件橫條覆蓋層 -->
        <div class="absolute left-0 right-0 grid grid-cols-7 gap-px px-px pointer-events-none"
             style="top: 26px; bottom: 2px; grid-auto-rows: 20px; row-gap: 2px; align-content: start;">
          <template v-for="seg in wl.segs" :key="seg.event.id + '-' + seg.sCol">
            <div
              v-if="seg.lane < wl.maxLanes"
              :style="{ gridColumn: `${seg.sCol + 1} / ${seg.eCol + 2}`, gridRow: seg.lane + 1, backgroundColor: barColor(seg.event) }"
              :class="['pointer-events-auto text-white text-xs px-2 h-[18px] leading-[18px] whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer hover:opacity-80 opacity-90', seg.contStart ? '' : 'rounded-l', seg.contEnd ? '' : 'rounded-r']"
              @click.stop="editEvent(seg.event.id)"
            >
              <span v-if="!seg.event.allDay && !seg.contStart" class="mr-1">{{ formatTime(seg.event.startTime) }}</span>{{ seg.event.title }}
            </div>
          </template>

          <!-- 超出可視車道時，於各日欄顯示「+N」 -->
          <template v-for="(cnt, di) in wl.hidden" :key="'h' + di">
            <div
              v-if="cnt > 0"
              :style="{ gridColumn: `${di + 1} / ${di + 2}`, gridRow: wl.maxLanes + 1 }"
              class="pointer-events-auto text-[11px] px-1 text-blue-600 dark:text-white cursor-pointer hover:opacity-75 whitespace-nowrap"
              @click.stop="showAllEvents(wl.week[di].date)"
            >還有 {{ cnt }} 個</div>
          </template>
        </div>
      </div>
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
        <div v-for="event in getEventsForDate(eventListDate)" :key="event.id" class="p-1 rounded text-xs cursor-pointer transition flex items-center gap-1 text-white opacity-90" :style="{ backgroundColor: barColor(event) }" @click="editEvent(event.id)">
          <span v-if="!event.allDay" class="flex-shrink-0">{{ formatTime(event.startTime) }}</span>
          <span class="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{{ event.title }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from 'vue'
import { useEventsStore } from '../stores/events'
import { useGoogleStore } from '../stores/google'
import { getCalendarGrid } from '../../utils/calendar'
import EventForm from './EventForm.vue'

const eventsStore = useEventsStore()
const googleStore = useGoogleStore()
const weekRefs: Record<number, any> = reactive({})
const weekMaxLanes = reactive<Record<number, number>>({})
const showEventForm = ref(false)
const editingEventId = ref<string | null>(null)
const showEventListModal = ref(false)
const eventListDate = ref<string | null>(null)
const eventListPosition = ref({ top: 0, left: 0 })

const weekdayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

const calendarDays = computed(() => {
  const year = eventsStore.currentMonth.getFullYear()
  const month = eventsStore.currentMonth.getMonth()
  const weeks = getCalendarGrid(year, month)
  return weeks.filter(week => week.some(day => day.isCurrentMonth))
})

// 相容舊資料的結束日期推導
function deriveEndDate(ev: any): string {
  if (ev.endDate) return String(ev.endDate).slice(0, 10)
  if (ev.endTime && String(ev.endTime).includes('T')) return String(ev.endTime).slice(0, 10)
  return String(ev.date).slice(0, 10)
}

// 事件排序鍵（全天/跨天優先，其次開始時間）
function eventSortKey(ev: any): string {
  return (ev.allDay ? '0' : '1') + (ev.startTime || '') + (ev.title || '')
}

// 每週的橫條排版：計算每個事件在該週的起訖欄、車道與是否延續
const weekLayouts = computed(() => {
  return calendarDays.value.map((week, wi) => {
    const weekStart = week[0].date
    const weekEnd = week[6].date
    const colOf = (dateStr: string) => week.findIndex(d => d.date === dateStr)

    const segs: any[] = []
    for (const ev of eventsStore.events) {
      if (ev._deleted) continue
      const s = String(ev.date || '').slice(0, 10)
      const e = deriveEndDate(ev)
      if (!s || e < weekStart || s > weekEnd) continue // 與本週無交集
      let sCol = s < weekStart ? 0 : colOf(s)
      let eCol = e > weekEnd ? 6 : colOf(e)
      if (sCol < 0) sCol = 0
      if (eCol < 0) eCol = 6
      segs.push({
        event: ev,
        sCol,
        eCol,
        contStart: s < weekStart, // 由上一週延續
        contEnd: e > weekEnd       // 延續到下一週
      })
    }

    // 長條優先取得較低車道；同起點時較長者優先，其次全天/時間排序
    segs.sort((a, b) =>
      a.sCol - b.sCol ||
      (b.eCol - b.sCol) - (a.eCol - a.sCol) ||
      eventSortKey(a.event).localeCompare(eventSortKey(b.event))
    )

    // 貪婪指派車道：同一車道內不可欄位重疊
    const laneEnd: number[] = []
    for (const seg of segs) {
      let lane = 0
      while (lane < laneEnd.length && laneEnd[lane] >= seg.sCol) lane++
      seg.lane = lane
      laneEnd[lane] = seg.eCol
    }

    const maxLanes = weekMaxLanes[wi] ?? 3

    // 計算各日欄被隱藏（車道超出）的事件數
    const hidden = new Array(7).fill(0)
    for (const seg of segs) {
      if (seg.lane >= maxLanes) {
        for (let c = seg.sCol; c <= seg.eCol; c++) hidden[c]++
      }
    }

    return { week, segs, maxLanes, hidden }
  })
})

function measureLanes() {
  for (const [wiStr, el] of Object.entries(weekRefs)) {
    const wi = Number(wiStr)
    if (!el) continue
    const h = (el as HTMLElement).getBoundingClientRect().height
    // 扣掉日期數字(26)與底部留白(4)，每車道約 22px；至少保留 1 條給「+N」
    const lanes = Math.max(1, Math.floor((h - 30) / 22))
    weekMaxLanes[wi] = lanes
  }
}

let resizeObserver: ResizeObserver | null = null
function setupObserver() {
  if (resizeObserver) resizeObserver.disconnect()
  resizeObserver = new ResizeObserver(() => measureLanes())
  Object.values(weekRefs).forEach((el: any) => { if (el) resizeObserver!.observe(el) })
  measureLanes()
}

onMounted(async () => {
  await nextTick()
  setTimeout(setupObserver, 50)
  window.addEventListener('resize', () => { showEventListModal.value = false })
})

watch(() => eventsStore.currentMonth, async () => {
  await nextTick()
  setTimeout(setupObserver, 50)
})

function dateNum(dateStr: string): number {
  return parseInt(dateStr.split('-')[2], 10)
}

function formatTime(timeStr: string): string {
  if (!timeStr) return ''
  return timeStr.includes('T') ? timeStr.substring(11, 16) : timeStr
}

function getEventsForDate(dateStr: string) {
  const events = eventsStore.getEventsForDate(dateStr)
  return [...events].sort((a, b) => {
    if (a.allDay && !b.allDay) return -1
    if (!a.allDay && b.allDay) return 1
    return (a.startTime || '').localeCompare(b.startTime || '')
  })
}

// 事件橫條顏色
function barColor(event: any): string {
  if (event.colorId && googleStore.colorMap[event.colorId]) return googleStore.colorMap[event.colorId]
  if (event.calendarId) {
    const cal = googleStore.calendars.find(c => c.id === event.calendarId)
    if (cal?.backgroundColor) return cal.backgroundColor
  }
  return 'rgb(165, 153, 140)'
}

function getCellClass(day: any): string {
  let bgClass = 'bg-white dark:bg-gray-800'
  let opacityClass = ''
  if (!day.isCurrentMonth) {
    opacityClass = 'opacity-50'
  } else if (day.isToday) {
    bgClass = 'bg-yellow-100 dark:bg-gray-900'
  }
  return `${bgClass} ${opacityClass} px-1.5 py-1 cursor-pointer overflow-hidden`
}

function selectDate(date: string) {
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
  setTimeout(measureLanes, 50)
}

function showAllEvents(date: string) {
  eventListDate.value = date
  const el = Object.values(weekRefs).map((e: any) => e).find((e: any) => e?.querySelector?.(`[data-date="${date}"]`))
  const cell = el?.querySelector?.(`[data-date="${date}"]`)
  if (cell) {
    const rect = cell.getBoundingClientRect()
    let top = rect.top
    let left = rect.left
    const popupWidth = 190
    const popupHeight = 320
    if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 8
    if (left < 8) left = 8
    if (top + popupHeight > window.innerHeight) top = window.innerHeight - popupHeight - 8
    if (top < 8) top = 8
    eventListPosition.value = { top, left }
  }
  showEventListModal.value = true
}
</script>
