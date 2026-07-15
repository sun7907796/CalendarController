import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { google } from 'googleapis'
import { GoogleCalendarManager } from './google-calendar'

function userFile(name: string): string {
  return path.join(app.getPath('userData'), name)
}

const SCOPES = ['https://www.googleapis.com/auth/calendar']

function getAppDir() {
  return app.getAppPath()
}

function getIconPath() {
  return path.join(getAppDir(), 'src', 'build', 'icon.ico')
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// 輸出數據目錄
console.log('數據目錄:', app.getPath('userData'))

function createWindow() {
  const appDir = getAppDir()
  const iconPath = getIconPath()
  const preloadPath = path.join(appDir, 'dist', 'preload.js')
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 1000,
    minHeight: 640,
    title: '行事曆同步小工具-v2',
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.setMenuBarVisibility(false)

  const isDev = process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development'
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

  if (isDev) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(appDir, 'dist', 'renderer', 'index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      if (tray && !(mainWindow as any)._trayHintShown) {
        (mainWindow as any)._trayHintShown = true
        tray.displayBalloon?.({
          title: '仍在背景執行',
          content: '行事曆小工具已縮小到系統匣，點圖示可再開啟。'
        })
      }
    }
  })
}

function showWindow() {
  if (!mainWindow) { createWindow(); return }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  const image = nativeImage.createFromPath(getIconPath())
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('行事曆同步小工具-v2')
  rebuildTrayMenu()
  tray.on('double-click', showWindow)
}

function isAutoStartOn(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

function rebuildTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: '開啟主視窗', click: showWindow },
    {
      label: '開機時自動啟動',
      type: 'checkbox' as const,
      checked: isAutoStartOn(),
      click: (item) => setAutoStart(item.checked)
    },
    { type: 'separator' as const },
    { label: '結束', click: () => { isQuitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
}

function setAutoStart(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: !!enabled })
  rebuildTrayMenu()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:autostart-changed', !!enabled)
  }
}

let googleManager: GoogleCalendarManager | null = null

app.whenReady().then(() => {
  googleManager = new GoogleCalendarManager(app.getPath('userData'))
  createWindow()
  createTray()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showWindow()
  })
})

app.on('before-quit', () => { isQuitting = true })
app.on('window-all-closed', () => { })

// 工具函數
function readJson(file: string, fallback: any = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return fallback
  }
}

function writeJson(file: string, data: any) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function fmtLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtLocalTime(d: Date): string {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function localToGoogle(ev: any) {
  const body: any = {
    summary: ev.title || '(無標題)',
    description: ev.description || '',
    location: ev.location || ''
  }
  if (ev.allDay) {
    const start = ev.date
    const endDate = new Date(ev.date + 'T00:00:00')
    endDate.setDate(endDate.getDate() + 1)
    const end = endDate.toISOString().slice(0, 10)
    body.start = { date: start }
    body.end = { date: end }
  } else {
    const s = ev.startTime || '09:00'
    const e = ev.endTime || ev.startTime || '10:00'
    body.start = { dateTime: new Date(ev.date + 'T' + s + ':00').toISOString() }
    body.end = { dateTime: new Date(ev.date + 'T' + e + ':00').toISOString() }
  }
  return body
}

function googleToLocal(g: any, calendarId: string) {
  const allDay = !!(g.start && g.start.date)
  let date = '', startTime = '', endTime = ''
  if (allDay) {
    date = g.start.date
  } else {
    const sd = new Date(g.start.dateTime)
    const ed = g.end && g.end.dateTime ? new Date(g.end.dateTime) : sd
    date = fmtLocalDate(sd)
    startTime = fmtLocalTime(sd)
    endTime = fmtLocalTime(ed)
  }
  return {
    id: 'g_' + g.id,
    googleId: g.id,
    calendarId: calendarId || 'primary',
    title: g.summary || '(無標題)',
    description: g.description || '',
    location: g.location || '',
    date,
    startTime,
    endTime,
    allDay,
    updatedAt: g.updated || new Date().toISOString()
  }
}

// IPC 事件：事件管理
ipcMain.handle('events:load', () => readJson(userFile('events.json'), []))
ipcMain.handle('events:save', (_e, events) => {
  const filePath = userFile('events.json')
  console.log(`[events:save] 保存 ${events.length} 個事件到 ${filePath}`)
  writeJson(filePath, events)
  console.log(`[events:save] 保存完成`)
  return true
})

// IPC 事件：應用資訊
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  dataDir: app.getPath('userData')
}))

