<template>
  <div class="fixed bottom-5 right-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-80 max-h-80 z-50 flex flex-col">
    <div class="flex items-center gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700">
      <h4 class="m-0 text-sm font-semibold text-gray-900 dark:text-white">同步進行中...</h4>
      <div class="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 dark:border-t-blue-400 rounded-full animate-spin"></div>
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-3 text-xs text-gray-600 dark:text-gray-400">
      <div v-for="(log, idx) in googleStore.syncLog" :key="idx" class="py-1 px-0 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
        {{ log }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGoogleStore } from '../stores/google'

const googleStore = useGoogleStore()
</script>

<style scoped>
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
