# Session Memory（短期記憶）

取代舊 `drafts` 三工具機制。由 server 自動維護對話狀態，LLM 只補結構化欄位與結案。

## 狀態檔

路徑：`~/.lazyhole/sessions/<chatId>.json`（一 chatId 一檔）

```json
{
  "chatId": 123456,
  "updatedAt": "ISO8601",
  "activeSkill": "blog-poster",
  "history": [ { "role": "user|assistant", "content": "...", "t": "ISO8601" } ],
  "locked": { "title": "...", "body": "..." }
}
```

| 欄位 | 誰寫 | 說明 |
|---|---|---|
| `updatedAt` | server | 每次寫入更新；超過 `SESSION_IDLE_TTL_MIN`（預設 30）分鐘視為過期 |
| `activeSkill` | server | 偵測到 `read_skill` 呼叫時自動標記 |
| `history` | server | 每則 user/assistant content 自動 append；最多 `SESSION_HISTORY_MAX`（預設 6）則，每則截 `SESSION_CONTENT_MAX_CHARS`（預設 500）字 |
| `locked` | LLM | 透過 `remember` 工具寫入，淺合併（key 覆蓋） |

預設值由 `src/utils/session.js` 讀取環境變數：`SESSION_IDLE_TTL_MIN=30`、`SESSION_HISTORY_MAX=6`、`SESSION_CONTENT_MAX_CHARS=500`。

## Server 自動行為

| 時機 | 行為 |
|---|---|
| `handle()` 入口 | `loadSession`（過期則懶式刪檔）、`appendHistory(user)` |
| 組 system prompt | 注入 `[對話狀態]` 區塊（activeSkill + locked + history） |
| `read_skill` tool | `markActiveSkill(chatId, name)` |
| 每輪 LLM 回覆含 content | `appendHistory(chatId, 'assistant', content)`（含 force summary 的最終回覆） |
| `end_session` tool | `clearSession(chatId)` |

## Tools（LLM 側）

| 工具 | 參數 | 用途 |
|---|---|---|
| `remember` | `{ fields: object }` | 淺合併寫入 `locked`；`summary` 為特殊欄位，見下 |
| `end_session` | `{}` | 清 session；任務完成或用戶明確取消時呼叫 |

### summary 欄位

`locked.summary` 是保留的語意摘要欄位，由 LLM 在階段性節點寫入：

```js
remember({ summary: "用戶確認主題為 X，大綱已審，待撰正文" })
```

`renderSessionPrompt` 遇到 `summary` 時優先顯示，`history` 退為「補充參考」。適合長 skill 流程在關鍵節點壓縮語意，簡單對話不需要。設計細節見 [concepts/session-memory-design.md](../../concepts/session-memory-design.md)。

實作：`src/agent/tools/remember.js`、`src/agent/tools/end_session.js`。

## 使用者可見流程

| 事件 | 格式 |
|---|---|
| 鎖定欄位 | `🧠 鎖定欄位: <keys>` |
| `/memory` | 回傳當前 session JSON（Markdown code block） |
| `/memory clear` | 手動清除當前 session |

## /memory 指令

直通指令，不進 agent。實作：`src/commands/memory.js`，路由於 `server.js`。

## 設計取捨

| 取捨 | 選擇 | 理由 |
|---|---|---|
| history 全量 vs 截斷 | 截斷（N=6、每則 500 字） | 控 token；鎖定原文交給 `locked` |
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
