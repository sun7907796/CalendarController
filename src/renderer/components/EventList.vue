<template>
  <div class="p-2">
    <div v-if="!events.length" class="text-gray-500 dark:text-gray-400 text-sm text-center py-4 px-2">
      這天沒有事件
    </div>
    <div v-else class="flex flex-col gap-1">
      <div v-for="event in events" :key="event.id" class="flex items-center gap-2 px-2 py-2 bg-blue-100 dark:bg-blue-900 rounded cursor-pointer transition-colors hover:bg-green-100 dark:hover:bg-green-900" @click="$emit('edit', event)">
        <div class="min-w-[50px] text-xs font-semibold text-blue-600 dark:text-blue-300">
          {{ event.allDay ? '全天' : event.startTime }}
        </div>
        <div class="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis text-gray-900 dark:text-white">
          {{ event.title }}
        </div>
        <button class="bg-transparent border-none cursor-pointer text-red-500 dark:text-red-400 text-base px-1 opacity-0 hover:opacity-100 transition-opacity" @mouseenter="$event.target.classList.add('opacity-100')" @mouseleave="$event.target.classList.remove('opacity-100')" @click.stop="deleteEvent(event.id)">
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Event } from '../types'
import { useEventsStore } from '../stores/events'
import { useDialog } from '../composables/useDialog'

defineProps<{
  events: Event[]
  date: string
}>()

const emit = defineEmits<{
  edit: [event: Event]
  delete: [id: string]
}>()

const eventsStore = useEventsStore()
const { open } = useDialog()

async function deleteEvent(id: string) {
  const confirmed = await open({
    title: '刪除事件',
    message: '確認刪除此事件？',
    confirmText: '刪除',
    cancelText: '取消'
  })
  if (confirmed) {
    await eventsStore.deleteEvent(id)
    emit('delete', id)
  }
}
</script>
