'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');

// ---------------------------------------------------------------------------
// 檔案路徑：所有使用者資料放在 Electron 的 userData 目錄下
//   - credentials.json：使用者從 Google Cloud Console 下載的 OAuth 憑證
//   - token.json：授權後取得的存取權杖（自動產生）
//   - events.json：本機行事曆事件
// ---------------------------------------------------------------------------
function userFile(name) {
  return path.join(app.getPath('userData'), name);
}

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: '行事曆同步小工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// 本機事件讀寫
// ---------------------------------------------------------------------------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

ipcMain.handle('events:load', () => readJson(userFile('events.json'), []));

ipcMain.handle('events:save', (_e, events) => {
  writeJson(userFile('events.json'), events);
  return true;
});

// ---------------------------------------------------------------------------
// Google 憑證與授權
// ---------------------------------------------------------------------------
function loadCredentials() {
  const raw = readJson(userFile('credentials.json'), null);
  if (!raw) return null;
  const key = raw.installed || raw.web;
  if (!key || !key.client_id || !key.client_secret) return null;
  return { clientId: key.client_id, clientSecret: key.client_secret };
}

function buildOAuthClient(redirectUri) {
  const c = loadCredentials();
  if (!c) throw new Error('尚未匯入 Google 憑證（credentials.json）');
  return new google.auth.OAuth2(c.clientId, c.clientSecret, redirectUri);
}

function getAuthedClientOrNull() {
  const token = readJson(userFile('token.json'), null);
  if (!token) return null;
  let oAuth2Client;
  try {
    oAuth2Client = buildOAuthClient('http://127.0.0.1');
  } catch (e) {
    return null;
  }
  oAuth2Client.setCredentials(token);
  // 權杖更新時自動存回
  oAuth2Client.on('tokens', (tokens) => {
    const merged = Object.assign({}, readJson(userFile('token.json'), {}), tokens);
    writeJson(userFile('token.json'), merged);
  });
  return oAuth2Client;
}

ipcMain.handle('google:status', () => ({
  hasCredentials: !!loadCredentials(),
  signedIn: !!readJson(userFile('token.json'), null)
}));

// 匯入 credentials.json（複製到 userData）
ipcMain.handle('google:import-credentials', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '選擇 Google OAuth 憑證檔 (credentials.json)',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, reason: '已取消' };
  const parsed = readJson(res.filePaths[0], null);
  if (!parsed || !(parsed.installed || parsed.web)) {
    return { ok: false, reason: '檔案格式不正確，需為 OAuth 用戶端憑證' };
  }
  fs.copyFileSync(res.filePaths[0], userFile('credentials.json'));
  return { ok: true, hasCredentials: !!loadCredentials() };
});