ipcMain.handle('app:open-data-dir', async () => {
  const dir = app.getPath('userData')
  await shell.openPath(dir)
  return dir
})

ipcMain.handle('settings:get', () => readJson(userFile('settings.json'), {}))
ipcMain.handle('settings:set', (_e, patch) => {
  const cur = readJson(userFile('settings.json'), {})
  const next = Object.assign({}, cur, patch)
  writeJson(userFile('settings.json'), next)
  return next
})

ipcMain.handle('app:get-autostart', () => isAutoStartOn())
ipcMain.handle('app:set-autostart', (_e, enabled) => {
  setAutoStart(enabled)
  return isAutoStartOn()
})

// Google 相關 IPC 處理（簡化版本）
function loadCredentials() {
  const raw = readJson(userFile('credentials.json'), null)
  if (!raw) return null
  const key = raw.installed || raw.web
  if (!key || !key.client_id || !key.client_secret) return null
  return { clientId: key.client_id, clientSecret: key.client_secret }
}

ipcMain.handle('google:status', () => ({
  hasCredentials: !!loadCredentials(),
  signedIn: !!readJson(userFile('token.json'), null)
}))

ipcMain.handle('google:import-credentials', async () => {
  if (!mainWindow) return { ok: false, reason: '窗口已關閉' }
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '選擇 Google OAuth 憑證檔 (credentials.json)',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, reason: '已取消' }
  const parsed = readJson(res.filePaths[0], null)
  if (!parsed || !(parsed.installed || parsed.web)) {
    return { ok: false, reason: '檔案格式不正確，需為 OAuth 用戶端憑證' }
  }
  fs.copyFileSync(res.filePaths[0], userFile('credentials.json'))
  return { ok: true, hasCredentials: !!loadCredentials() }
})

ipcMain.handle('google:signin', async () => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }

  try {
    const authUrl = await googleManager.getAuthUrl()

    // Start a simple HTTP server to listen for OAuth callback
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', 'http://localhost')
      const code = url.searchParams.get('code')

      if (code) {
        try {
          await googleManager.handleAuthCallback(code)
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('認證成功！您可以關閉此窗口。')
          server.close()
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(`認證失敗: ${(err as Error).message}`)
          server.close()
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('缺少授權碼')
      }
    })

    await new Promise<void>((resolve) => {
      server.listen(80, 'localhost', () => {
        resolve()
      })
      server.on('error', () => {
        // 如果 80 埠被占用，試試其他埠
        server.listen(3000, 'localhost', () => {
          resolve()
        })
      })
    })

    // Open auth URL in default browser
    await shell.openExternal(authUrl)

    // Wait for token file to be created (max 2 minutes)
    for (let i = 0; i < 120; i++) {
      if (fs.existsSync(userFile('token.json'))) {
        server.close()
        return { ok: true }
      }
      await new Promise(r => setTimeout(r, 1000))
    }

    server.close()
    return { ok: false, reason: '驗證超時' }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
})

ipcMain.handle('google:list-calendars', async () => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }

  try {
    const calendars = await googleManager.listCalendars()
    return { ok: true, calendars }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
})

ipcMain.handle('google:signout', () => {
  if (googleManager) {
    googleManager.clearAuth()
  }
  try {
    if (fs.existsSync(userFile('token.json'))) fs.unlinkSync(userFile('token.json'))
  } catch (e) { }
  return { ok: true }
})

ipcMain.handle('google:colors', async () => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }
  try {
    const colors = await googleManager.getColors()
    writeJson(userFile('colors.json'), colors)
    return { ok: true, colors }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
})

