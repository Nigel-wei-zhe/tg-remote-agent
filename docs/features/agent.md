# AI Agent

## 流程
1. 非 `/run` 開頭訊息進入 agent。
2. 組 `messages = [system, user]`，system prompt 含 skills 索引（若有）；tools 含 `exec_shell`，若有 skills 再加 `read_skill`。
3. 進入 agent loop（上限 `MAX_ROUNDS = 5`）：
   - 呼叫 LLM，取 `reply`（推入 messages）
   - `content` 不空 → 發給使用者（`💬 <content>` 或純文字）
   - `tool_calls` 為空 → 結束
   - `read_skill`：發 `📖 讀取 skill: <name>`、body 以 `role: tool` 推回 messages、**繼續下一輪**
   - `exec_shell`：發 `🔧 執行中: <cmd>`、跑完發結果、**立刻終止**（Option A 快速路徑）
4. 超過 `MAX_ROUNDS` 回覆中止訊息。

## 設計決策
- **混合策略**：read_skill 允許多輪（skill 需漸進揭露），exec_shell 單輪終止（保持低延遲）。
- 工具執行後 exec_shell 不再 call LLM 總結，原始輸出直接給 user。

## 設計決策
- **Option A（raw output）**：工具執行後不再 call LLM，減少延遲與 token 成本。
- **單輪工具呼叫**：目前每則訊息最多一輪 LLM + N 個 tool call。不遞迴重新詢問 LLM。

## System Prompt
要求 LLM 在需要伺服器狀態時呼叫 `exec_shell`，其他情況純文字回覆，繁體中文。

## Tools
- `exec_shell({ command })`：執行 shell，timeout 30 秒、輸出上限 3800 字元。`src/agent/tools/shell.js`
- `read_skill({ name })`：讀取 skill 詳細說明，只在 `skills/` 非空時註冊。`src/agent/tools/read_skill.js`

## 模組結構
```
src/agent/
  index.js              # agent 主邏輯、loop
  skills.js             # skills loader（啟動時快取）
  tools/
    shell.js            # exec_shell
    read_skill.js       # read_skill
```

## 日誌
每次互動寫入 `log/operation/` JSONL：`user.message`、`llm.request`、`llm.response`、`tool.call`、`tool.result`、`bot.reply`。詳見 [log.md](./log.md)。
