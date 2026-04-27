# Session Memory（短期記憶）

取代舊 `drafts` 三工具機制。由 server 自動維護對話狀態；LLM 補結構化欄位、結案，並在超限時壓縮摘要。

## 狀態檔

路徑：`~/.lazyhole/sessions/<chatId>.json`（一 chatId 一檔）

```json
{
  "sessionId": "uuid",
  "chatId": 123456,
  "startedAt": "ISO8601",
  "updatedAt": "ISO8601",
  "activeSkill": "blog-poster",
  "history": [ { "role": "user|assistant", "content": "...", "t": "ISO8601" } ],
  "locked": { "title": "...", "body": "..." }
}
```

| 欄位 | 誰寫 | 說明 |
|---|---|---|
| `sessionId` | server | session 唯一識別，歸檔時寫入 SQLite |
| `startedAt` | server | session 建立時間 |
| `updatedAt` | server | 每次寫入更新；超過 `SESSION_IDLE_TTL_MIN`（預設 30）分鐘視為過期 |
| `activeSkill` | server | 偵測到 `read_skill` 呼叫時自動標記 |
| `history` | server | 每則 user/assistant content 原文 append；不逐則截斷，超過 prompt 安全上限時壓縮 |
| `locked` | LLM | 透過 `remember` 工具寫入，淺合併（key 覆蓋） |

預設值由 `src/utils/session.js` 讀取環境變數：`SESSION_IDLE_TTL_MIN=30`、`SESSION_COMPACT_TRIGGER_CHARS=12000`。

## 記憶歷史

路徑：`~/.lazyhole/memory.sqlite`（可用 `MEMORY_DB_PATH` 改路徑）。本地資料庫不進 git。

表：`memory_archives`

| 欄位 | 說明 |
|---|---|
| `id` | 歸檔流水號 |
| `session_id` / `chat_id` / `user_id` | 對應來源 session |
| `started_at` / `ended_at` / `archived_at` | session 時間與歸檔時間 |
| `trigger` | `clear` / `end_session` / `ttl` |
| `active_skill` / `category` | skill 與預留分類；`category` 目前可空 |
| `summary` | LLM 產生的長期記憶摘要 |
| `raw_chars` / `history_count` / `metadata_json` | 原始資料統計與擴充資訊 |

## Server 自動行為

| 時機 | 行為 |
|---|---|
| `handle()` 入口 | 先檢查 TTL；過期則歸檔到 SQLite 並清 session，再 `appendHistory(user)` |
| 組 system prompt | 先檢查 `[對話狀態]` 長度；未超限則注入 activeSkill + locked + history |
| 超過 `SESSION_COMPACT_TRIGGER_CHARS` | 呼叫 LLM 壓縮 session，寫入 `locked.summary`，清空 `history`，再繼續原請求 |
| `read_skill` tool | `markActiveSkill(chatId, name)` |
| 每輪 LLM 回覆含 content | `appendHistory(chatId, 'assistant', content)`（含 force summary 的最終回覆） |
| `end_session` tool | 先歸檔到 SQLite，再 `clearSession(chatId)` |

## Tools（LLM 側）

| 工具 | 參數 | 用途 |
|---|---|---|
| `remember` | `{ fields: object }` | 淺合併寫入 `locked`；`summary` 為特殊欄位，見下 |
| `end_session` | `{}` | 歸檔並清 session；任務完成或用戶明確取消時呼叫 |

### summary 欄位

`locked.summary` 是保留的語意摘要欄位，來源有二：

- LLM 在階段性節點主動呼叫 `remember` 寫入。
- server 在 session prompt 超過安全上限時呼叫 LLM 壓縮寫入。

```js
remember({ summary: "用戶確認主題為 X，大綱已審，待撰正文" })
```

`renderSessionPrompt` 遇到 `summary` 時優先顯示，`history` 退為「補充參考」。設計細節見 [concepts/session-memory-design.md](../../concepts/session-memory-design.md)。

