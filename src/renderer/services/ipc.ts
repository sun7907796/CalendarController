declare global {
  interface Window {
    electronAPI: any
  }
}

export function getElectronAPI() {
  if (!window.electronAPI) {
    throw new Error('electronAPI not exposed in preload')
  }
  return window.electronAPI
}

export const electronAPI = getElectronAPI()
