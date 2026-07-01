'use strict';

// ---------------------------------------------------------------------------
// 狀態
// ---------------------------------------------------------------------------
let events = [];          // 全部事件
let viewYear, viewMonth;  // 目前檢視的年 / 月（0-based）
let editingId = null;     // 目前編輯中的事件 id（null 表示新增）
let googleSignedIn = false;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// ---------------------------------------------------------------------------
// 工具函式
// ---------------------------------------------------------------------------
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayStr() {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth(), t.getDate());
}
function uuid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function setStatus(msg) { document.getElementById('statusMsg').textContent = msg; }

function eventsOn(dateStr) {
  return events
    .filter((e) => !e._deleted && e.date === dateStr)
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
}

// ---------------------------------------------------------------------------
// 月曆繪製
// ---------------------------------------------------------------------------
function renderWeekdays() {
  const wd = document.getElementById('weekdays');
  wd.innerHTML = '';
  WEEKDAYS.forEach((w) => {
    const d = document.createElement('div');
    d.textContent = '週' + w;
    wd.appendChild(d);
  });
}

function renderCalendar() {
  document.getElementById('monthLabel').textContent = `${viewYear} 年 ${viewMonth + 1} 月`;
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();           // 該月 1 號是星期幾
  const startDate = new Date(viewYear, viewMonth, 1 - startWeekday);
  const today = todayStr();

  // 固定顯示 6 週 × 7 天 = 42 格
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const dateStr = ymd(y, m, day);

    const cell = document.createElement('div');
    cell.className = 'cell';
    if (m !== viewMonth) cell.classList.add('other-month');
    if (dateStr === today) cell.classList.add('today');
    cell.addEventListener('click', () => openModal(null, dateStr));

    const num = document.createElement('div');
    num.className = 'date-num';
    if (d.getDay() === 0) num.classList.add('sun');
    num.textContent = day;
    cell.appendChild(num);

    const dayEvents = eventsOn(dateStr);
    const shown = dayEvents.slice(0, 3);
    shown.forEach((ev) => {
      const el = document.createElement('div');
      el.className = 'ev' + (ev.googleId ? ' google' : '');
      if (!ev.allDay && ev.startTime) {
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = ev.startTime;
        el.appendChild(t);
      }
      el.appendChild(document.createTextNode(ev.title || '(無標題)'));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(ev.id);
      });
      cell.appendChild(el);
    });
    if (dayEvents.length > shown.length) {
      const more = document.createElement('div');
      more.className = 'more';
      more.textContent = `還有 ${dayEvents.length - shown.length} 個…`;
      cell.appendChild(more);
    }

    grid.appendChild(cell);
  }
}

// ---------------------------------------------------------------------------
// 事件編輯對話框
// ---------------------------------------------------------------------------
function openModal(id, presetDate) {
  editingId = id;
  const ev = id ? events.find((e) => e.id === id) : null;

  document.getElementById('modalTitle').textContent = ev ? '編輯事件' : '新增事件';
  document.getElementById('fTitle').value = ev ? ev.title : '';
  document.getElementById('fDate').value = ev ? ev.date : (presetDate || todayStr());
  document.getElementById('fAllDay').checked = ev ? !!ev.allDay : false;
  document.getElementById('fStart').value = ev ? (ev.startTime || '09:00') : '09:00';
  document.getElementById('fEnd').value = ev ? (ev.endTime || '10:00') : '10:00';
  document.getElementById('fLocation').value = ev ? (ev.location || '') : '';
  document.getElementById('fDesc').value = ev ? (ev.description || '') : '';

  document.getElementById('deleteBtn').classList.toggle('hidden', !ev);
  document.getElementById('gLink').classList.toggle('hidden', !(ev && ev.googleId));
  toggleTimeRow();

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('fTitle').focus();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editingId = null;
}

function toggleTimeRow() {
  const allDay = document.getElementById('fAllDay').checked;
  document.getElementById('timeRow').classList.toggle('hidden', allDay);
}

async function saveEvent() {
  const title = document.getElementById('fTitle').value.trim();
  const date = document.getElementById('fDate').value;
  if (!date) { alert('請選擇日期'); return; }

  const allDay = document.getElementById('fAllDay').checked;
  const data = {
    title: title || '(無標題)',
    date,
    allDay,
    startTime: allDay ? '' : document.getElementById('fStart').value,
    endTime: allDay ? '' : document.getElementById('fEnd').value,
    location: document.getElementById('fLocation').value.trim(),
    description: document.getElementById('fDesc').value.trim(),
    updatedAt: new Date().toISOString()
  };

  if (editingId) {
    const ev = events.find((e) => e.id === editingId);
    Object.assign(ev, data);
  } else {
    events.push(Object.assign({ id: uuid(), googleId: null }, data));
  }

  await persist();
  closeModal();
  renderCalendar();
  setStatus('已儲存（尚未同步到 Google）');
}

async function deleteEvent() {
  if (!editingId) return;
  const ev = events.find((e) => e.id === editingId);
  if (!ev) return;
  if (!confirm(`確定刪除「${ev.title}」？`)) return;

  // 若已同步到 Google，一併從 Google 刪除
  if (ev.googleId && googleSignedIn) {
    const r = await window.api.deleteGoogleEvent(ev.googleId);
    if (!r.ok) setStatus('Google 端刪除失敗：' + (r.reason || '未知'));
  }
  events = events.filter((e) => e.id !== editingId);
  await persist();
  closeModal();
  renderCalendar();
  setStatus('已刪除');
}

