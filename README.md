# tg-remote-agent

透過 Telegram Bot 遠端執行指令與詢問 AI 的輕量工具。

## 安裝

```bash
npm install -g .
```

## 設定

複製 `.env.example` 為 `.env` 並填入以下變數：

```env
TELEGRAM_TOKEN=your_telegram_bot_token
MINIMAX_API_KEY=your_minimax_api_key
MINIMAX_MODEL=MiniMax-M2.7   # 可選
LLM_PROVIDER=minimax          # 可選
```

## 啟動

```bash
holeOpen
```

## 指令

| 指令 | 說明 |
|------|------|
| `/run <指令>` | 在伺服器上執行 shell 指令 |
| `/ask <問題>` | 詢問 AI |

## 專案結構

```
server.js              # 入口
src/
  commands/            # 指令處理
  llm/                 # LLM 抽象層與 providers
  utils/               # 共用工具
docs/                  # 功能文件
log/                   # 錯誤日誌
```
