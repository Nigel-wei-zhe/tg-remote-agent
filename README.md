# LazyHole-Agent

極簡、無記憶、隨插即用的 Telegram AI Agent。

不同於複雜的 Agent 框架，**LazyHole** 專為「懶」而設計：無須配置資料庫、沒有複雜的長期記憶，只專注於即時透過 Telegram 控制伺服器、執行 Shell 指令與網頁研究。

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
lazyhole
```

啟動後終端會顯示 `LazyHole-Agent` 品牌化面板，列出 `Polling`、模式、白名單 ID、CLI 指令與離開快捷鍵，事件流會接在面板下方輸出。

## 使用方式

| 輸入 | 行為 |
|------|------|
| 任意自然語言 | 進 AI agent，LLM 自行判斷用哪個工具（`exec_shell` / `web_fetch` / `read_skill` / `remember` / `end_session`）或純文字回覆 |
| `/run <指令>` | 直通 shell，不經 LLM（除錯／強制執行的逃生口） |
| `/run --cwd <路徑> -- <指令>` | 在指定工作目錄執行直通 shell；`<路徑>` 含空白時請加引號 |
| `/memory` | 顯示當前 chatId 的短期記憶 session JSON；`/memory clear` 清除 |

非白名單使用者：靜默 drop，不回任何訊息。

`exec_shell` 與 `/run` 都支援可選工作目錄 `cwd`。未提供時，會沿用啟動 `lazyhole` 的那個終端機當下所在目錄。

## 指令安全守門

專案根目錄 `setting.json` 定義危險指令黑名單，`/run` 與 `exec_shell` 執行前都會過濾，命中即拒絕並回覆原因。

```json
{
  "shell": {
    "blocklist": {
      "enabled": true,
      "patterns": [
        { "pattern": "\\b(shutdown|reboot|halt|poweroff)\\b", "reason": "系統關機或重啟" }
      ]
    }
  }
}
```

修改後需重啟 `lazyhole` 生效。細節見 [docs/features/safety.md](./docs/features/safety.md)。

## Agent 工具

| 工具 | 用途 | 執行後 |
|------|------|--------|
| `exec_shell` | 伺服器執行 shell 指令，可選 `cwd` | 結果直接給使用者，結束 |
| `web_fetch` | 抓網頁（HTML→markdown） | 結果塞回 LLM 繼續下一輪 |
| `read_skill` | 讀 skill 完整說明 | 結果塞回 LLM 繼續下一輪 |
| `remember` | 鎖定結構化欄位到 session.locked（多階段 skill 用） | 結果塞回 LLM 繼續下一輪 |
| `end_session` | 任務完成或取消時清空 session | 結果塞回 LLM 繼續下一輪 |

短期記憶（session）：server 自動記錄最近對話、`read_skill` 自動標記進行中 skill、30 分鐘 idle 自動過期。細節見 [docs/features/session-memory.md](./docs/features/session-memory.md)。

Loop 上限 5 輪。設計原理見 [docs/concepts/agent-loop.md](./docs/concepts/agent-loop.md)。

## Skills（自訂能力）

在 `skills/<name>/SKILL.md` 放自訂能力說明，agent 啟動時載入。LLM 會在 system prompt 看到 skill 名稱與一行描述，需要時呼叫 `read_skill` 讀詳細，再透過 `exec_shell` 執行。詳見 [skills/README.md](./skills/README.md)。

改 skill 後需重啟 `lazyhole`（無熱重載）。

## 專案結構

```
server.js              # 入口（polling、白名單、路由）
src/
  agent/               # AI agent 主邏輯 + tools（shell、web_fetch、read_skill、remember、end_session）+ skills loader
  commands/            # /run 直通 shell、/memory 檢視短期記憶
  llm/                 # LLM 抽象層與 providers
  utils/               # logger、telegram、session（短期記憶）
skills/                # 自訂能力（每個一個資料夾含 SKILL.md）
docs/                  # L1 summary + L2 features
log/
  error/               # 錯誤日誌（每日一檔）
  operation/           # 操作日誌 JSONL（含 LLM 完整交互）
```

細節見 [docs/summary.md](./docs/summary.md)。
