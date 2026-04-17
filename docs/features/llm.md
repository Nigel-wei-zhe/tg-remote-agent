# LLM 整合 (MiniMax)

## 角色
被 agent 呼叫，不直接對應某個 Telegram 指令。agent 流程見 [agent.md](./agent.md)。

## 介面 (`src/llm/index.js`)
```js
chat({ messages, tools }) -> message
```
- `messages`: OpenAI 格式 `[{ role, content }, ...]`
- `tools`: OpenAI function-calling 格式（可省略）
- 回傳：`choices[0].message`（可能含 `content` 或 `tool_calls`）

## Provider 路由
依 `LLM_PROVIDER` 選擇（預設 `minimax`）。

## MiniMax 實作 (`src/llm/providers/minimax.js`)
- Endpoint: `POST https://api.minimax.io/v1/text/chatcompletion_v2`
- Auth: `Bearer {MINIMAX_API_KEY}`
- Timeout: 120 秒（含 reasoning 與大 context 時需要較寬裕）
- 預設模型: `MiniMax-M2.7`
- 帶 tools 時同時設 `tool_choice: 'auto'`

## 環境變數
| 變數 | 必填 | 說明 |
|------|------|------|
| `MINIMAX_API_KEY` | 是 | MiniMax API Key |
| `MINIMAX_MODEL` | 否 | 模型 ID，預設 `MiniMax-M2.7` |
| `LLM_PROVIDER` | 否 | Provider 名稱，預設 `minimax` |

## 可用模型
- `MiniMax-M2.7` / `MiniMax-M2.7-highspeed`
- `MiniMax-M2.5` / `MiniMax-M2.5-highspeed`
- `M2-her`
- `MiniMax-M2` / `MiniMax-M2.1`

## 擴充新 Provider
1. `src/llm/providers/<name>.js` 實作 `chat({ messages, tools })`。
2. `src/llm/index.js` 加 `if (provider === '<name>')` 分支。
3. `.env` 設 `LLM_PROVIDER=<name>`。
