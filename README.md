# tg-remote-agent

部署在伺服器上的 Telegram AI Agent。你傳自然語言，LLM 判斷是聊天、跑 shell 指令、抓網頁研究、還是使用你定義的 skill，直接在 TG 回覆結果。

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
| 任意自然語言 | 進 AI agent，LLM 自行判斷用哪個工具（`exec_shell` / `web_fetch` / `read_skill`）或純文字回覆 |
| `/run <指令>` | 直通 shell，不經 LLM（除錯／強制執行的逃生口） |

非白名單使用者：靜默 drop，不回任何訊息。

## Agent 工具

| 工具 | 用途 | 執行後 |
|------|------|--------|
| `exec_shell` | 伺服器執行 shell 指令 | 結果直接給使用者，結束 |
| `web_fetch` | 抓網頁（HTML→markdown） | 結果塞回 LLM 繼續下一輪 |
| `read_skill` | 讀 skill 完整說明 | 結果塞回 LLM 繼續下一輪 |

Loop 上限 5 輪。設計原理見 [docs/concepts/agent-loop.md](./docs/concepts/agent-loop.md)。

## Skills（自訂能力）

在 `skills/<name>/SKILL.md` 放自訂能力說明，agent 啟動時載入。LLM 會在 system prompt 看到 skill 名稱與一行描述，需要時呼叫 `read_skill` 讀詳細，再透過 `exec_shell` 執行。詳見 [skills/README.md](./skills/README.md)。

改 skill 後需重啟 `holeOpen`（無熱重載）。

## 專案結構

```
server.js              # 入口（polling、白名單、路由）
src/
  agent/               # AI agent 主邏輯 + tools（shell、web_fetch、read_skill）+ skills loader
  commands/run.js      # /run 直通 shell
  llm/                 # LLM 抽象層與 providers
  utils/               # logger、telegram
skills/                # 自訂能力（每個一個資料夾含 SKILL.md）
docs/                  # L1 summary + L2 features
log/
  error/               # 錯誤日誌（每日一檔）
  operation/           # 操作日誌 JSONL（含 LLM 完整交互）
```

細節見 [docs/summary.md](./docs/summary.md)。
