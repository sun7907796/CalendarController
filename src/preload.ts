import { contextBridge, ipcRenderer } from 'electron'

export const electronAPI = {
  events: {
    load: () => ipcRenderer.invoke('events:load'),
    save: (events: any[]) => ipcRenderer.invoke('events:save', events),
  },
  google: {
    status: () => ipcRenderer.invoke('google:status'),
    importCredentials: () => ipcRenderer.invoke('google:import-credentials'),
    signin: () => ipcRenderer.invoke('google:signin'),
    listCalendars: () => ipcRenderer.invoke('google:list-calendars'),
    sync: (payload: any) => ipcRenderer.invoke('google:sync', payload),
    signout: () => ipcRenderer.invoke('google:signout'),
    colors: () => ipcRenderer.invoke('google:colors'),
    createEvent: (payload: { calendarId: string; event: any }) =>
      ipcRenderer.invoke('google:create-event', payload),
    updateEvent: (payload: { calendarId: string; googleId: string; event: any }) =>
      ipcRenderer.invoke('google:update-event', payload),
    deleteEvent: (arg: string | { googleId: string; calendarId: string }) =>
      ipcRenderer.invoke('google:delete-event', arg),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
    getAutostart: () => ipcRenderer.invoke('app:get-autostart'),
    setAutostart: (enabled: boolean) => ipcRenderer.invoke('app:set-autostart', enabled),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: any) => ipcRenderer.invoke('settings:set', patch),
  },
  colors: {
    load: () => ipcRenderer.invoke('colors:load'),
  },
  onAutostartChanged: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('app:autostart-changed', (_event, enabled) => callback(enabled));
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