實作：`src/agent/tools/remember.js`、`src/agent/tools/end_session.js`、`src/utils/session-prompt.js`。

## 使用者可見流程

| 事件 | 格式 |
|---|---|
| 鎖定欄位 | `🧠 鎖定欄位: <keys>` |
| `/memory` | 回傳 session 狀態、預計過期時間、壓縮狀態、locked/history 概況、目前會注入 LLM 的記憶區塊 |
| `/memory clear` | 先歸檔再清除當前 session |
| `/memory clear --drop` | 不歸檔，直接清除當前 session |
| `/memory history` | 列出最近 10 筆歸檔摘要 |
| `/memory history <id>` | 查看單筆完整摘要 |
| `/memory history search <關鍵字>` | 搜尋摘要 |

## 歸檔進度訊息

TTL、`/memory clear`、`end_session` 觸發歸檔時會先回 Telegram 進度，避免 LLM 摘要期間看起來像卡住。

| 階段 | 訊息 |
|---|---|
| TTL 命中 | `先前 session 已過期，正在整理成記憶摘要。` |
| 摘要中 | `正在請 LLM 摘要目前 session...` |
| 寫入中 | `摘要完成，正在寫入記憶歷史。` |
| 完成 | `記憶已歸檔 #<id>。` |
| 失敗 | `記憶歸檔失敗，已保留原 session。` |

## /memory 指令

直通指令，不進 agent。實作：`src/commands/memory.js`，路由於 `server.js`，記憶區塊由 `src/utils/session-prompt.js` 產生。

回覆內容：

- `狀態`: session 是否有效。
- `預計過期`: `updatedAt + SESSION_IDLE_TTL_MIN`，以相對時間顯示。
- `壓縮狀態`: 目前 `[對話狀態]` 字數 / `SESSION_COMPACT_TRIGGER_CHARS`；超限時提示下一次自然語言訊息會先壓縮。
- `activeSkill` / `locked` / `history`: 記憶概況。
- `目前會送進 LLM 的記憶`: 與 agent 共用 `renderSessionPrompt`；未超限時完整顯示，超限時顯示安全上限內預覽並提示下輪會先壓縮。

歷史查詢：

- `src/utils/memory-db.js`: SQLite schema、insert/list/detail/search。
- `src/utils/session-archive.js`: 以 LLM 產生歸檔摘要，寫入 SQLite。
- TTL 歸檔失敗時，原 session 會保留到 `~/.lazyhole/sessions/archive_failed/`，避免資料消失。

## 設計取捨

| 取捨 | 選擇 | 理由 |
|---|---|---|
| history 全量 vs 逐則截斷 | 全量直到安全上限 | 避免 500 字截斷破壞語意 |
| 超限處理 | LLM 壓縮成 `summary` | 保留語意，控制 prompt |
| 歷史保存 | SQLite 本地歸檔 | 可查詢、不進 git、避免 active session 無限保存 |
| 分類 | `category` nullable | 先保留欄位，不依賴不穩定分類 |
| locked schema | 自由 object、淺合併 | 跨 skill 通用，不預設欄位 |
| 背景清理 | 無 | 懶式清理足夠，少一支常駐 timer |
| 路徑安全 | `chatId` 必為 `^-?\d+$` | 防路徑穿越 |

## 與舊 drafts 的差異

| 面向 | 舊（drafts） | 新（session） |
|---|---|---|
| Tool 數 | 3（save/load/clear_draft） | 2（remember/end_session） |
| 寫入時機 | LLM 自覺 | Server 自動 + LLM 補鎖定 |
| 讀取成本 | LLM 主動 load（吃 1 輪） | System prompt 注入（0 輪） |
| TTL | 24h | idle 過期（預設 30 分，可調） |
| 檢視 | 翻 `~/.lazyhole/drafts/*.json` | `/memory` 指令 |
