<template>
  <div class="modal" @click.self="$emit('close')">
    <div class="modal-content flex flex-col">
      <!-- 內容區域 -->
      <form @submit.prevent="handleSubmit" class="flex flex-col gap-4 overflow-y-auto p-[22px] flex-1">
          <div>
            <ElInput v-model="form.title" placeholder="事件標題" required />
          </div>

          <div>
            <!-- 全天事件：只顯示日期 -->
            <div v-if="form.allDay" class="flex gap-2">
              <ElDatePicker v-model="form.date" type="date" placeholder="選擇日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="flex-1" />
              <ElDatePicker v-model="form.endDate" type="date" placeholder="選擇日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="flex-1" />
            </div>

            <!-- 非全天事件：日期和時間 -->
            <template v-else>
              <div class="flex gap-2">
                <ElDatePicker v-model="form.date" type="date" placeholder="選擇日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="flex-1" />
                <ElDatePicker v-model="form.endDate" type="date" placeholder="選擇日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="flex-1" />
              </div>
              <div class="flex gap-2 mt-2">
                <ElTimePicker v-model="form.startTime" placeholder="選擇時間" format="HH:mm" value-format="HH:mm" class="flex-1" />
                <ElTimePicker v-model="form.endTime" placeholder="選擇時間" format="HH:mm" value-format="HH:mm" class="flex-1" />
              </div>
            </template>
          </div>

          <div class="flex items-center gap-2">
            <ElSwitch v-model="form.allDay" />
            <label class="text-sm text-gray-600 dark:text-gray-400 cursor-pointer">全天事件</label>
          </div>

          <div>
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">地點</label>
            <ElInput v-model="form.location" placeholder="地點（可選）" />
          </div>

          <div>
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">說明</label>
            <ElInput v-model="form.description" type="textarea" placeholder="事件說明（可選）" :rows="3" />
          </div>

          <div class="flex gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button v-if="isEditing" type="button" class="px-3 py-2 bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 text-white rounded transition" @click="handleDelete">刪除</button>
            <div class="flex-1"></div>
            <button type="button" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded transition" @click="$emit('close')">取消</button>
            <button type="submit" class="px-3 py-2 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded transition">{{ isEditing ? '更新' : '新增' }}</button>
          </div>
        </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElDatePicker, ElTimePicker, ElInput, ElSwitch } from 'element-plus'
import { useEventsStore } from '../stores/events'
import { useDialog } from '../composables/useDialog'

const props = defineProps<{
  date: string
  eventId?: string
}>()

const emit = defineEmits<{
  close: []
  save: []
}>()

const eventsStore = useEventsStore()
const { open } = useDialog()

const form = reactive({
  date: props.date,
  endDate: props.date,
  title: '',
  description: '',
  location: '',
  startTime: '09:00',
  endTime: '10:00',
  allDay: false
})

const isEditing = computed(() => !!props.eventId)

onMounted(() => {
  if (props.eventId) {
    const event = eventsStore.events.find(e => e.id === props.eventId)
    if (event) {
      Object.assign(form, event)
      // 提取結束日期
      if (event.endTime && event.endTime.includes('T')) {
        form.endDate = event.endTime.substring(0, 10)
        form.endTime = event.endTime.substring(11, 16)
      }
      // 轉換時間格式從 ISO 時間戳到 HH:mm
      if (event.startTime && event.startTime.includes('T')) {
        form.startTime = event.startTime.substring(11, 16)
      }
    }
  }
})

async function handleSubmit() {
  // 轉換時間回完整格式
  let startTime = form.startTime
  let endTime = form.endTime

  if (!form.allDay) {
    // 如果是 HH:mm 格式，轉換回 YYYY-MM-DDTHH:mm:00
    if (startTime && startTime.length === 5) {
      startTime = `${form.date}T${startTime}:00`
    }
    if (endTime && endTime.length === 5) {
      endTime = `${form.endDate}T${endTime}:00`
    }
  }

  if (isEditing.value && props.eventId) {
    await eventsStore.updateEvent(props.eventId, {
      date: form.date,
      title: form.title,
      description: form.description,
      location: form.location,
      startTime,
      endTime,
      allDay: form.allDay
    })
  } else {
    await eventsStore.addEvent({
      title: form.title,
      description: form.description,
      location: form.location,
      date: form.date,
      startTime,
      endTime,
      allDay: form.allDay,
      updatedAt: new Date().toISOString()
    })
  }
  emit('save')
  emit('close')
}

async function handleDelete() {
  if (isEditing.value && props.eventId) {
    const confirmed = await open({
      title: '刪除事件',
      message: '確認刪除此事件？',
      confirmText: '刪除',
      cancelText: '取消'
    })
    if (confirmed) {
      await eventsStore.deleteEvent(props.eventId)
      emit('close')
    }
  }
}
</script>

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
  background: var(--panel);
  border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  width: 420px;
  max-width: 92vw;
  max-height: 92vh;
  overflow: hidden;
}

.modal-content form::-webkit-scrollbar {
  width: 8px;
}

.modal-content form::-webkit-scrollbar-track {
  background: transparent;
}

.modal-content form::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.modal-content form::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.dark .modal-content form::-webkit-scrollbar-thumb {
  background: #475569;
}

.dark .modal-content form::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

/* :deep(.el-input__wrapper) {
  background-color: var(--panel) !important;
  border-color: var(--border) !important;
  box-shadow: 0 0 0 1px var(--border) !important;
} */

:deep(.el-input__inner) {
  background-color: var(--panel) !important;
  color: var(--text) !important;
}

:deep(.dark .el-input__wrapper),
:deep(.dark .el-input__inner) {
  background-color: #1f2937 !important;
  color: white !important;
  border-color: #4b5563 !important;
}
</style>
