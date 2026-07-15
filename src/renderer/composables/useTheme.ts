import { ref } from 'vue'

// 主題：純手動（light / dark 兩段），偏好記在 localStorage
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'
const theme = ref<Theme>('light')

function apply(t: Theme) {
  theme.value = t
  document.documentElement.classList.toggle('dark', t === 'dark')
}

export function useTheme() {
  // 啟動時套用已記住的偏好（預設淺色）
  function init() {
    const saved = localStorage.getItem(STORAGE_KEY)
    apply(saved === 'dark' ? 'dark' : 'light')
  }

  function toggle() {
    const next: Theme = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEY, next)
    apply(next)
  }

  function set(t: Theme) {
    localStorage.setItem(STORAGE_KEY, t)
    apply(t)
  }

  return { theme, init, toggle, set }
}
