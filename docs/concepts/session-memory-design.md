# Session 記憶架構：雙層設計與 summary 模式

## 兩層記憶

| 層 | 欄位 | 誰維護 | 特性 |
|---|---|---|---|
| 自動層 | `history` | server | 每輪原文自動 append，最多 N 則，到頂截斷最舊的 |
| 主動層 | `locked` | LLM | LLM 呼叫 `remember` 寫入，完整保留直到 `end_session` |

兩層都注入 system prompt 的 `[對話狀態]` 區塊，但顯示優先級不同。

---

## history 的限制

`history` 是「最近 N 則原文的滑動視窗」。對短對話夠用，但有兩個問題：

1. **語意密度低**：原文包含客套話、確認語氣、中間試探，真正有用的資訊佔比小
2. **視窗有限**：超過 `SESSION_HISTORY_MAX`（預設 6）就丟失最舊的輪次，長 skill 流程容易失憶

---

## summary 欄位：LLM 主動壓縮語意

LLM 可透過 `remember` 把一段自然語言摘要寫入 `locked.summary`：

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

不需要每輪都寫，額外 `remember` 呼叫有成本（多一輪 LLM）。適合在**階段性節點**寫入：

| 情境 | 範例 |
|---|---|
| 完成一個審核階段 | `summary: "主題與大綱已確認，進入撰寫階段"` |
| 用戶提供重要前提 | `summary: "用戶指定風格為技術向、目標讀者為工程師"` |
| 多步驟 skill 的中繼點 | `summary: "step 1/3 完成，目前在等用戶確認草稿"` |

簡單對話（單輪查詢、聊天）不需要 summary，history 足夠。

---

## 與 history 的分工

```
history  = 「我最近說了什麼」（server 自動，廣度，短記憶）
summary  = 「這個任務進行到哪了」（LLM 主動，深度，語意壓縮）
locked   = 「用戶已確認的最終原文」（LLM 主動，精確，結構化）
```

三者互補，LLM 只需在適當節點主動寫 summary，其餘由 server 自動維護。

---

## 設計取捨

| 取捨 | 選擇 | 理由 |
|---|---|---|
| 自動摘要 vs 按需摘要 | 按需（LLM 主動呼叫） | 自動摘要每輪多一次 LLM call，成本高；簡單查詢根本不需要 |
| 取代 history vs 並存 | 並存 | history 保底最近原文，summary 補語意；兩者互補 |
| 獨立 tool vs 沿用 remember | 沿用 remember | `summary` 就是 `locked` 的一個欄位，不需要新工具 |
