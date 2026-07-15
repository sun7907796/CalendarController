<template>
  <div v-if="dialogState.visible" class="modal" @click.self="cancel">
    <div class="modal-content">
      <div class="flex justify-between items-center p-4">
        <h2 class="text-lg font-semibold">{{ dialogState.title }}</h2>
        <button class="bg-transparent hover:bg-transparent border-none text-2xl cursor-pointer p-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" @click="cancel">✕</button>
      </div>

      <div class="px-4">
        <p class="text-sm text-gray-700 dark:text-gray-300">{{ dialogState.message }}</p>
      </div>

      <div class="flex gap-2 p-4 pt-4 justify-end">
        <button @click="cancel" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded transition">
          {{ dialogState.cancelText }}
        </button>
        <button @click="confirm" class="px-4 py-2 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded transition">
          {{ dialogState.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDialog } from '../composables/useDialog'

const { dialogState, confirm, cancel } = useDialog()
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 34, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: var(--panel, white);
  border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  width: 380px;
  max-width: 92vw;
}
</style>
