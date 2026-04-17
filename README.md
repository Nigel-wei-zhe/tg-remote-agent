# tg-remote-agent

部署在伺服器上的 Telegram AI Agent。你傳自然語言，LLM 判斷需不需要執行 shell 指令；必要時直接幫你跑並回傳結果。

## 安裝

```bash
npm install -g .
```

## 設定

複製 `.env.example` 為 `.env` 並填入：

```env
TELEGRAM_TOKEN=your_telegram_bot_token
TELEGRAM_ALLOWED_USER_ID=your_telegram_user_id   # 白名單，僅此 ID 可對話
MINIMAX_API_KEY=your_minimax_api_key
MINIMAX_MODEL=MiniMax-M2.7   # 可選
LLM_PROVIDER=minimax          # 可選
```

缺 `TELEGRAM_TOKEN` 或 `TELEGRAM_ALLOWED_USER_ID` 會直接退出。

## 啟動

```bash
holeOpen
```

## 使用方式

| 輸入 | 行為 |
|------|------|
| 任意自然語言 | 進 AI agent，LLM 自行判斷是否呼叫 `exec_shell` 工具 |
| `/run <指令>` | 直通 shell，不經 LLM（除錯／強制執行的逃生口） |

非白名單使用者：靜默 drop，不回任何訊息。

## 專案結構

```
server.js              # 入口（polling、白名單、路由）
src/
  agent/               # AI agent 主邏輯 + tools（shell）
  commands/run.js      # /run 直通 shell
  llm/                 # LLM 抽象層與 providers
  utils/               # logger、telegram
docs/                  # L1 summary + L2 features
log/
  error/               # 錯誤日誌（每日一檔）
  operation/           # 操作日誌 JSONL（含 LLM 完整交互）
```

細節見 [docs/summary.md](./docs/summary.md)。
