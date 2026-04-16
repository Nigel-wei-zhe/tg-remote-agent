# tg-remote-agent 專案摘要 (L1)

## 專案大綱
本專案是一個輕量級的 Telegram Bot 工具，專注於透過長輪詢模式實現伺服器遠端指令執行。

## 技術棧
- Runtime: Node.js
- API: axios
- Env: dotenv
- UI: chalk, cli-box

## 功能細節 (L2 - 節約 Token 請只讀取感興趣的檔案)
- [遠端指令執行](./features/remote-exec.md)
- [長輪詢機制實作](./features/polling.md)
- [部署與啟動方式](./features/deployment.md)
- [終端機介面美化](./features/ui.md)
- [錯誤日誌](./features/log.md)

## 檔案結構
- server.js: Polling 核心邏輯與 bin 入口。
- package.json: 依賴與 holeOpen 全域命令。
- log/: 依日期分檔的錯誤日誌。
