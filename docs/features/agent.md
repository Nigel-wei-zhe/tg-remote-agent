# AI Agent

非 `/run`、`/memory` 開頭的訊息一律進 agent。LLM 自行決定是聊天、呼叫工具、還是讀 skill。

## 工具分類（關鍵設計）

| 類別 | 工具 | 呼叫後行為 |
|------|------|-----------|
| 讀取/寫入類 | `read_skill`、`web_fetch`、`remember`、`end_session`、`write_file` | 結果推回 messages，**繼續下一輪 LLM** |
| 執行類 | `exec_shell` | 結果直接給使用者，**立刻終止** |

詳細原理與 trade-off 見 [../concepts/agent-loop.md](../concepts/agent-loop.md)。

## 流程

1. 入口 `appendHistory(chatId, 'user', text)` → `loadSession`（過期懶清）。
2. 組 `messages = [system, user]`。system prompt 含三段：基礎指引 + skills 索引（`skills/` 非空時）+ `[對話狀態]` 區塊（session 存在時，含 `activeSkill` / `locked` / 最近 history）。
3. `tools` 預設含 `exec_shell`、`write_file`、`web_fetch`、`remember`、`end_session`；`skills/` 非空再加 `read_skill`。
4. Loop（上限 `MAX_ROUNDS = 5`）：
   - 呼叫 LLM，`reply` 推入 messages
   - `reply.content` 不空 → 發給使用者（`💬 <content>` 或純文字）並 `appendHistory('assistant', content)`
   - `tool_calls` 為空 → 結束
   - 依工具類別處理（讀取類推 messages 繼續；執行類發結果並終止）
   - `read_skill` 成功 → 自動 `markActiveSkill`
5. 撞 `MAX_ROUNDS`：**保底總結**——推一則 system 訊息禁止再呼叫工具、用 `tool_choice: 'none'` 再 call 一次 LLM，讓它用現有資料產出文字回覆；回覆前綴 `⚠️ 已達互動上限...`，並 append 到 history。

## 使用者可見訊息

| 事件 | 格式 |
|------|------|
| LLM 說明 | `💬 <content>` |
| 讀 skill | `📖 讀取 skill: \`<name>\`` |
| 抓網頁 | `🌐 抓取網頁: <url>` |
| 鎖定欄位 | `🧠 鎖定欄位: <keys>` |
| 寫入檔案 | `📝 寫入檔案: \`<path>\``；若指定目錄，下一行附 `📁 cwd: \`<path>\`` |
| 執行指令 | `🔧 執行中: \`<cmd>\``；若指定目錄，下一行附 `📁 cwd: \`<path>\`` |
| 執行結果 | 查詢型指令回傳 code block；寫檔類成功時改回 `✅ 任務完成` + 檔案/目錄，提示去存放位置查看 |

## Tools 規格

- `exec_shell({ command, cwd? })`：timeout 30 秒、輸出上限 3800 字元；`cwd` 未提供時沿用 `lazyhole` 啟動目錄。`src/agent/tools/shell.js`
- `write_file({ path, content, cwd? })`：直接寫文字檔，自動建立父目錄；`cwd` 未提供時沿用 `lazyhole` 啟動目錄。`src/agent/tools/write_file.js`
- `web_fetch({ url })`：timeout 15 秒、輸出上限 8000 字元、HTML→markdown。`src/agent/tools/web_fetch.js`
- `read_skill({ name })`：讀 `skills/<name>/SKILL.md` body；成功時 server 自動 `markActiveSkill`。`src/agent/tools/read_skill.js`
- `remember({ fields })`：淺合併寫入 `session.locked`。`src/agent/tools/remember.js`
- `end_session()`：清除 session；任務完成或用戶取消時呼叫。`src/agent/tools/end_session.js`

短期記憶底層：`src/utils/session.js`，詳見 [session-memory.md](./session-memory.md)。

## 模組結構

```
src/agent/
  index.js              # agent 主 loop + 各 tool handler + renderSessionPrompt
  skills.js             # skills loader（啟動時快取）
  tools/
    shell.js            # exec_shell
    write_file.js       # write_file
    web_fetch.js        # web_fetch
    read_skill.js       # read_skill
    remember.js         # remember（寫入 session.locked）
    end_session.js      # end_session（清除 session）
```

## 日誌

每次互動寫入 `log/operation/` JSONL：`user.message`、`llm.request`、`llm.response`、`tool.call`、`tool.result`、`bot.reply`。詳見 [log.md](./log.md)。
