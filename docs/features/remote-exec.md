# 遠端指令執行 /run（直通逃生口）

## 功能
- `/run <指令>`：不經 LLM，直接執行 shell 指令並回傳 stdout/stderr（Markdown code block）。
- `/run --cwd <路徑> -- <指令>`：在指定工作目錄執行；路徑含空白時可加引號。
- 保留作為除錯與強制執行的逃生口；一般情況下直接打自然語言讓 agent 判斷。

## 限制
- timeout 30 秒，逾時終止並回覆友善訊息。
- 輸出超過 3800 字元截斷，尾端附 `...(已截斷)`（Telegram 4096 字元上限）。
- `cwd` 未提供時，沿用 `lazyhole` 啟動時的工作目錄。
- `cwd` 需存在且為目錄，否則直接回失敗，不執行指令。

## 安全
- 僅 `TELEGRAM_ALLOWED_USER_ID` 對應的使用者可觸發（白名單在 `server.js` 入口）。
- 執行環境與 Node.js 程序相同，可存取本地檔案。

## 實作
- `src/commands/run.js`：解析 `/run` 或 `/run --cwd ... -- ...`，再呼叫共用的 `src/agent/tools/shell.js`。
