# CalendarController｜行事曆同步小工具

一個 Windows 桌面小工具，可在本機編輯行事曆行程，並與 **Google 日曆** 雙向同步。以 Electron 打造，離線可用，支援多日曆群組、系統匣常駐與開機自啟。

> 📖 完整操作教學（含 Google 憑證申請圖文步驟）請見 [使用說明.md](使用說明.md)。

---

## ✨ 功能特色

- 📅 **月曆檢視**：切換上/下個月、回到今天
- ✏️ **事件管理**：新增／編輯／刪除（標題、日期、全天、起訖時間、地點、說明）
- 💾 **離線可用**：事件存於本機 JSON，沒網路也能編輯
- 🔄 **Google 雙向同步**：本機事件推送到 Google、Google 事件拉回本機
- 🗂️ **多日曆群組**：可選擇同步目標日曆；每筆事件也能指定所屬日曆，改選會自動移動
- 🎨 **依日曆上色**：事件顏色對應 Google 日曆顏色，並有顏色圖例列
- 🔔 **系統匣常駐**：關閉視窗縮小到系統匣，不中斷背景執行
- 🚀 **開機自啟**：可勾選登入 Windows 後自動開啟
- 🈶 **友善中文提示**：常見同步錯誤轉為中文說明並附處理連結

---

## 🚀 快速開始

需先安裝 [Node.js](https://nodejs.org/)。

```powershell
npm install    # 安裝相依套件（首次較久）
npm start      # 啟動小工具
```

只在本機使用、不同步 Google 的話，到這裡就完成了。

---

## 🔗 啟用 Google 日曆同步（一次性設定）

同步需要你自己的 Google API 憑證（免費）。摘要如下，詳細圖文見 [使用說明.md](使用說明.md)：

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立專案，啟用 **Google Calendar API**。
2. OAuth 同意畫面選 **外部**，把自己的 Google 帳號加入「測試使用者」。
3. 建立 **桌面應用程式** 類型的 OAuth 用戶端，下載 `credentials.json`。
4. 在工具中按 **匯入憑證 → 登入 Google → 同步**。

---

## 📦 打包

提供兩種版本，輸出到不同資料夾：

```powershell
npm run dist            # 同時產生安裝版與免安裝版
npm run dist:installer  # 只做安裝版   → dist/installer
npm run dist:portable   # 只做免安裝版 → dist/portable
```

| 版本 | 輸出 | 特性 |
| --- | --- | --- |
| 安裝版 | `dist/installer/*-setup.exe` | 可選安裝路徑、建立捷徑、可解除安裝 |
| 免安裝版 | `dist/portable/*-portable.exe` | 複製即用、不寫登錄檔、可放隨身碟 |

> 未做程式碼簽章，首次執行時 SmartScreen 可能提示「不明發行者」，點「其他資訊 → 仍要執行」即可。

---

## 🗄️ 資料存放位置

所有使用者資料存在下列資料夾，**不會**進入專案或 `.exe`：

```
%AppData%\calendar-controller\
├─ events.json        本機事件
├─ credentials.json   Google 憑證
├─ token.json         Google 授權權杖
└─ settings.json      選定的同步日曆
```

---

## 🧩 專案結構

```
CalendarController/
├─ main.js          主行程：OAuth、Calendar API 同步、系統匣、開機自啟
├─ preload.js       IPC 橋接（contextBridge）
├─ src/
│   ├─ index.html   畫面結構
│   ├─ styles.css   樣式與主題參數（:root）
│   └─ renderer.js  前端邏輯：月曆、事件、同步
├─ build/icon.ico   應用程式圖示
└─ package.json     相依套件與打包設定
```

**技術**：Electron 33、googleapis（OAuth2 loopback 授權）、原生 HTML/CSS/JS。

---

## 📄 授權

MIT License
