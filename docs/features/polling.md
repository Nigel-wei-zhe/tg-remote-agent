# 輪詢機制 (Long Polling Mechanism)

## 實作細節
- API: 使用 Telegram Bot API 的 getUpdates 端點。
- 參數: 
  - offset: 批次結束後統一更新至最後一筆 update_id，確保訊息不重複讀取。
  - timeout: 30: 啟用 Long Polling，減少 HTTP 請求頻率。
- 並行處理: 同一批次的更新全部以 forEach 並行觸發（非 await 串行），避免單一慢速指令（如 /ask LLM 等待）阻塞其他指令。
- 啟動邏輯:
  - setTimeout(pollUpdates, 1000): 每次輪詢結束後延遲 1 秒進行下一次，避免 CPU 過度負載。
  - 無需 Webhook 或公網 IP，適用於任何網路環境。
