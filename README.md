# CalendarController｜行事曆同步小工具（Vue3）

一個 Windows 桌面小工具，可在本機編輯行事曆行程，並與 **Google 日曆** 同步。以 **Electron + Vue 3 + TypeScript** 打造，支援多日曆群組、系統匣常駐、開機自啟，以及**手動深/淺色主題切換**。

> 📖 完整操作教學（含 Google 憑證申請圖文步驟）請見 [使用說明.md](使用說明.md)。

---

## ✨ 功能特色

- 📅 **月曆檢視**：切換上/下個月、回到今天
- ✏️ **事件管理**：新增／編輯／刪除（標題、日期、全天、起訖時間、地點、說明）
- 🗂️ **多日曆群組**：選擇同步目標日曆，事件依日曆顏色顯示
- 🔄 **Google 同步**：與 Google 日曆同步行程
- 🌗 **主題切換**：手動深色／淺色兩段切換，記住偏好
- 🔔 **系統匣常駐**：關閉視窗縮小到系統匣，不中斷背景執行
- 🚀 **開機自啟**：可切換登入 Windows 後自動開啟

---

## 🚀 快速開始

需先安裝 [Node.js](https://nodejs.org/)。

```powershell
npm install    # 安裝相依套件（首次較久）
npm start      # 建置並啟動（等同 npm run build + electron .）
```

開發時也可分開執行：

```powershell
npm run build  # 建置 renderer（Vite）與主行程（esbuild）到 dist/
```

---

## 🔗 啟用 Google 日曆同步（一次性設定）

需要你自己的 Google API 憑證（免費）。摘要如下，詳細圖文見 [使用說明.md](使用說明.md)：

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立專案，啟用 **Google Calendar API**。
2. OAuth 同意畫面選 **外部**，把自己的 Google 帳號加入「測試使用者」。
3. 建立 **桌面應用程式** 類型的 OAuth 用戶端，下載 `credentials.json`。
4. 在工具中匯入憑證 → 登入 Google → 同步。

---

## 📦 打包

輸出到 `dist-release/`（與 Vite 的 `dist/` 分開）：

```powershell
npm run dist            # 同時產生安裝版與免安裝版
npm run dist:installer  # 只做安裝版   → dist-release/installer
npm run dist:portable   # 只做免安裝版 → dist-release/portable
```

| 版本 | 輸出 | 特性 |
| --- | --- | --- |
| 安裝版 | `dist-release/installer/*-setup.exe` | 可選安裝路徑、建立捷徑、可解除安裝 |
| 免安裝版 | `dist-release/portable/*-portable.exe` | 複製即用、不寫登錄檔、可放隨身碟 |

> 未做程式碼簽章，首次執行時 SmartScreen 可能提示「不明發行者」，點「其他資訊 → 仍要執行」即可。

---

## 🗄️ 資料存放位置

使用者資料存在下列資料夾，**不會**進入專案或 `.exe`：

```
%AppData%\calendar-controller\
├─ events.json        本機事件
├─ credentials.json   Google 憑證
├─ token.json         Google 授權權杖
├─ settings.json      選定的同步日曆
└─ colors.json        Google 日曆顏色快取
```

---

## 🧩 專案結構

```
CalendarController/
├─ src/
│   ├─ main.ts             主行程：視窗、系統匣、開機自啟、IPC、Google 同步
│   ├─ preload.ts          IPC 橋接（contextBridge → window.electronAPI）
│   ├─ google-calendar.ts  Google Calendar API 封裝
│   ├─ build/icon.ico       應用程式圖示（視窗/系統匣）
│   └─ renderer/           Vue 3 前端
│       ├─ App.vue
│       ├─ components/     Header、Calendar、EventForm、GoogleAuth…
│       ├─ composables/    useTheme（主題）、useToast、useDialog
│       ├─ stores/         Pinia：events、google、app
│       ├─ services/ipc.ts
│       └─ styles/         tailwind.css、index.css（主題變數）
├─ scripts/build-main.js   以 esbuild 編譯主行程/preload
├─ vite.config.ts / tailwind.config.js / postcss.config.js / tsconfig*.json
├─ build/icon.ico          打包用圖示（安裝檔/exe）
└─ package.json
```

**技術**：Electron 33、Vue 3、TypeScript、Vite 6、Tailwind CSS 4、Element Plus、Pinia、googleapis。

---

## 📄 授權

MIT License
