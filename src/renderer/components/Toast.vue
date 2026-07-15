<template>
  <teleport to="body">
    <transition name="toast">
      <div
        v-if="currentToast"
        class="fixed inset-0 flex items-center justify-center pointer-events-none"
        style="z-index: 9999"
      >
        <div class="bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg shadow-lg pointer-events-auto">
          <span class="text-sm">{{ currentToast.message }}</span>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { currentToast } = useToast()
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}
</style>
