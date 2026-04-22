# LLM 整合 (MiniMax)

## 角色
被 agent 呼叫，不直接對應某個 Telegram 指令。agent 流程見 [agent.md](./agent.md)。

## 介面 (`src/llm/index.js`)
```js
chat({ messages, tools }) -> message
chatStream({ messages, tools }, onToken) -> message
```
- `messages`: OpenAI 格式 `[{ role, content }, ...]`
- `tools`: OpenAI function-calling 格式（可省略）
- `onToken(chunk)`: streaming 模式下每個 token 回呼
- 回傳：`{ role, content, tool_calls? }`

## Provider 路由
依 `LLM_PROVIDER` 選擇（預設 `minimax`）。

## MiniMax 實作 (`src/llm/providers/minimax.js`)
- Endpoint: `POST https://api.minimax.io/v1/text/chatcompletion_v2`
- Auth: `Bearer {MINIMAX_API_KEY}`
- Timeout: 120 秒（含 reasoning 與大 context 時需要較寬裕）
- 預設模型: `MiniMax-M2.7`
- 帶 tools 時同時設 `tool_choice: 'auto'`
- Streaming 模式：`stream: true` + SSE 解析，支援 content token 與 tool_calls 累積
- 重試機制：對 `429`、`5xx`、`529`、`High traffic detected`、暫時性網路錯誤做指數退避重試
- 串流保護：若已開始輸出 token 或 tool_calls，後續錯誤不重試，避免 Telegram 端收到重複內容

## 環境變數
| 變數 | 必填 | 說明 |
|------|------|------|
| `MINIMAX_API_KEY` | 是 | MiniMax API Key |
| `MINIMAX_MODEL` | 否 | 模型 ID，預設 `MiniMax-M2.7` |
| `LLM_PROVIDER` | 否 | Provider 名稱，預設 `minimax` |
| `MINIMAX_RETRY_MAX_ATTEMPTS` | 否 | 總嘗試次數，預設 `4` |
| `MINIMAX_RETRY_BASE_MS` | 否 | 初始退避毫秒，預設 `1500` |
| `MINIMAX_RETRY_MAX_MS` | 否 | 單次退避上限毫秒，預設 `12000` |

## 可用模型
- `MiniMax-M2.7` / `MiniMax-M2.7-highspeed`
- `MiniMax-M2.5` / `MiniMax-M2.5-highspeed`
- `M2-her`
- `MiniMax-M2` / `MiniMax-M2.1`

## 擴充新 Provider
1. `src/llm/providers/<name>.js` 實作 `chat` 與 `chatStream`。
2. `src/llm/index.js` 的 `getProvider()` 加對應分支。
3. `.env` 設 `LLM_PROVIDER=<name>`。
