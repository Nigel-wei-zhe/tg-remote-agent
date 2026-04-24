# AI Agent

非 `/run`、`/memory` 開頭的訊息一律進 agent。LLM 自行決定是聊天、呼叫工具、還是讀 skill。

## 工具分類（關鍵設計）

| 類別 | 工具 | 呼叫後行為 |
|------|------|-----------|
| 讀取/寫入類 | `read_skill`、`web_fetch`、`remember`、`end_session`、`write_file`、`read_file` | 結果推回 messages，**繼續下一輪 LLM** |
| 執行類 | `exec_shell`（預設） | Telegram 只顯示簡短進度，完整結果推回 messages，**繼續下一輪 LLM** |
| 執行類 final | `exec_shell({ final: true })` | 成功且同輪無其他 tool 結果待消化時，完整結果給使用者並結束 |

詳細原理與 trade-off 見 [../../concepts/agent-loop.md](../../concepts/agent-loop.md)。

## 流程

1. 入口 `appendHistory(chatId, 'user', text)` → `loadSession`（過期懶清）。
2. 組 `messages = [system, user]`。system prompt 含三段：基礎指引 + skills 索引（`skills/` 非空時）+ `[對話狀態]` 區塊（session 存在時，含 `activeSkill` / `locked` / 最近 history）。
   system prompt 明確標示本專案是 Node.js/CommonJS，查核心邏輯優先看 `server.js`、`package.json`、`src/**/*.js`、`docs/summary.md`。
   回覆含程式碼時要求使用 Markdown fenced code block 並標註語言，Telegram finalize 會轉成 HTML code block。
3. `tools` 預設含 `exec_shell`、`write_file`、`read_file`、`web_fetch`、`remember`、`end_session`；`skills/` 非空再加 `read_skill`。
4. Loop（上限 `AGENT_MAX_ROUNDS`，預設 `5`）：
   - 呼叫 LLM，`reply` 推入 messages
   - `reply.content` 不空 → 發給使用者（`💬 <content>` 或純文字）並 `appendHistory('assistant', content)`
   - `tool_calls` 為空 → 結束
   - 依工具類別處理（讀取類推 messages 繼續；`exec_shell` 預設推回 messages 續跑；`final:true` 成功且可終止時才發完整結果並結束）
   - `read_skill` 成功 → 自動 `markActiveSkill`
5. 撞上限：**保底總結**——推一則 system 訊息禁止再呼叫工具、用 `tool_choice: 'none'` 再 call 一次 LLM，讓它用現有資料產出文字回覆；回覆前綴 `⚠️ 已達互動上限...`，並 append 到 history。

## 使用者可見訊息

| 事件 | 格式 |
|------|------|
| LLM 說明 | `💬 <content>` |
| 讀 skill | `📖 讀取 skill: \`<name>\`` |
| 抓網頁 | `🌐 抓取網頁: <url>` |
| 鎖定欄位 | `🧠 鎖定欄位: <keys>` |
| 寫入檔案 | `📝 寫入檔案: \`<path>\``；若指定目錄，下一行附 `📁 cwd: \`<path>\`` |
| 讀取檔案 | `📄 讀取檔案: \`<path>\`` 可附 `(offset=.., limit=..)`；若指定目錄，下一行附 `📁 cwd: \`<path>\`` |
| 執行指令 | 預設依判斷顯示 `🔎 查閱中` / `🛠️ 處理中` / `🔧 執行中`；`final:true` 顯示 `🔧 執行中`；若指定目錄，下一行附 `📁 cwd: \`<path>\`` |
| 執行結果 | 預設只回簡短 ack，完整 stdout/stderr 只給 LLM；`final:true` 成功且可終止時才回傳 code block 或寫檔成功摘要 |

## Tools 規格

- `exec_shell({ command, cwd?, final? })`：timeout 30 秒、輸出上限 3800 字元；`cwd` 未提供時沿用 `lazyhole` 啟動目錄；預設作為中間步驟，Telegram 只顯示簡短進度/ack，完整結果推回 messages 並續跑下一輪；`final:true` 表示成功結果就是最終答案，可直接呈現並結束；失敗、搜尋型空輸出、或同輪仍有其他 tool 結果待消化時會續跑。`src/agent/tools/shell.js`
- `write_file({ path, content, cwd? })`：直接寫文字檔，自動建立父目錄；`cwd` 未提供時沿用 `lazyhole` 啟動目錄。`src/agent/tools/write_file.js`
- `read_file({ path, cwd?, offset?, limit? })`：讀文字檔，回傳含行號內容；預設 limit 500 行、輸出 20KB 上限（`READ_FILE_MAX_BYTES`）；拒絕二進位與目錄。`src/agent/tools/read_file.js`
- `web_fetch({ url, render? })`：輸出上限 8000 字元、HTML→markdown。`render` 可為 `auto`（預設）、`static`、`browser`；`auto` 先用 axios 靜態抓取，疑似 SPA 空殼時改用 Playwright Chromium 渲染。靜態 timeout 15 秒，瀏覽器 timeout 20 秒。`src/agent/tools/web_fetch.js`
- `read_skill({ name })`：讀 `skills/<name>/SKILL.md` body；成功時 server 自動 `markActiveSkill`。`src/agent/tools/read_skill.js`
- `remember({ fields })`：淺合併寫入 `session.locked`。`src/agent/tools/remember.js`
- `end_session()`：清除 session；任務完成或用戶取消時呼叫。`src/agent/tools/end_session.js`

短期記憶底層：`src/utils/session.js`，詳見 [session-memory.md](../memory/session-memory.md)。

## 模組結構

```
src/agent/
  index.js              # agent 主 loop + 各 tool handler + renderSessionPrompt
  skills.js             # skills loader（啟動時快取）
  tools/
    shell.js            # exec_shell
    write_file.js       # write_file
    read_file.js        # read_file
    web_fetch.js        # web_fetch
    read_skill.js       # read_skill
    remember.js         # remember（寫入 session.locked）
    end_session.js      # end_session（清除 session）
```

## 日誌

每次互動寫入 `log/operation/` JSONL：`user.message`、`llm.request`、`llm.response`、`tool.call`、`tool.result`、`bot.reply`。詳見 [log.md](../system/log.md)。
