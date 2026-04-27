# Session 記憶架構：雙層設計與 summary 模式

## 兩層記憶

| 層 | 欄位 | 誰維護 | 特性 |
|---|---|---|---|
| 自動層 | `history` | server | 每輪原文自動 append，不逐則截斷 |
| 主動層 | `locked` | LLM / server | `remember` 寫入；超限壓縮寫入 `summary` |

兩層都注入 system prompt 的 `[對話狀態]` 區塊，但顯示優先級不同。

---

## history 的限制與保護

`history` 是「當前 session 原始對話」。它不做 500 字之類的逐則截斷，避免截掉限制條件、錯誤訊息尾端或用戶最後修正。

保護機制：

1. `SESSION_IDLE_TTL_MIN` 控制閒置過期，預設 30 分鐘。
2. `SESSION_COMPACT_TRIGGER_CHARS` 控制 prompt 安全上限，預設 12000 字元。
3. 超限時 server 先呼叫 LLM 壓縮 session，將結果寫入 `locked.summary`，清空 `history`，再繼續原請求。
4. session 結束或 TTL 過期時，server 呼叫 LLM 產生長期摘要，寫入 SQLite 歷史。

---

## summary 欄位：語意壓縮

`locked.summary` 可由 LLM 主動寫入，也可由 server 超限壓縮寫入：

```js
remember({ summary: "用戶確認主題為 AI 記憶，大綱已審核通過，待撰寫正文第一節" })
```

`renderSessionPrompt` 遇到 `summary` 時：
- **summary 優先顯示**，置於所有 locked 欄位之前
- **history 退為「補充參考」**，標籤從「最近對話」改為「最近原始對話 (補充參考)」

系統 prompt 中的排列：
```
[對話狀態]
當前進行中的 skill: blog-poster
任務摘要 (summary): 用戶確認主題為 AI 記憶，大綱已審核通過，待撰寫正文第一節
已鎖定欄位 (locked):
  title: AI 如何記憶？
最近原始對話 (補充參考，舊→新):
  user: 好，標題就用這個
  assistant: 好的，已鎖定標題...
```

---

## 何時寫 summary

不需要每輪都手動寫，額外 `remember` 呼叫有成本（多一輪 LLM）。適合在**階段性節點**主動寫入；若忘了寫，server 超限時會自動壓縮：

| 情境 | 範例 |
|---|---|
| 完成一個審核階段 | `summary: "主題與大綱已確認，進入撰寫階段"` |
| 用戶提供重要前提 | `summary: "用戶指定風格為技術向、目標讀者為工程師"` |
| 多步驟 skill 的中繼點 | `summary: "step 1/3 完成，目前在等用戶確認草稿"` |

簡單對話（單輪查詢、聊天）不需要 summary，history 足夠。

---

## 與 history 的分工

```
history  = 「目前 session 原文」（server 自動，完整，直到安全上限）
summary  = 「這個任務進行到哪了」（LLM 主動或超限壓縮，語意壓縮）
locked   = 「用戶已確認的最終原文」（LLM 主動，精確，結構化）
archive  = 「已結束任務摘要」（LLM 產生，SQLite 保存，可查詢）
```

三者互補，LLM 只需在適當節點主動寫 summary，其餘由 server 自動維護。

---

## 設計取捨

| 取捨 | 選擇 | 理由 |
|---|---|---|
| 自動摘要 vs 超限摘要 | 超限才壓縮 | 平常保留原文；只在 prompt 風險出現時多一次 LLM call |
| active vs history | active 用 JSON、history 用 SQLite | active 易讀易覆寫；history 可列表、詳情、搜尋 |
| 取代 history vs 並存 | 並存 | history 保底最近原文，summary 補語意；兩者互補 |
| 獨立 tool vs 沿用 remember | 沿用 remember | `summary` 就是 `locked` 的一個欄位，不需要新工具 |
