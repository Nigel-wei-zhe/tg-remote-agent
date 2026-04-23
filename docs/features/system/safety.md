# 指令安全守門 (Shell Blocklist)

## 機制
- 設定檔：專案根目錄 `setting.json`。
- 進入點：`src/agent/tools/shell.js` 的 `run()`，同時覆蓋 `/run` 與 `exec_shell` 工具。
- 執行前以 `RegExp.test(command)` 比對所有 pattern，命中立即回 `{ ok: false, output: '⛔ 拒絕執行：... (原因)' }`，不進 `exec()`。

## setting.json 結構
```json
{
  "shell": {
    "blocklist": {
      "enabled": true,
      "patterns": [
        { "pattern": "<regex 字串>", "reason": "<擋下時顯示的原因>" }
      ]
    }
  }
}
```
- `enabled: false` 會停用整個黑名單。
- `pattern` 為 JavaScript `RegExp` 字串，記得 JSON 內 `\` 需寫成 `\\`。
- `reason` 會回顯給 Telegram 使用者，建議用繁中短語。

## 預設擋板
刪根目錄 / 格式化 / 寫 raw device / fork bomb / 關機指令 / 遞迴 777 於根 / 管道執行遠端腳本 / 直寫磁碟。

## 載入時機
模組載入時讀一次並快取。修改 `setting.json` 後需重啟 `lazyhole` 生效，與 skills 規則一致。

## 失效保護
讀檔或 JSON 解析失敗 → 印 warning、黑名單為空（放行所有指令）。若要求「預設拒絕」需改 `loadBlocklist()` 為 throw。
