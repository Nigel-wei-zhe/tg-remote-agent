# LazyHole-Agent 專案摘要 (L1)

## 核心入口 (Entry Points)
- **啟動入口**: `server.js` (負責 Telegram Polling、白名單過濾、指令路由)。
- **邏輯入口**: `src/agent/index.js` (負責 LLM 多輪對話決策與工具呼叫)。

## 技術設計 (Tech Design)
- **核心理念**: 極簡無狀態、無記憶、基於指令執行的 Telegram AI Agent。
- **關鍵依賴**: 使用 MiniMax (chatcompletion_v2) 作為大腦，Telegram Long Polling 作為感官。
- **數據流**: Telegram → server.js (路由) → Agent Loop (決策) → Tools (執行) → Telegram。

## 模組職責 (Module Roles)
- `src/agent/`: 核心決策邏輯、工具集定義 (`tools/`)、Skills 載入。
- `src/llm/`: LLM Provider 抽象層，負責請求封裝與錯誤處理。
- `src/utils/`: 基礎設施，包含 JSONL 日誌 (`logger.js`) 與 Telegram API 封裝。
- `src/commands/`: 非 AI 決策的直通指令 (如 `/run`)。
- `skills/`: 外部注入的靜態能力文件 (`<name>/SKILL.md`)。

## 功能索引 (L2 Details)
- [**AI Agent 核心**](./features/agent.md): 決策循環與內建工具 (shell/fetch)。
- [**Skills 擴展**](./features/skills.md): 自定義技能的載入與解析規範。
- [**遠端指令 (Direct)**](./features/remote-exec.md): 繞過 Agent 直接執行的 `/run` 邏輯。
- [**輪詢與通訊**](./features/polling.md): Telegram Long Polling 實作細節。
- [**部署與環境**](./features/deployment.md): 環境變數與全域指令安裝。
- [**UI/UX 呈現**](./features/ui.md): 伺服器終端機輸出美化。
- [**日誌系統**](./features/log.md): Operation 與 Error 日誌結構。
- [**LLM 整合**](./features/llm.md): MiniMax API 參數與 Provider 配置。
- [**安全性控管**](./features/whitelist.md): 單一用戶白名單鎖定機制。

## 概念文件 (Architecture)
- [Agent Loop 策略](./concepts/agent-loop.md): 單輪與多輪任務的執行路徑差異。