// OAuth loopback 授權流程
ipcMain.handle('google:signin', async () => {
  if (!loadCredentials()) return { ok: false, reason: '尚未匯入憑證' };

  return new Promise((resolve) => {
    const server = http.createServer();
    server.on('error', (err) => resolve({ ok: false, reason: '無法啟動本機授權伺服器：' + err.message }));

    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}`;
      let oAuth2Client;
      try {
        oAuth2Client = buildOAuthClient(redirectUri);
      } catch (e) {
        server.close();
        return resolve({ ok: false, reason: e.message });
      }

      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES
      });

      server.on('request', async (req, res) => {
        try {
          const url = new URL(req.url, redirectUri);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          if (error) {
            res.end('<h2>授權失敗：' + error + '</h2><p>可關閉此視窗。</p>');
            server.close();
            return resolve({ ok: false, reason: '使用者拒絕或授權失敗：' + error });
          }
          if (!code) {
            res.end('等待授權碼…');
            return;
          }
          const { tokens } = await oAuth2Client.getToken(code);
          writeJson(userFile('token.json'), tokens);
          res.end('<h2>授權成功！</h2><p>請回到行事曆小工具，可關閉此視窗。</p>');
          server.close();
          resolve({ ok: true });
        } catch (e) {
          res.end('<h2>授權處理失敗：' + e.message + '</h2>');
          server.close();
          resolve({ ok: false, reason: e.message });
        }
      });

      shell.openExternal(authUrl);
    });
  });
});

ipcMain.handle('google:signout', () => {
  try {
    if (fs.existsSync(userFile('token.json'))) fs.unlinkSync(userFile('token.json'));
  } catch (e) { /* 忽略 */ }
  return { ok: true };
});

// ---------------------------------------------------------------------------
// 事件 <-> Google 格式轉換
// ---------------------------------------------------------------------------
function localToGoogle(ev) {
  const body = {
    summary: ev.title || '(無標題)',
    description: ev.description || '',
    location: ev.location || ''
  };
  if (ev.allDay) {
    // 全天事件：end 為隔天（Google 規定 end 為排他）
    const start = ev.date;
    const endDate = new Date(ev.date + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    const end = endDate.toISOString().slice(0, 10);
    body.start = { date: start };
    body.end = { date: end };
  } else {
    const s = ev.startTime || '09:00';
    const e = ev.endTime || ev.startTime || '10:00';
    body.start = { dateTime: new Date(ev.date + 'T' + s + ':00').toISOString() };
    body.end = { dateTime: new Date(ev.date + 'T' + e + ':00').toISOString() };
  }
  return body;
}

function googleToLocal(g) {
  const allDay = !!(g.start && g.start.date);
  let date, startTime = '', endTime = '';
  if (allDay) {
    date = g.start.date;
  } else {
    const sd = new Date(g.start.dateTime);
    const ed = g.end && g.end.dateTime ? new Date(g.end.dateTime) : sd;
    date = fmtLocalDate(sd);
    startTime = fmtLocalTime(sd);
    endTime = fmtLocalTime(ed);
  }
  return {
    id: 'g_' + g.id,
    googleId: g.id,
    title: g.summary || '(無標題)',
    description: g.description || '',
    location: g.location || '',
    date,
    startTime,
    endTime,
    allDay,
    updatedAt: g.updated || new Date().toISOString()
  };
}

function fmtLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtLocalTime(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// 雙向同步
//   input: { events, rangeStart, rangeEnd }  (rangeStart/End 為 YYYY-MM-DD)
//   步驟：
//     1. 本機事件推送到 Google（新增或更新）
//     2. 從 Google 拉取指定範圍事件，合併回本機（以 googleId 對應）
// ---------------------------------------------------------------------------
ipcMain.handle('google:sync', async (_e, payload) => {
  const auth = getAuthedClientOrNull();
  if (!auth) return { ok: false, reason: '尚未登入 Google' };

  const calendar = google.calendar({ version: 'v3', auth });
  const log = [];
  let events = Array.isArray(payload.events) ? payload.events.slice() : [];

  // 1. 推送本機事件
  for (const ev of events) {
    if (ev._deleted) continue;
    try {
      if (ev.googleId) {
        await calendar.events.update({
          calendarId: 'primary',
          eventId: ev.googleId,
          requestBody: localToGoogle(ev)
        });
        log.push(`更新：${ev.title}`);
      } else {
        const created = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: localToGoogle(ev)
        });
        ev.googleId = created.data.id;
        log.push(`新增到 Google：${ev.title}`);
      }
    } catch (err) {
      log.push(`推送失敗（${ev.title}）：${err.message}`);
    }
  }

  // 2. 拉取 Google 事件
  try {
    const timeMin = new Date(payload.rangeStart + 'T00:00:00').toISOString();
    const endD = new Date(payload.rangeEnd + 'T00:00:00');
    endD.setDate(endD.getDate() + 1);
    const timeMax = endD.toISOString();

    const resp = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500
    });

    const byGoogleId = new Map();
    for (const ev of events) if (ev.googleId) byGoogleId.set(ev.googleId, ev);

    for (const g of resp.data.items || []) {
      if (g.status === 'cancelled') continue;
      const converted = googleToLocal(g);
      if (byGoogleId.has(g.id)) {
        // 已存在：以 Google 版本為準更新內容（保留本機 id）
        const existing = byGoogleId.get(g.id);
        Object.assign(existing, converted, { id: existing.id });
      } else {
        events.push(converted);
        byGoogleId.set(g.id, converted);
        log.push(`從 Google 匯入：${converted.title}`);
      }
    }
  } catch (err) {
    log.push('拉取 Google 事件失敗：' + err.message);
    return { ok: false, reason: err.message, events, log };
  }

  return { ok: true, events, log };
});

// 刪除單一 Google 事件（本機刪除時呼叫）
ipcMain.handle('google:delete-event', async (_e, googleId) => {
  const auth = getAuthedClientOrNull();
  if (!auth || !googleId) return { ok: false };
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId: 'primary', eventId: googleId });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});
