# AI Agent

非 `/run` 開頭的訊息一律進 agent。LLM 自行決定是聊天、呼叫工具、還是讀 skill。

## 工具分類（關鍵設計）

| 類別 | 工具 | 呼叫後行為 |
|------|------|-----------|
| 讀取類 | `read_skill`、`web_fetch` | 結果推回 messages，**繼續下一輪 LLM** |
| 執行類 | `exec_shell` | 結果直接給使用者，**立刻終止** |

詳細原理與 trade-off 見 [../concepts/agent-loop.md](../concepts/agent-loop.md)。

## 流程

1. 組 `messages = [system, user]`。system prompt 含 skills 索引（若 `skills/` 非空）。
2. `tools` 預設含 `exec_shell`、`web_fetch`；`skills/` 非空時再加 `read_skill`。
3. Loop（上限 `MAX_ROUNDS = 5`）：
   - 呼叫 LLM，`reply` 推入 messages
   - `reply.content` 不空 → 發給使用者（`💬 <content>` 或純文字）
   - `tool_calls` 為空 → 結束
   - 依工具類別處理（讀取類推 messages 繼續；執行類發結果並終止）
4. 撞 `MAX_ROUNDS`：**保底總結**——推一則 system 訊息禁止再呼叫工具、用 `tool_choice: 'none'` 再 call 一次 LLM，讓它用現有資料產出文字回覆；回覆前綴 `⚠️ 已達互動上限...`。

## 使用者可見訊息

| 事件 | 格式 |
|------|------|
| LLM 說明 | `💬 <content>` |
| 讀 skill | `📖 讀取 skill: \`<name>\`` |
| 抓網頁 | `🌐 抓取網頁: <url>` |
| 執行指令 | `🔧 執行中: \`<cmd>\`` |
| 執行結果 | `💻 指令執行結果 (\`<cmd>\`):\n\`\`\`<output>\`\`\`` |

## Tools 規格

- `exec_shell({ command })`：timeout 30 秒、輸出上限 3800 字元。`src/agent/tools/shell.js`
- `web_fetch({ url })`：timeout 15 秒、輸出上限 8000 字元、HTML→markdown。`src/agent/tools/web_fetch.js`
- `read_skill({ name })`：讀 `skills/<name>/SKILL.md` body。`src/agent/tools/read_skill.js`

## 模組結構

```
src/agent/
  index.js              # agent 主 loop + 各 tool handler
  skills.js             # skills loader（啟動時快取）
  tools/
    shell.js            # exec_shell
    web_fetch.js        # web_fetch
    read_skill.js       # read_skill
```

## 日誌

每次互動寫入 `log/operation/` JSONL：`user.message`、`llm.request`、`llm.response`、`tool.call`、`tool.result`、`bot.reply`。詳見 [log.md](./log.md)。
