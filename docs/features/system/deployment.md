# 部署與啟動說明 (Deployment & Startup)

## 啟動方式

1. `npm install`
2. `npx playwright install chromium` # web_fetch SPA 渲染用
3. `npm link` # 建立全域指令
4. `lazyhole` # 啟動機器人

## 必要環境變數

- `TELEGRAM_TOKEN`: Bot token。
- `TELEGRAM_ALLOWED_USER_ID`: 唯一允許的 Telegram user id（白名單）。
- `MINIMAX_API_KEY`: LLM API key。
  缺任一啟動時直接退出。

## 可選環境變數

- `MINIMAX_MODEL`: MiniMax model id。
- `MINIMAX_MUSIC_MODEL`: MiniMax music model id，預設 `music-2.6`。
- `LLM_PROVIDER`: LLM provider（預設 minimax）。
- `AGENT_MAX_ROUNDS`: 每則使用者訊息最多 LLM/tool 互動輪數，預設 `5`。
- `MINIMAX_RETRY_MAX_ATTEMPTS` / `MINIMAX_RETRY_BASE_MS` / `MINIMAX_RETRY_MAX_MS`: MiniMax overload/rate-limit 重試參數。
- `WRITE_FILE_MAX_BYTES`: `write_file` 單次寫入內容大小上限（bytes）。
- `READ_FILE_MAX_BYTES`: `read_file` 單次輸出上限（bytes）。
- `SESSION_IDLE_TTL_MIN`: session idle 過期分鐘數，預設 `30`。
- `SESSION_COMPACT_TRIGGER_CHARS`: session 注入 prompt 前的壓縮觸發字元數，預設 `12000`。
- `MEMORY_DB_PATH`: 記憶歷史 SQLite 路徑，預設 `~/.lazyhole/memory.sqlite`。
- `SQLITE_BIN`: sqlite3 CLI 路徑，預設 `sqlite3`。

## bin 設定

- package.json bin 直接指向 `server.js`（shebang: `#!/usr/bin/env node`）。
- npm 建立 symlink 後，Node.js 從真實檔案位置解析 node_modules，不需 wrapper shell script。
- `.env` 使用 `__dirname` 絕對路徑載入，不受工作目錄影響。
- shell 指令預設工作目錄是啟動 `lazyhole` 當下的 cwd；若 `/run`、`exec_shell`、`write_file` 指定 `cwd`，則以該目錄解析相對路徑並執行。

## 執行中快捷鍵

- 按 q: 正常結束程序 (process.exit(0))。
- 按 Ctrl+C: 同樣可離開。
- 僅在 TTY 互動環境下啟用。
- 啟動時先印 `LazyHole-Agent` 面板，再進入事件流日誌。
