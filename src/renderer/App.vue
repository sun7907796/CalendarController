<template>
  <div id="app" class="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
    <Dialog />
    <Toast />
    <Header />
    <main class="flex-1 overflow-y-auto min-h-0">
      <Calendar />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useEventsStore } from './stores/events'
import { useGoogleStore } from './stores/google'
import { useAppStore } from './stores/app'
import Header from './components/Header.vue'
import Calendar from './components/Calendar.vue'
import Dialog from './components/Dialog.vue'
import Toast from './components/Toast.vue'
import { useTheme } from './composables/useTheme'

const eventsStore = useEventsStore()
const googleStore = useGoogleStore()
const appStore = useAppStore()
const { init: initTheme } = useTheme()

// 套用使用者記住的主題偏好（純手動，預設淺色）
initTheme()

onMounted(async () => {
  await eventsStore.loadEvents()
  await googleStore.checkStatus()
  await appStore.getAppInfo()

  if (googleStore.signedIn) {
    await googleStore.listCalendars()
  }

  appStore.watchAutoStart(() => {
    // 更新 UI
  })
})
</script>
