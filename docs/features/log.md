# 日誌 (Logging)

## 目錄結構
```
log/
  error/YYYY-MM-DD.log       # 純文字，每行一則錯誤
  operation/YYYY-MM-DD.log   # JSONL，每行一個事件
```
自動建立；`log/` 已被 `.gitignore` 排除。

## API (`src/utils/logger.js`)
- `logError(context, message)`：寫 `log/error/`。
- `logOp(event, data)`：寫 `log/operation/`，自動加 `ts`。

## Error log 格式
```
[14:32:01] [RUN:rm -rf /] Permission denied
```
來源：`POLL`、`SEND`、`AGENT`、`RUN:<cmd>`。

## Operation log 格式 (JSONL)
每行一個 JSON，欄位 `{ ts, event, ...data }`。

### 事件類型
| event | 觸發時機 | 主要欄位 |
|-------|---------|---------|
| `auth.blocked` | 白名單未通過 | userId, sender, chatId, text |
| `user.message` | 收到訊息 | chatId, userId, sender, text, route? |
| `llm.request` | 送出 LLM 請求 | provider, model, payload |
| `llm.retry` | MiniMax 可恢復錯誤退避後重試 | provider, requestName, attempt, nextAttempt, delayMs, reason, statusCode? |
| `llm.response` | 收到 LLM 回應 | provider, data (完整 response) |
| `tool.call` | Agent 呼叫工具 | name, command?/cwd?/url?/args, round |
| `tool.result` | 工具執行結果 | name, ok, command?/cwd?/url?/skillName?, output?/length?/status?, round |
| `tool.unknown` | LLM 要求了未知工具 | name, round |
| `agent.max_rounds` | 撞 MAX_ROUNDS，觸發強制總結 | chatId |
| `bot.reply` | 回傳給 TG 的內容 | chatId, text, phase (`llm.content` / `tool.pre` / `tool.result` / `skill.read` / `fetch.pre` / `empty` / `max_rounds.summary`), round? |

## 注意
- operation log 包含 LLM 完整對話與 shell 輸出，可能含敏感資訊。
- Telegram 發送若遇到 Markdown entity 解析錯誤，會退回純文字重送一次。
- 目前不做 rotation，膨脹過快再加。