ipcMain.handle('colors:load', () => {
  const colors = readJson(userFile('colors.json'), null)
  return { ok: !!colors, colors }
})

ipcMain.handle('google:sync', async (_e, payload: any) => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }

  const log: string[] = []

  try {
    const calendarId = payload.calendarId || 'primary'
    const rangeStart = payload.rangeStart
    const rangeEnd = payload.rangeEnd

    log.push(`開始同步日曆: ${calendarId}`)
    log.push(`時間範圍: ${rangeStart} 至 ${rangeEnd}`)

    // Get local events
    const eventsFilePath = userFile('events.json')
    let localEvents = readJson(eventsFilePath, [])
    console.log(`[google:sync] 從 ${eventsFilePath} 讀取 ${localEvents.length} 個事件`)
    log.push(`本地有 ${localEvents.length} 個事件`)

    // 拉取 Google 事件（單向同步 - Google 為準）
    console.log(`[google:sync] 開始從 Google 拉取事件...`)
    const googleEvents = await googleManager.getEvents(calendarId, rangeStart, rangeEnd)
    log.push(`Google Calendar 中有 ${googleEvents.length} 個事件`)
    console.log(`[google:sync] 獲取 ${googleEvents.length} 個 Google 事件`)

    // Create a map for quick lookup
    const byGoogleId = new Map()
    for (const ev of localEvents) {
      if (ev.googleId) byGoogleId.set(ev.googleId, ev)
    }

    let pulledCount = 0
    for (const g of googleEvents) {
      if (g.status === 'cancelled') continue
      const converted = googleToLocal(g, calendarId)
      if (byGoogleId.has(g.id)) {
        // 已存在：以 Google 版本為準更新內容（保留本機 id）
        const existing = byGoogleId.get(g.id)
        Object.assign(existing, converted, { id: existing.id })
        console.log(`  [拉取] 更新: ${converted.title}`)
      } else {
        // 新事件從 Google 匯入
        localEvents.push(converted)
        byGoogleId.set(g.id, converted)
        console.log(`  [拉取] 新增: ${converted.title}`)
        log.push(`從 Google 匯入：${converted.title}`)
        pulledCount++
      }
    }

    if (pulledCount > 0) {
      writeJson(eventsFilePath, localEvents)
    }

    if (pulledCount > 0) {
      log.push(`從 Google 匯入：${pulledCount} 個新事件`)
    } else {
      log.push('沒有新的變更')
    }

    log.push('同步完成')
    return { ok: true, log }
  } catch (err) {
    log.push(`錯誤: ${(err as Error).message}`)
    return { ok: false, reason: (err as Error).message, log }
  }
})

ipcMain.handle('google:create-event', async (_e, payload: any) => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }
  try {
    const created = await googleManager.createEvent(payload.calendarId || 'primary', payload.event)
    return { ok: true, id: created.id }
  } catch (err) {
    console.error('創建 Google 事件失敗:', err)
    return { ok: false, reason: (err as Error).message }
  }
})

ipcMain.handle('google:update-event', async (_e, payload: any) => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }
  try {
    await googleManager.updateEvent(
      payload.calendarId || 'primary',
      payload.googleId,
      payload.event
    )
    return { ok: true }
  } catch (err) {
    console.error('更新 Google 事件失敗:', err)
    return { ok: false, reason: (err as Error).message }
  }
})

ipcMain.handle('google:delete-event', async (_e, arg: any) => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }
  const googleId = typeof arg === 'string' ? arg : (arg && arg.googleId)
  const calendarId = (typeof arg === 'object' && arg && arg.calendarId) || 'primary'
  if (!googleId) return { ok: false, reason: 'Missing googleId' }
  try {
    await googleManager.deleteEvent(calendarId, googleId)
    return { ok: true }
  } catch (err) {
    console.error('刪除 Google 事件失敗:', err)
    return { ok: false, reason: (err as Error).message }
  }
})

ipcMain.handle('app:open-external', (_e, url) => {
  if (url) shell.openExternal(url)
  return true
})
