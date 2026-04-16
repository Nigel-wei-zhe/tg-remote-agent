# 輪詢機制 (Long Polling Mechanism)

## 實作細節
- API: 使用 Telegram Bot API 的 getUpdates 端點。
- 參數: 
  - offset: 自動記錄 lastUpdateId + 1，確保訊息不重複讀取。
  - timeout: 30: 啟用 Long Polling (長輪詢)，在伺服器端等待訊息，減少 HTTP 請求頻率。
- 啟動邏輯:
  - setTimeout(pollUpdates, 1000): 每次輪詢結束後延遲 1 秒進行下一次，避免 CPU 過度負載。
  - 無需 Webhook 或公網 IP，適用於任何網路環境。
