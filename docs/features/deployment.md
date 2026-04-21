# 部署與啟動說明 (Deployment & Startup)

## 啟動方式
1. 全域安裝: 在專案目錄執行 `npm install -g .`。
2. 任意目錄執行 `lazyhole` 啟動。

## 必要環境變數
- `TELEGRAM_TOKEN`: Bot token。
- `TELEGRAM_ALLOWED_USER_ID`: 唯一允許的 Telegram user id（白名單）。
- `MINIMAX_API_KEY`: LLM API key。
缺任一啟動時直接退出。

## bin 設定
- package.json bin 直接指向 `server.js`（shebang: `#!/usr/bin/env node`）。
- npm 建立 symlink 後，Node.js 從真實檔案位置解析 node_modules，不需 wrapper shell script。
- `.env` 使用 `__dirname` 絕對路徑載入，不受工作目錄影響。

## 執行中快捷鍵
- 按 q: 正常結束程序 (process.exit(0))。
- 按 Ctrl+C: 同樣可離開。
- 僅在 TTY 互動環境下啟用。
- 啟動時先印 `LazyHole-Agent` 面板，再進入事件流日誌。
