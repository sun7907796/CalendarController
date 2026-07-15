import { ref } from 'vue'

interface Toast {
  id: string
  message: string
  duration?: number
}

const currentToast = ref<Toast | null>(null)
let timeoutId: number | null = null

export function useToast() {
  function show(message: string, duration = 3000) {
    // 清除之前的 timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }

    const id = Date.now().toString()
    currentToast.value = {
      id,
      message,
      duration
    }

    if (duration > 0) {
      timeoutId = window.setTimeout(() => {
        currentToast.value = null
        timeoutId = null
      }, duration)
    }

    return id
  }

  function hide() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    currentToast.value = null
  }

  return {
    currentToast,
    show,
    hide
  }
}
