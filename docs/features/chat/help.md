# 功能總覽指令 (`/help`)

## 角色
Telegram 全域 help。列出目前可用功能入口，不進 Agent Loop、不寫 session。

## 路由
- `server.js`: `/help`、`/help ...` → `src/commands/help.js`
- 白名單檢查後執行。

## 內容
- 自然語言 Agent。
- `/run <command>` 與 `--cwd` 範例。
- `/memory` 與 `/memory help`。
- `/music <風格描述>` 與 `/music --instrumental <風格描述>`。
- `/help` 本身。

## 日誌
- `user.message`: `route: "help"`
- `bot.reply`: `route: "help"`
