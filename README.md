# 🕳️ LazyHole-Agent

**「AI Agent 到底是什麼鬼？」——與其看一堆論文，不如直接動手做一個。**

`LazyHole-Agent` 是一個透過實作練習來學習「什麼是 AI Agent」的實驗專案。目前的它功能雖然簡單（就像一個還在試用期的實習生），但未來會慢慢進化。如果你也想透過手機 Telegram 直接控制伺服器、執行指令並搞懂 Agent 的運作邏輯，歡迎一起~~鑽研~~鑽洞。

---

## 🚀 快速啟動

1. **設定環境**：
   參考 `.env.example` 建立並填寫 `.env`（需包含 `TELEGRAM_TOKEN`、`TELEGRAM_ALLOWED_USER_ID` 與 `MINIMAX_API_KEY`）。
   `/music` 預設使用 `music-2.6`，可用 `MINIMAX_MUSIC_MODEL` 調整。
   可用 `AGENT_MAX_ROUNDS` 調整每則訊息的 Agent 互動輪數（預設 `5`）。
   可用 `SESSION_COMPACT_TRIGGER_CHARS` 調整 session 超限壓縮門檻（預設 `12000`）。
   記憶歷史預設寫入 `~/.lazyhole/memory.sqlite`，可用 `MEMORY_DB_PATH` 調整。
   _詳細部署指引見 [docs/system/deployment.md](./docs/features/system/deployment.md)_

2. **安裝與運行**：
   ```bash
   npm install
   npx playwright install chromium  # web_fetch 讀 SPA 網頁用
   npm link  # 建立全域指令
   lazyhole  # 啟動機器人
   ```

---

## 🎮 使用方式

| 指令          | 說明                                                                               |
| :------------ | :--------------------------------------------------------------------------------- |
| **自然語言**  | 直接與 Agent 對話，它會自動決定調用工具或回覆文字。                                |
| `/help` | 顯示目前所有功能入口。 [詳情](./docs/features/chat/help.md) |
| `/run <指令>` | **直通 Shell**。繞過 AI 直接執行指令。 [詳情](./docs/features/chat/remote-exec.md) |
| `/music <描述>` | 先產歌詞再生成 MiniMax `music-2.6` 音樂，回傳歌詞、時長與音檔；支援 `--instrumental`。 [詳情](./docs/features/chat/music.md) |
| `/memory`     | 查看記憶狀態、過期時間與目前會注入 LLM 的記憶；可清除。 [詳情](./docs/features/memory/session-memory.md) |
| `/memory history` | 查看已歸檔的 session 摘要，支援詳情與搜尋。 [詳情](./docs/features/memory/session-memory.md) |
| `/memory help` | 顯示 memory 指令說明。 [詳情](./docs/features/memory/session-memory.md) |

---

## 🛠️ 核心功能 (詳見文檔)

為了保持精簡，具體實作細節請參閱對應文檔：

- 🧠 **Agent 決策循環**：內建工具（Shell、讀寫檔、網頁抓取含 SPA 渲染）的運作邏輯。 [詳見 L2-llm](./docs/features/llm/agent.md)
- 🛡️ **指令安全守門**：如何透過 `setting.json` 攔截危險指令。 [詳見 L2-system](./docs/features/system/safety.md)
- 🔌 **Skills 擴展**：如何為 Agent 注入自定義的領域能力。 [詳見 L2-tool](./docs/features/tool/skills.md)
- 💾 **記憶架構**：Session 原文保留、超限壓縮、SQLite 歷史歸檔與自動過期機制。 [詳見 L2-memory](./docs/features/memory/session-memory.md)

---

## 📂 專案結構

```
server.js              # 入口（Polling、路由）
src/
  agent/               # Agent 決策中樞與 Tools 定義
  commands/            # 直通指令（help / run / memory / music）
  llm/                 # LLM Provider (MiniMax)
  utils/               # 基礎設施（日誌、Telegram、Session）
skills/                # 自定義 Skill 能力集
docs/                  # 分層維護的技術文檔 (L1-L3)
```

_完整的模組職責說明請見 [docs/summary.md](./docs/summary.md)_

---

**⚠️ 提醒**：這是一個實驗性工具，請務必確保白名單僅包含信任的用戶 ID。
