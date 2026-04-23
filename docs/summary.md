# LazyHole-Agent 專案摘要 (L1)

## 核心入口 (Entry Points)
- **啟動入口**: `server.js` (負責 Telegram Polling、白名單過濾、指令路由)。
- **邏輯入口**: `src/agent/index.js` (負責 LLM 多輪對話決策與工具呼叫)。

## 技術設計 (Tech Design)
- **核心理念**: 極簡無狀態、無記憶、基於指令執行的 Telegram AI Agent。
- **關鍵依賴**: 使用 MiniMax (chatcompletion_v2) 作為大腦，Telegram Long Polling 作為感官。
- **數據流**: Telegram → server.js (路由) → Agent Loop (決策) → Tools (執行) → Telegram。

## 模組職責 (Module Roles)
- `src/agent/`: 核心決策邏輯、工具集定義 (`tools/`，含 shell / write_file / read_file / web_fetch / read_skill / remember / end_session)、Skills 載入、System Prompt (`system-prompt.js`)。
- `src/llm/`: LLM Provider 抽象層，負責請求封裝與錯誤處理。
- `src/utils/`: 基礎設施，包含 JSONL 日誌 (`logger.js`)、Telegram API 封裝、短期記憶 (`session.js`)。
- `src/commands/`: 非 AI 決策的直通指令 (`/run`、`/memory`)。
- `skills/`: 外部注入的靜態能力文件 (`<name>/SKILL.md`)。

## 功能索引 (L2 Groups / L3 Details)

### llm
- [**AI Agent 核心**](./features/llm/agent.md): 決策循環與內建工具 (shell/fetch，shell 支援 cwd 與 followup 多輪；寫檔成功回精簡完成訊息)。
- [**LLM 整合**](./features/llm/llm.md): MiniMax API 參數、Streaming 與 overload retry/backoff 配置。

### tool
- [**直接寫檔**](./features/tool/write-file.md): 以工具寫入長內容檔案，避免 heredoc 與 Telegram 噪音。
- [**直接讀檔**](./features/tool/read-file.md): 以工具讀本地文字檔並回傳含行號內容，支援 offset/limit 分段。
- [**Skills 擴展**](./features/tool/skills.md): 自定義技能的載入與解析規範。

### memory
- [**短期記憶 (Session)**](./features/memory/session-memory.md): 跨輪對話狀態、`remember` / `end_session` 工具、`/memory` 指令。

### chat
- [**輪詢與通訊**](./features/chat/polling.md): Telegram Long Polling 實作細節。
- [**遠端指令 (Direct)**](./features/chat/remote-exec.md): 繞過 Agent 直接執行的 `/run` 邏輯，支援指定 cwd；寫檔類成功時回傳存放位置。
- [**UI/UX 呈現**](./features/chat/ui.md): Telegram typing 指示器與伺服器終端機啟動面板。

### system
- [**部署與環境**](./features/system/deployment.md): 環境變數與全域指令安裝。
- [**日誌系統**](./features/system/log.md): Operation 與 Error 日誌結構。
- [**安全性控管**](./features/system/whitelist.md): 單一用戶白名單鎖定機制。
- [**指令安全守門**](./features/system/safety.md): `setting.json` 黑名單正則過濾危險 shell 指令。

## 概念文件 (Architecture)
- [Agent Loop 策略](./concepts/agent-loop.md): 單輪與多輪任務的執行路徑差異。
- [Session 記憶架構](./concepts/session-memory-design.md): history/locked/summary 雙層設計與 LLM 主動摘要模式。
- [Skill + 外部 CLI 整合斷鏈模式](./concepts/skill-adapter-integration-debug.md): blog-poster 三層連環 bug 的症狀、根因與通用教訓。
- [Telegram 串流回覆斷尾 race](./concepts/telegram-stream-race.md): 從聊天訊息整體流向切入，分析 `createStreamer` flush race 的根因與 Promise chain 修法。
