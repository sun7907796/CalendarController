import { defineStore } from 'pinia'
import { ref } from 'vue'
import { electronAPI } from '../services/ipc'

export const useAppStore = defineStore('app', () => {
  const autoStartEnabled = ref(false)
  const appVersion = ref('')
  const dataDir = ref('')

  async function checkAutoStart() {
    autoStartEnabled.value = await electronAPI.app.getAutostart()
  }

  async function setAutoStart(enabled: boolean) {
    autoStartEnabled.value = await electronAPI.app.setAutostart(enabled)
  }

  async function getAppInfo() {
    const info = await electronAPI.app.info()
    appVersion.value = info.version
    dataDir.value = info.dataDir
  }

  async function openDataDir() {
    await electronAPI.app.openDataDir()
  }

  async function openExternal(url: string) {
    await electronAPI.app.openExternal(url)
  }

  function watchAutoStart(callback: (enabled: boolean) => void) {
    electronAPI.onAutostartChanged(callback)
  }

  return {
    autoStartEnabled,
    appVersion,
    dataDir,
    checkAutoStart,
    setAutoStart,
    getAppInfo,
    openDataDir,
    openExternal,
    watchAutoStart
  }
})
