# Skills

Agent 可用的自訂能力。每個 skill 是一個資料夾，裡面放 `SKILL.md`。

## 載入時機
`holeOpen` 啟動時掃描本目錄；**沒有熱重載**，改動 skill 後需重啟 server。

## 結構

```
skills/
  <skill-name>/
    SKILL.md
```

## SKILL.md 格式

```markdown
---
name: <skill-id>
description: <一句話說明，LLM 靠這句判斷何時該用>
---

# 使用方式
<如何呼叫、參數說明、範例指令>

# 注意事項
<限制、前置條件>
```

- `name` 是 LLM 呼叫 `read_skill(name)` 時的識別字串，建議跟資料夾名相同。
- `description` 會被塞進 system prompt，**務必精簡**（每 skill 一行）。
- body 只有 LLM 決定要用時才會被讀取（透過 `read_skill` tool），可以寫得詳細。

## Agent 使用流程

1. System prompt 列出所有 skill 的 `name: description`。
2. LLM 認為某 skill 相關 → 呼叫 `read_skill(name)` 拿完整 body。
3. LLM 根據 body 決定參數 → 呼叫 `exec_shell` 執行實際指令。
4. 步驟 3 執行後直接回結果給使用者，不再 call LLM（Option A）。

## 撰寫建議

- description 描述「何時該用」而非「做什麼」。例：`"部署專案到正式環境（使用者提到部署、上線、prod 時）"` 比 `"deployment tool"` 好。
- body 要附範例指令，讓 LLM 照抄。
- 若 skill 對應的 CLI 仍是互動版本（會讀 stdin），**先別加進來**——`exec_shell` 沒接 stdin，會 timeout。
