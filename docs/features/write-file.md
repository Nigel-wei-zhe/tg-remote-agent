# 直接寫檔 (`write_file`)

## 功能
- 直接把文字內容寫入指定檔案，適合 markdown、json、程式碼、設定檔。
- 自動建立父目錄。
- `path` 可用絕對路徑，或搭配 `cwd` 的相對路徑。
- 內容大小限制：預設 500KB，可用 `WRITE_FILE_MAX_BYTES` 調整。

## 目的
- 讓 LLM 寫長內容時不必透過 `exec_shell` heredoc 或 redirect。
- 避免把整篇文章、程式碼、設定檔原文回傳到 Telegram。
- 寫檔後可繼續下一輪，由 LLM 自己決定是否補一句收尾文字或結束 session。

## Tool 介面
```js
write_file({ path, content, cwd? })
```

## 回傳
- 成功：`已寫入檔案：<absolute-path>`
- 失敗：`write_file 失敗：<message>`

## 實作
- 模組：`src/agent/tools/write_file.js`
- 寫入方式：`fs.writeFileSync(..., 'utf8')`
- 目錄建立：`fs.mkdirSync(dirname, { recursive: true })`

## 使用原則
- 已知完整內容要落地成檔案時，優先用 `write_file`。
- 需要 shell 行為（git、build、deploy、grep、ls）時才用 `exec_shell`。