async function persist() {
  await window.api.saveEvents(events);
}

// ---------------------------------------------------------------------------
// Google 狀態 / 授權 / 同步
// ---------------------------------------------------------------------------
async function refreshGoogleStatus() {
  const s = await window.api.googleStatus();
  googleSignedIn = s.signedIn;
  const statusEl = document.getElementById('googleStatus');
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const syncBtn = document.getElementById('syncBtn');

  if (s.signedIn) {
    statusEl.textContent = 'Google：已連線';
    statusEl.classList.add('on');
    signInBtn.classList.add('hidden');
    signOutBtn.classList.remove('hidden');
    syncBtn.disabled = false;
  } else {
    statusEl.textContent = s.hasCredentials ? 'Google：已匯入憑證，待登入' : 'Google：未連線';
    statusEl.classList.remove('on');
    signInBtn.classList.remove('hidden');
    signInBtn.disabled = !s.hasCredentials;
    signOutBtn.classList.add('hidden');
    syncBtn.disabled = true;
  }
}

async function doImportCredentials() {
  const r = await window.api.importCredentials();
  if (r.ok) {
    setStatus('已匯入 Google 憑證，請按「登入 Google」');
  } else {
    setStatus('匯入失敗：' + (r.reason || ''));
  }
  await refreshGoogleStatus();
}

async function doSignIn() {
  setStatus('已開啟瀏覽器，請完成 Google 授權…');
  const r = await window.api.signIn();
  if (r.ok) setStatus('Google 登入成功');
  else setStatus('登入失敗：' + (r.reason || ''));
  await refreshGoogleStatus();
}

async function doSignOut() {
  await window.api.signOut();
  setStatus('已登出 Google');
  await refreshGoogleStatus();
}

async function doSync() {
  const syncBtn = document.getElementById('syncBtn');
  syncBtn.disabled = true;
  setStatus('同步中…');

  // 同步範圍：目前檢視月份的前後各一個月
  const start = ymd(viewYear, viewMonth - 1 < 0 ? 11 : viewMonth - 1, 1);
  const startY = viewMonth - 1 < 0 ? viewYear - 1 : viewYear;
  const startM = viewMonth - 1 < 0 ? 11 : viewMonth - 1;
  const rangeStart = ymd(startY, startM, 1);
  const endD = new Date(viewYear, viewMonth + 2, 0); // 下下個月最後一天
  const rangeEnd = ymd(endD.getFullYear(), endD.getMonth(), endD.getDate());

  const r = await window.api.sync({ events, rangeStart, rangeEnd });
  if (r.ok) {
    events = r.events;
    await persist();
    renderCalendar();
    showLog(r.log);
    setStatus('同步完成');
  } else {
    if (r.events) { events = r.events; await persist(); renderCalendar(); }
    setStatus('同步失敗：' + (r.reason || ''));
    if (r.log) showLog(r.log);
  }
  syncBtn.disabled = false;
}

function showLog(log) {
  const content = (log && log.length) ? log.join('\n') : '沒有變更。';
  document.getElementById('logContent').textContent = content;
  document.getElementById('logModal').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// 事件綁定 / 初始化
// ---------------------------------------------------------------------------
function bindEvents() {
  document.getElementById('prevBtn').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar();
  });
  document.getElementById('nextBtn').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  });
  document.getElementById('todayBtn').addEventListener('click', () => {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    renderCalendar();
  });

  document.getElementById('fAllDay').addEventListener('change', toggleTimeRow);
  document.getElementById('saveBtn').addEventListener('click', saveEvent);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('deleteBtn').addEventListener('click', deleteEvent);

  document.getElementById('importBtn').addEventListener('click', doImportCredentials);
  document.getElementById('signInBtn').addEventListener('click', doSignIn);
  document.getElementById('signOutBtn').addEventListener('click', doSignOut);
  document.getElementById('syncBtn').addEventListener('click', doSync);

  document.getElementById('logCloseBtn').addEventListener('click', () => {
    document.getElementById('logModal').classList.add('hidden');
  });

  // 使用說明
  document.getElementById('helpBtn').addEventListener('click', () => {
    document.getElementById('helpModal').classList.remove('hidden');
  });
  document.getElementById('helpCloseBtn').addEventListener('click', () => {
    document.getElementById('helpModal').classList.add('hidden');
  });

  // 點對話框背景關閉
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  document.getElementById('helpModal').addEventListener('click', (e) => {
    if (e.target.id === 'helpModal') e.currentTarget.classList.add('hidden');
  });
  document.getElementById('logModal').addEventListener('click', (e) => {
    if (e.target.id === 'logModal') e.currentTarget.classList.add('hidden');
  });

  // 鍵盤：Esc 關閉最上層對話框
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('helpModal').classList.contains('hidden')) {
      document.getElementById('helpModal').classList.add('hidden');
    } else if (!document.getElementById('logModal').classList.contains('hidden')) {
      document.getElementById('logModal').classList.add('hidden');
    } else if (!document.getElementById('modal').classList.contains('hidden')) {
      closeModal();
    }
  });
}

async function init() {
  const t = new Date();
  viewYear = t.getFullYear();
  viewMonth = t.getMonth();

  renderWeekdays();
  bindEvents();

  events = await window.api.loadEvents();
  renderCalendar();
  await refreshGoogleStatus();
  setStatus('就緒');
}

init();
