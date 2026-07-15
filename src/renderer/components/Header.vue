<template>
  <header class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col gap-3">
    <!-- 上方行：日期選項和 GoogleAuth -->
    <div class="flex justify-between items-center">
      <div class="flex gap-2 items-center">
        <button @click="eventsStore.previousMonth" class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition">❮</button>
        <span class="w-28 text-center text-sm font-medium text-gray-700 dark:text-gray-300">{{ monthYear }}</span>
        <button @click="eventsStore.nextMonth" class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition">❯</button>
        <button @click="eventsStore.goToToday" class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition">今天</button>
      </div>
      <div class="flex gap-3 items-center">
        <button
          @click="toggle"
          class="px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition text-sm"
          :title="theme === 'dark' ? '切換為淺色' : '切換為深色'"
        >
          {{ theme === 'dark' ? '☀️ 淺色' : '🌙 深色' }}
        </button>
        <div class="w-px h-6 bg-gray-200 dark:bg-gray-700"></div>
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <ElSwitch v-model="autoStart" @change="handleAutoStartChange" />
          <span>開機自動啟動</span>
        </div>
        <div class="w-px h-6 bg-gray-200 dark:bg-gray-700"></div>
        <GoogleAuth />
      </div>
    </div>

    <!-- 下方行：日曆群組 -->
    <div class="flex gap-3 items-center min-w-0">
      <span class="text-sm text-gray-600 dark:text-gray-400 flex-shrink-0">日曆群組</span>
      <div class="flex gap-2 items-center min-w-0 overflow-x-auto">
        <div
          v-for="cal in googleStore.calendars"
          :key="cal.id"
          :class="[
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs flex-shrink-0',
            googleStore.targetCalendarId === cal.id
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-semibold'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
          ]"
        >
          <div
            class="w-3 h-3 rounded border border-gray-300 dark:border-gray-600"
            :style="{ backgroundColor: cal.backgroundColor }"
          ></div>
          <span>{{ cal.summary }}{{ googleStore.targetCalendarId === cal.id ? '（同步中）' : '' }}</span>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { ElSwitch } from 'element-plus'
import { useEventsStore } from '../stores/events'
import { useGoogleStore } from '../stores/google'
import { useToast } from '../composables/useToast'
import { useTheme } from '../composables/useTheme'
import GoogleAuth from './GoogleAuth.vue'

const eventsStore = useEventsStore()
const googleStore = useGoogleStore()
const { show } = useToast()
const { theme, toggle } = useTheme()
const autoStart = ref(false)

const monthYear = computed(() => {
  const date = eventsStore.currentMonth
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  return `${date.getFullYear()}年 ${months[date.getMonth()]}`
})

onMounted(async () => {
  const enabled = await window.electronAPI.app.getAutostart()
  autoStart.value = enabled
})

async function handleAutoStartChange() {
  await window.electronAPI.app.setAutostart(autoStart.value)
  show(autoStart.value ? '已啟用開機自動啟動' : '已禁用開機自動啟動')
}
</script>
