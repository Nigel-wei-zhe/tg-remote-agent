# 遠端指令執行 (Remote Command Execution)

## 功能說明
- 使用者可透過 Telegram 對 Bot 發送 /run <指令>。
- Bot 會在伺服器背景呼叫 child_process.exec() 執行該指令。
- 執行完成後，將 stdout 或 stderr 以 Markdown 代碼區塊格式回傳給使用者。
- output 超過 3800 字元自動截斷，末尾附加 `...(已截斷)`，避免觸發 Telegram 4096 字元上限。

## 安全注意事項
- 無權限過濾: 目前任何能接觸到 Bot 的人皆可執行指令。
- 環境變數: 執行環境與 Node.js 程序相同，可存取本地檔案。
