# AI Agent

## 流程
1. 非 `/run` 開頭訊息進入 agent。
2. 組 `messages = [system, user]`，附 `tools = [exec_shell]`，呼叫 LLM。
3. 依回傳分步發訊息給使用者（每步都可見）：
   - 有 `content` 先發 → `💬 <content>`（若同時有 tool_call）或直接送純文字
   - 每個 tool_call 執行前先發 → `🔧 執行中: \`<cmd>\``
   - 工具跑完 → `💻 指令執行結果 (\`<cmd>\`):\n\`\`\`<output>\`\`\``
4. 工具執行後 **不** 再次 call LLM（Option A）。

## 設計決策
- **Option A（raw output）**：工具執行後不再 call LLM，減少延遲與 token 成本。
- **單輪工具呼叫**：目前每則訊息最多一輪 LLM + N 個 tool call。不遞迴重新詢問 LLM。

## System Prompt
要求 LLM 在需要伺服器狀態時呼叫 `exec_shell`，其他情況純文字回覆，繁體中文。

## Shell 工具
- `name`: `exec_shell`
- `parameters`: `{ command: string }`
- timeout 30 秒，輸出上限 3800 字元（超出截斷）。
- 實作：`src/agent/tools/shell.js`

## 模組結構
```
src/agent/
  index.js        # agent 主邏輯
  tools/
    shell.js      # exec_shell tool 定義 + 執行
```

## 日誌
每次互動寫入 `log/operation/` JSONL：`user.message`、`llm.request`、`llm.response`、`tool.call`、`tool.result`、`bot.reply`。詳見 [log.md](./log.md)。
