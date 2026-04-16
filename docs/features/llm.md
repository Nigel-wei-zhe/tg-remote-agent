# LLM 整合 (MiniMax)

## 指令
`/ask <問題>` — 透過 LLM provider 取得 AI 回覆

## 模組結構
```
src/llm/
  index.js           # 統一介面，根據 LLM_PROVIDER 路由
  providers/
    minimax.js       # MiniMax 實作
src/commands/
  ask.js             # /ask 指令處理
```

## API 規格 (MiniMax)
- Endpoint: `POST https://api.minimax.io/v1/text/chatcompletion_v2`
- Auth: `Bearer {MINIMAX_API_KEY}`
- Request timeout: 30 秒
- 預設模型: `MiniMax-M2.7`

## 環境變數
| 變數 | 必填 | 說明 |
|------|------|------|
| `MINIMAX_API_KEY` | 是 | MiniMax 平台 API Key |
| `MINIMAX_MODEL` | 否 | 模型 ID，預設 `MiniMax-M2.7` |
| `LLM_PROVIDER` | 否 | Provider 名稱，預設 `minimax` |

## 可用模型
- `MiniMax-M2.7` / `MiniMax-M2.7-highspeed`
- `MiniMax-M2.5` / `MiniMax-M2.5-highspeed`
- `M2-her`（角色扮演、多輪對話）
- `MiniMax-M2` / `MiniMax-M2.1`

## 擴充新 Provider
1. 在 `src/llm/providers/` 新增 `<name>.js`，實作 `ask(message)` 函式
2. 在 `src/llm/index.js` 加入對應的 `if (provider === '<name>')` 分支
3. 設定 `.env` 的 `LLM_PROVIDER=<name>`
