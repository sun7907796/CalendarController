<template>
  <div class="flex gap-2 items-center">
    <button v-if="!googleStore.signedIn" @click="handleImportCredentials" class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded transition" :title="googleStore.hasCredentials ? '重新匯入憑證' : '匯入 Google 憑證'">📁 {{ googleStore.hasCredentials ? '重新' : '' }}匯入憑證</button>

    <div v-if="!googleStore.hasCredentials || !googleStore.signedIn" class="flex gap-2 items-center">
      <button @click="handleSignin" class="px-2 py-1 text-xs bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded transition">🔐 登入</button>
      <button @click="handleClearEvents" class="px-2 py-1 text-xs bg-red-400 dark:bg-red-700 hover:bg-red-500 dark:hover:bg-red-600 text-white rounded transition" title="清空本機所有事件">🗑️ 清空</button>
    </div>

    <div v-else class="flex gap-2 items-center flex-shrink-0">
      <select v-model="selectedCalendarId" @change="handleCalendarChange" class="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white">
        <option v-for="cal in googleStore.calendars" :key="cal.id" :value="cal.id">
          {{ cal.summary }}
        </option>
      </select>
      <button @click="handleSync" :disabled="googleStore.isSyncing" class="px-3 py-1 text-xs bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-700 text-white disabled:opacity-50 rounded transition whitespace-nowrap flex-shrink-0" :title="googleStore.isSyncing ? '同步中' : '同步日曆'">
        {{ googleStore.isSyncing ? '同步中...' : '同步' }}
      </button>
      <button @click="handleSignout" class="px-3 py-1 text-xs bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 text-white rounded transition whitespace-nowrap flex-shrink-0">登出</button>
    </div>

    <div v-if="googleStore.syncError" class="text-red-600 dark:text-red-400 text-xs flex items-center gap-2 max-w-md">
      <span>⚠️ {{ googleStore.syncError }}</span>
      <button
        v-if="googleStore.syncAction"
        @click="openAction"
        class="px-2 py-1 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded transition whitespace-nowrap flex-shrink-0"
      >前往啟用 Google Calendar API</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDialog } from '../composables/useDialog'
import { useToast } from '../composables/useToast'
import { useGoogleStore } from '../stores/google'
import { useEventsStore } from '../stores/events'
import { useAppStore } from '../stores/app'
import { electronAPI } from '../services/ipc'

const { open } = useDialog()
const { show } = useToast()
const googleStore = useGoogleStore()
const eventsStore = useEventsStore()
const appStore = useAppStore()

function openAction() {
  if (googleStore.syncAction?.url) {
    electronAPI.app.openExternal(googleStore.syncAction.url)
  }
}

const selectedCalendarId = computed({
  get: () => googleStore.targetCalendarId,
  set: (value) => {
    googleStore.setTargetCalendar(value)
  }
})

function handleCalendarChange() {
  googleStore.setTargetCalendar(selectedCalendarId.value)
}

async function handleImportCredentials() {
  const result = await googleStore.importCredentials()
  if (result.ok) {
    show('憑證匯入成功！')
  } else {
    show('匯入失敗：' + result.reason)
  }
}

async function handleSignin() {
  const result = await googleStore.signin()
  if (!result.ok) {
    show('登入失敗：' + result.reason)
  }
}

async function handleSync() {
  const currentYear = new Date().getFullYear()

  console.log(`[handleSync] 開始同步所有日曆（${currentYear - 5} ~ ${currentYear + 5}）...`)

  try {
    for (let year = currentYear - 5; year <= currentYear + 5; year++) {
      console.log(`[handleSync] 同步 ${year} 年...`)
      for (const calendar of googleStore.calendars) {
        const result = await googleStore.sync(`${year}-01-01`, `${year}-12-31`, calendar.id)
        if (!result.ok) {
          show(`同步失敗: ${result.reason}`)
          return
        }
      }
    }

    console.log('[handleSync] 同步完成！')
    show('同步完成')
  } catch (err) {
    show(`同步發生錯誤: ${(err as Error).message}`)
  }
}

async function handleSignout() {
  const confirmed = await open({
    title: '登出',
    message: '確認要登出嗎？',
    confirmText: '登出',
    cancelText: '取消'
  })
  if (confirmed) {
    await googleStore.signout()
    show('已登出')
  }
}

async function handleClearEvents() {
  const confirmed = await open({
    title: '清空事件',
    message: '確認要清空本機所有事件？此操作無法復原。',
    confirmText: '清空',
    cancelText: '取消'
  })
  if (confirmed) {
    eventsStore.events = []
    await eventsStore.saveEvents()
    show('已清空本機事件')
  }
}
</script>
