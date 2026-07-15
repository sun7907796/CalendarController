import { ref } from 'vue'

export interface DialogOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
}

interface DialogState extends DialogOptions {
  visible: boolean
}

const dialogState = ref<DialogState>({
  title: '',
  message: '',
  confirmText: '確認',
  cancelText: '取消',
  visible: false
})

let resolveCallback: ((value: boolean) => void) | null = null

export function useDialog() {
  function open(options: DialogOptions): Promise<boolean> {
    dialogState.value = {
      ...options,
      confirmText: options.confirmText || '確認',
      cancelText: options.cancelText || '取消',
      visible: true
    }

    return new Promise((resolve) => {
      resolveCallback = (value: boolean) => {
        dialogState.value.visible = false
        resolve(value)
      }
    })
  }

  function confirm() {
    resolveCallback?.(true)
    resolveCallback = null
  }

  function cancel() {
    resolveCallback?.(false)
    resolveCallback = null
  }

  return {
    dialogState,
    open,
    confirm,
    cancel
  }
}
