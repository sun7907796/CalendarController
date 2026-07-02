'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 將受控的 API 暴露給渲染行程，避免直接開放 Node 能力
contextBridge.exposeInMainWorld('api', {
  loadEvents: () => ipcRenderer.invoke('events:load'),
  saveEvents: (events) => ipcRenderer.invoke('events:save', events),

  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getAutoStart: () => ipcRenderer.invoke('app:get-autostart'),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:set-autostart', enabled),
  onAutoStartChanged: (cb) => ipcRenderer.on('app:autostart-changed', (_e, v) => cb(v)),

  googleStatus: () => ipcRenderer.invoke('google:status'),
  importCredentials: () => ipcRenderer.invoke('google:import-credentials'),
  signIn: () => ipcRenderer.invoke('google:signin'),
  signOut: () => ipcRenderer.invoke('google:signout'),
  sync: (payload) => ipcRenderer.invoke('google:sync', payload),
  deleteGoogleEvent: (googleId) => ipcRenderer.invoke('google:delete-event', googleId)
});
