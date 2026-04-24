# Skills（自訂能力）

## 目的
讓 agent 的 LLM 能認識並調用專案特定的自訂 CLI 流程，不需要把所有細節塞進 system prompt。

## 結構
```
skills/
  README.md           # 撰寫規範（給人看）
  <skill-name>/
    SKILL.md          # frontmatter + body
```

## SKILL.md 格式
```markdown
---
name: <skill-id>            # LLM 呼叫 read_skill 時的識別字串
description: <一句話>       # 會塞進 system prompt，精簡
---

<完整用法、參數、範例指令。只在 LLM 呼叫 read_skill 時載入。>
```

## 載入機制
- 啟動時掃 `skills/*/SKILL.md`，解析 frontmatter。
- **無熱重載**，改動後需重啟 `lazyhole`。
- 模組：`src/agent/skills.js`（`load` / `get(name)` / `indexText()`）。

## 與 Agent 整合
1. `BASE_SYSTEM_PROMPT` + `skills.indexText()` 動態組 system prompt。
2. tools 陣列有 skills 時才加入 `read_skill`。
3. **混合策略**：
   - `read_skill` 呼叫 → 把 body 以 `role: tool` 推回 messages，**繼續下一輪 LLM**。
   - `write_file` 呼叫 → 直接寫檔後推回 messages，**繼續下一輪 LLM**（長內容落地用）。
   - `exec_shell` 呼叫 → Telegram 只顯示簡短進度，完整結果推回 messages，**繼續下一輪 LLM**。
   - `exec_shell({ final:true })` → 成功且同輪無其他 tool 結果待消化時，完整結果給使用者並結束。
4. 上限 `AGENT_MAX_ROUNDS`（預設 `5`），超過後強制總結。

## Tool 定義
- `read_skill(name: string)`：回傳該 skill 完整 body，或錯誤訊息（skill 不存在時）。
- 實作：`src/agent/tools/read_skill.js`。
 - `write_file({ path, content, cwd? })`：直接寫文字檔，適合長內容落地；實作：`src/agent/tools/write_file.js`。

## 使用者可見流程
讀 skill 時會收到 `📖 讀取 skill: <name>`；接著 LLM 若用 `exec_shell` 查閱或處理，只顯示簡短進度；最終需要把 shell 結果直接給使用者時才用 `exec_shell final:true`。

## 撰寫守則
- `description` 寫「何時該用」而非「做什麼」。
- body 附具體範例指令，降低 LLM 拼錯參數的機率。
- 對應 CLI 必須是**非互動**（不會讀 stdin），否則 `exec_shell` 會 timeout。

## 跨輪狀態（Session）

需要多階段對話才能完成的 skill（例：blog-poster）直接依賴 agent 內建的短期記憶：

- Server 每輪自動把使用者訊息、LLM 回覆 append 到 `session.history`；`read_skill` 被呼叫時自動 `markActiveSkill`。下一輪 system prompt 會注入「[對話狀態]」區塊，LLM 無需主動讀取。
- 用戶確認完成的結構化欄位（標題、完稿）由 LLM 透過 `remember({ fields })` 工具寫入 `session.locked`。
- 任務成功或用戶取消時呼叫 `end_session` 清除 session。
- 底層與細節見 [session-memory.md](../memory/session-memory.md)。idle TTL 30 分鐘，`/memory` 指令可直接檢視。
