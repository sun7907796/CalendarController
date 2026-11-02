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

// 取 HH:mm（相容完整 ISO 或已是 HH:mm）
function timePart(t: string): string {
  if (!t) return ''
  return t.includes('T') ? t.substring(11, 16) : t
}

function deriveEndDateStr(ev: any): string {
  if (ev.endDate) return String(ev.endDate).slice(0, 10)
  if (ev.endTime && String(ev.endTime).includes('T')) return String(ev.endTime).slice(0, 10)
  return ev.date
}

function localToGoogle(ev: any) {
  const body: any = {
    summary: ev.title || '(無標題)',
    description: ev.description || '',
    location: ev.location || ''
  }
  const startStr = String(ev.date).slice(0, 10)
  const endStr = deriveEndDateStr(ev)
  if (ev.allDay) {
    // Google 全天 end.date 為排他 → +1 天
    const endExclusive = new Date(endStr + 'T00:00:00')
    endExclusive.setDate(endExclusive.getDate() + 1)
    body.start = { date: startStr }
    body.end = { date: fmtLocalDate(endExclusive) }
  } else {
    const s = timePart(ev.startTime) || '09:00'
    const e = timePart(ev.endTime) || s || '10:00'
    body.start = { dateTime: new Date(startStr + 'T' + s + ':00').toISOString() }
    body.end = { dateTime: new Date(endStr + 'T' + e + ':00').toISOString() }
  }
  return body
}

function googleToLocal(g: any, calendarId: string) {
  const allDay = !!(g.start && g.start.date)
  let date = '', endDate = '', startTime = '', endTime = ''
  if (allDay) {
    date = g.start.date
    // Google 全天 end.date 為排他 → 轉回含當日的結束日（-1 天）
    if (g.end && g.end.date) {
      const endIncl = new Date(g.end.date + 'T00:00:00')
      endIncl.setDate(endIncl.getDate() - 1)
      endDate = fmtLocalDate(endIncl)
    } else {
      endDate = date
    }
  } else {
    const sd = new Date(g.start.dateTime)
    const ed = g.end && g.end.dateTime ? new Date(g.end.dateTime) : sd
    date = fmtLocalDate(sd)
    endDate = fmtLocalDate(ed)
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
    endDate,
    startTime,
    endTime,
    allDay,
    updatedAt: g.updated || new Date().toISOString()
  }
}

