# 錯誤日誌 (Error Log)

## 機制
- 錯誤發生時呼叫 `logError(context, message)`，寫入 `log/YYYY-MM-DD.log`。
- 每日一檔，自動建立 log 目錄。

## 記錄來源
- `RUN:<command>`: child_process.exec 執行失敗。
- `SEND`: Telegram sendMessage API 失敗。
- `POLL`: getUpdates 輪詢失敗。

## 格式
```
[14:32:01] [RUN:rm -rf /] Permission denied
[14:33:10] [SEND] Bad Request: message is too long
```
