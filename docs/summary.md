# tg-remote-agent 專案摘要 (L1)

## 專案大綱
輕量級 Telegram AI Agent。LLM 依使用者訊息自行判斷是否呼叫 shell 工具執行指令，透過長輪詢回覆。

## 技術棧
- Runtime: Node.js
- API: axios
- Env: dotenv
- UI: chalk, cli-box
- LLM: MiniMax API (chatcompletion_v2, tool use)

## 功能細節 (L2 - 節約 Token 請只讀取感興趣的檔案)
- [AI Agent 與 Shell 工具](./features/agent.md)
- [遠端指令執行 /run 直通](./features/remote-exec.md)
- [長輪詢機制實作](./features/polling.md)
- [部署與啟動方式](./features/deployment.md)
- [終端機介面美化](./features/ui.md)
- [日誌（error + operation）](./features/log.md)
- [LLM 整合 (MiniMax)](./features/llm.md)
- [白名單 (單一 TG user id)](./features/whitelist.md)

## 檔案結構
- server.js: Polling、白名單守門、路由（/run 直通 + 其餘進 agent）。
- src/agent/: Agent 主邏輯與 tools（shell）。
- src/commands/run.js: /run 直通 shell（不經 LLM）。
- src/llm/: LLM 抽象層與 providers。
- src/utils/: logger（error + operation JSONL）、telegram。
- package.json: 依賴與 holeOpen 全域命令。
- log/error/: 錯誤日誌（每日一檔）。
- log/operation/: 操作日誌 JSONL（用戶訊息、LLM 請求/回應、tool 呼叫、回傳內容）。
