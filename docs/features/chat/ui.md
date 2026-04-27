# 終端機介面美化

## 核心設計
- **Typing 指示器**: 指令執行或 LLM 等待期間，透過 `sendChatAction(typing)` 每 4 秒重送，讓使用者在 Telegram 看到「正在輸入...」直到回覆送出或錯誤發生。
- **記憶歸檔進度**: TTL、`/memory clear`、`end_session` 需要 LLM 摘要時，先送出「摘要中 / 寫入中 / 已歸檔」等進度訊息，避免長等待無回饋。
- **程式碼區塊**: 一般送訊與 LLM 串流 finalize 會把 Markdown fenced code block 轉成 Telegram HTML `<pre><code>`；串流中維持純文字，最後一次 edit 才套格式，避免半截 code fence 造成 entity parse 錯誤。
- **長訊息切段**: Telegram 單則訊息上限 4096 字；`sendMessage` 以 3800 字安全線依行切成多則。切在 fenced code block 內時，前段補 closing fence、後段補 opening fence，保留 `<pre><code>` 呈現。LLM 串流只 edit 當前段，滿段後固定該訊息並開新訊息續流，避免長回覆遺漏。
- **啟動畫面**: 使用 `cli-box` 輸出 `LazyHole-Agent` 面板，集中展示 `ONLINE`、`MODE`、`ALLOW`、`CLI`、`TRANSPORT`、`EXIT`。
- **排版**: 啟動面板下方固定接 `Live Event Stream` 分隔線，將品牌區與執行日誌切成兩段。
- **色彩**: 透過 `chalk` 為不同事件套用專屬色標（如 `[EXEC]`, `[DONE]`, `[FAIL]`, `[RECV]`, `[ERR!]`），提升日誌可讀性。
- **時間戳記**: 每條日誌前綴精確到秒的時間標籤，便於追蹤事件。

## 事件與色彩對應
- ` EXEC `: 黃色背景，表示接收並準備執行遠端指令。
- ` DONE `: 綠色背景，指令執行成功。
- ` FAIL `: 紅色背景，指令執行失敗或錯誤。
- ` RECV `: 青色背景，收到非指令的普通訊息。
- ` ERR! `: 紅色背景，Telegram API 發送錯誤。
- ` POLL ERR `: 紅色背景，長輪詢中斷或 API 錯誤。
