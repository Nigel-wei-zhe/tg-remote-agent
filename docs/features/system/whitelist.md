# 白名單 (Whitelist)

## 機制
- `TELEGRAM_ALLOWED_USER_ID` 在 `.env` 指定唯一允許的 Telegram user id。
- `server.js` 的 `handleUpdate` 入口比對 `update.message.from.id`。
- 不符者：靜默 drop（不回覆任何訊息，避免 bot 被探測），寫入 `log/operation/` 的 `auth.blocked` 事件。

## 啟動檢查
缺 `TELEGRAM_ALLOWED_USER_ID` 時 server 直接退出，強制設定。

## 取得自己的 user id
對任一 bot 發訊息，查 `log/operation/` 的 `auth.blocked` 事件，或用 @userinfobot 查詢。
