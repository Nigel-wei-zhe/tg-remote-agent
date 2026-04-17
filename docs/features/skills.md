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
- **無熱重載**，改動後需重啟 `holeOpen`。
- 模組：`src/agent/skills.js`（`load` / `get(name)` / `indexText()`）。

## 與 Agent 整合
1. `BASE_SYSTEM_PROMPT` + `skills.indexText()` 動態組 system prompt。
2. tools 陣列有 skills 時才加入 `read_skill`。
3. **混合策略**：
   - `read_skill` 呼叫 → 把 body 以 `role: tool` 推回 messages，**繼續下一輪 LLM**。
   - `exec_shell` 呼叫 → 執行並回結果，**立刻終止**（Option A）。
4. 上限 `MAX_ROUNDS = 5`，超過回覆中止訊息。

## Tool 定義
- `read_skill(name: string)`：回傳該 skill 完整 body，或錯誤訊息（skill 不存在時）。
- 實作：`src/agent/tools/read_skill.js`。

## 使用者可見流程
讀 skill 時會收到 `📖 讀取 skill: <name>`；接著 LLM 若呼叫 exec_shell 則照常顯示 `🔧 執行中` 與結果。

## 撰寫守則
- `description` 寫「何時該用」而非「做什麼」。
- body 附具體範例指令，降低 LLM 拼錯參數的機率。
- 對應 CLI 必須是**非互動**（不會讀 stdin），否則 `exec_shell` 會 timeout。