// 將 Google API 常見錯誤轉成中文友善提示（必要時附上處理連結）
function interpretGoogleError(err: any): { friendly: string; url?: string } {
  const msg = (err && err.message) ? err.message : String(err)
  // Calendar API 尚未啟用
  if (/has not been used in project|it is disabled|accessNotConfigured/i.test(msg) && /calendar/i.test(msg)) {
    const m = msg.match(/project\s+(\d+)/i)
    const pid = m ? m[1] : null
    const url = pid
      ? `https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=${pid}`
      : 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'
    return {
      friendly: `Google Calendar API 尚未在你的專案${pid ? '（' + pid + '）' : ''}啟用。請點按鈕開啟啟用頁、按「啟用」，等 1～3 分鐘後再同步一次。`,
      url
    }
  }
  if (/invalid_grant|Token has been expired|invalid credentials|invalid_token/i.test(msg)) {
    return { friendly: '授權已失效或過期，請按「登出」後重新「登入 Google」。' }
  }
  if (/insufficient|Insufficient Permission|forbidden|PERMISSION_DENIED/i.test(msg)) {
    return { friendly: '授權範圍不足或該日曆為唯讀，請改用有編輯權的日曆，或重新登入並同意所有權限。' }
  }
  return { friendly: msg }
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

  let server: http.Server | null = null
  try {
    return await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      let settled = false
      let redirectUri = ''
      let timer: NodeJS.Timeout | null = null

      const finish = (result: { ok: boolean; reason?: string }) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        try { server?.close() } catch { }
        resolve(result)
      }

      // 本機回呼伺服器：接收 Google 導回的授權碼
      server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url || '', redirectUri || 'http://127.0.0.1')
          const code = url.searchParams.get('code')
          const authError = url.searchParams.get('error')

          if (authError) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(`授權被拒絕：${authError}`)
            finish({ ok: false, reason: `授權被拒絕：${authError}` })
            return
          }

          if (!code) {
            // 瀏覽器可能先來要 favicon 等，忽略而不結束流程
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('缺少授權碼')
            return
          }

          await googleManager!.handleAuthCallback(code, redirectUri)
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('認證成功！您可以關閉此視窗，回到行事曆小工具。')
          finish({ ok: true })
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(`認證失敗：${(err as Error).message}`)
          finish({ ok: false, reason: (err as Error).message })
        }
      })

      // 伺服器無法啟動（例如埠被占用）時，立即回報而不是卡住
      server.on('error', (err) => {
        finish({ ok: false, reason: `無法啟動本機授權伺服器：${(err as Error).message}` })
      })

      // 綁定 127.0.0.1 的隨機可用埠，避免與 80/3000 等常用埠衝突；
      // redirectUri 由實際取得的埠號組成，確保與 Google 導回位址一致。
      server.listen(0, '127.0.0.1', async () => {
        try {
          const addr = server!.address()
          const port = (addr && typeof addr === 'object') ? addr.port : 0
          if (!port) {
            finish({ ok: false, reason: '無法取得本機授權伺服器埠號' })
            return
          }
          redirectUri = `http://127.0.0.1:${port}`
          const authUrl = googleManager!.getAuthUrl(redirectUri)
          await shell.openExternal(authUrl)
        } catch (err) {
          finish({ ok: false, reason: (err as Error).message })
        }
      })

      // 最多等待 3 分鐘，逾時即結束，避免視窗一直卡在登入中
      timer = setTimeout(() => {
        finish({ ok: false, reason: '驗證逾時，請重新登入 Google' })
      }, 180000)
    })
  } catch (err) {
    try { server?.close() } catch { }
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
  let action: { url: string } | null = null

  try {
    const target = payload.calendarId || 'primary'
    const rangeStart = payload.rangeStart
    const rangeEnd = payload.rangeEnd

    const eventsFilePath = userFile('events.json')
    let localEvents: any[] = readJson(eventsFilePath, [])
    let changed = false

    // 1) 推送：把「屬於此日曆」的本機事件送到 Google（新增 / 待移動）
    //    已同步事件的一般內容更新由即時推送處理，這裡負責補推與移動。
    for (const ev of localEvents) {
      if (ev._deleted) continue
      const evCal = ev.calendarId || target
      if (evCal !== target) continue // 只處理屬於目前同步日曆的事件

      try {
        if (!ev.googleId) {
          // 尚未同步 → 新增到 Google
          const created = await googleManager.createEvent(target, localToGoogle(ev))
          ev.googleId = created.id
          ev.calendarId = target
          changed = true
          log.push(`新增到 Google：${ev.title}`)
        } else if (ev._moveFrom !== undefined && ev._moveFrom !== target) {
          // 有待處理的移動（例如離線時改了日曆）
          await googleManager.moveEvent(ev._moveFrom, ev.googleId, target)
          await googleManager.updateEvent(target, ev.googleId, localToGoogle(ev))
          delete ev._moveFrom
          changed = true
          log.push(`移動並更新：${ev.title}`)
        }
      } catch (err) {
        const it = interpretGoogleError(err)
        log.push(`推送失敗（${ev.title}）：${it.friendly}`)
        if (it.url) action = { url: it.url }
      }
    }

    // 2) 拉取：從 Google 取回此日曆事件，合併回本機（以 googleId 對應）
    const googleEvents = await googleManager.getEvents(target, rangeStart, rangeEnd)
    log.push(`Google（${target}）有 ${googleEvents.length} 個事件`)

    const byGoogleId = new Map()
    for (const ev of localEvents) {
      if (ev.googleId) byGoogleId.set(ev.googleId, ev)
    }

    let pulledCount = 0
    for (const g of googleEvents) {
      if (g.status === 'cancelled') continue
      const converted = googleToLocal(g, target)
      if (byGoogleId.has(g.id)) {
        const existing = byGoogleId.get(g.id)
        // 保留本機 id 與待移動標記
        Object.assign(existing, converted, { id: existing.id, _moveFrom: existing._moveFrom })
      } else {
        localEvents.push(converted)
        byGoogleId.set(g.id, converted)
        pulledCount++
      }
    }

    if (pulledCount > 0) log.push(`從 Google 匯入：${pulledCount} 個新事件`)
    if (changed || pulledCount > 0) writeJson(eventsFilePath, localEvents)
    if (!changed && pulledCount === 0) log.push('沒有新的變更')

    log.push('同步完成')
    return { ok: !action, reason: action ? '部分項目推送失敗，請見下方說明' : undefined, log, action }
  } catch (err) {
    const it = interpretGoogleError(err)
    log.push(`錯誤：${it.friendly}`)
    return { ok: false, reason: it.friendly, log, action: it.url ? { url: it.url } : action }
  }
})

ipcMain.handle('google:create-event', async (_e, payload: any) => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }
  try {
    const created = await googleManager.createEvent(payload.calendarId || 'primary', payload.event)
    return { ok: true, id: created.id }
  } catch (err) {
    console.error('創建 Google 事件失敗:', err)
    const it = interpretGoogleError(err)
    return { ok: false, reason: it.friendly, url: it.url || null }
  }
})

ipcMain.handle('google:update-event', async (_e, payload: any) => {
  if (!googleManager) return { ok: false, reason: 'Google manager not initialized' }
  const calendarId = payload.calendarId || 'primary'
  const fromCalendarId = payload.fromCalendarId
  try {
    // 使用者改選了其他日曆 → 先把事件移動到新日曆
    if (fromCalendarId && fromCalendarId !== calendarId) {
      await googleManager.moveEvent(fromCalendarId, payload.googleId, calendarId)
    }
    await googleManager.updateEvent(calendarId, payload.googleId, payload.event)
    return { ok: true }
  } catch (err) {
    console.error('更新 Google 事件失敗:', err)
    const it = interpretGoogleError(err)
    return { ok: false, reason: it.friendly, url: it.url || null }
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
    const it = interpretGoogleError(err)
    return { ok: false, reason: it.friendly, url: it.url || null }
  }
})

ipcMain.handle('app:open-external', (_e, url) => {
  if (url) shell.openExternal(url)
  return true
})
