# LazyHole-Agent

極簡、無記憶、隨插即用的 Telegram AI Agent。

不同於複雜的 Agent 框架，**LazyHole** 專為「懶」而設計：無須配置資料庫、沒有複雜的長期記憶，只專注於即時透過 Telegram 控制伺服器、執行 Shell 指令與網頁研究。

## 設定

請參考 `.env.example` 複製並改名 `.env` 並填入：

````

缺 `TELEGRAM_TOKEN` 或 `TELEGRAM_ALLOWED_USER_ID` 會直接退出。

MiniMax 遇到 `High traffic detected`、`529`、`429`、暫時性網路錯誤時，會依上述參數做有限次指數退避重試。若串流已開始吐 token，為避免重複內容，不再自動重試該次請求。

## 啟動

```bash
npm link  # 建立全域指令
lazyhole
````

啟動後終端會顯示 `LazyHole-Agent` 品牌化面板，列出 `Polling`、模式、白名單 ID、CLI 指令與離開快捷鍵，事件流會接在面板下方輸出。

## 使用方式

| 輸入                          | 行為                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 任意自然語言                  | 進 AI agent，LLM 自行判斷用哪個工具（`exec_shell` / `write_file` / `read_file` / `web_fetch` / `read_skill` / `remember` / `end_session`）或純文字回覆 |
| `/run <指令>`                 | 直通 shell，不經 LLM（除錯／強制執行的逃生口）；查詢型回傳輸出，寫檔型成功時只回完成與存放位置                                                         |
| `/run --cwd <路徑> -- <指令>` | 在指定工作目錄執行直通 shell；`<路徑>` 含空白時請加引號                                                                                                |
| `/memory`                     | 顯示當前 chatId 的短期記憶 session JSON；`/memory clear` 清除                                                                                          |

非白名單使用者：靜默 drop，不回任何訊息。

`exec_shell` 與 `/run` 都支援可選工作目錄 `cwd`。未提供時，會沿用啟動 `lazyhole` 的那個終端機當下所在目錄。

對 `cat > file <<EOF`、redirect、`tee file` 這類寫檔成功場景，Bot 不再把完整內容回傳到 Telegram，而是回 `✅ 任務完成` 與存放目錄，實際結果請到檔案位置查看。

## 指令安全守門

專案根目錄 `setting.json` 定義危險指令黑名單，`/run` 與 `exec_shell` 執行前都會過濾，命中即拒絕並回覆原因。

```json
{
  "shell": {
    "blocklist": {
      "enabled": true,
      "patterns": [
        {
          "pattern": "\\b(shutdown|reboot|halt|poweroff)\\b",
          "reason": "系統關機或重啟"
        }
      ]
    }
  }
}
```

修改後需重啟 `lazyhole` 生效。細節見 [docs/features/system/safety.md](./docs/features/system/safety.md)。

## Agent 工具

| 工具          | 用途                                               | 執行後                                                                  |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `exec_shell`  | 伺服器執行 shell 指令，可選 `cwd` / `followup`     | 預設結果給使用者直接結束；`followup:true` 時結果同時塞回 LLM 續跑下一輪 |
| `write_file`  | 直接寫文字檔（markdown/json/程式碼），可選 `cwd`   | 結果塞回 LLM 繼續下一輪                                                 |
| `read_file`   | 讀文字檔並附行號給 LLM，可 `offset / limit` 分段   | 結果塞回 LLM 繼續下一輪                                                 |
| `web_fetch`   | 抓網頁（HTML→markdown）                            | 結果塞回 LLM 繼續下一輪                                                 |
| `read_skill`  | 讀 skill 完整說明                                  | 結果塞回 LLM 繼續下一輪                                                 |
| `remember`    | 鎖定結構化欄位到 session.locked（多階段 skill 用） | 結果塞回 LLM 繼續下一輪                                                 |
| `end_session` | 任務完成或取消時清空 session                       | 結果塞回 LLM 繼續下一輪                                                 |

短期記憶（session）：server 自動記錄最近對話、`read_skill` 自動標記進行中 skill、30 分鐘 idle 自動過期。細節見 [docs/features/memory/session-memory.md](./docs/features/memory/session-memory.md)。

Loop 上限 5 輪。設計原理見 [docs/concepts/agent-loop.md](./docs/concepts/agent-loop.md)。

## Skills（自訂能力）

在 `skills/<name>/SKILL.md` 放自訂能力說明，agent 啟動時載入。LLM 會在 system prompt 看到 skill 名稱與一行描述，需要時呼叫 `read_skill` 讀詳細，再透過 `exec_shell` 執行。詳見 [skills/README.md](./skills/README.md)。

改 skill 後需重啟 `lazyhole`（無熱重載）。

## 專案結構

```
server.js              # 入口（polling、白名單、路由）
src/
  agent/               # AI agent 主邏輯 + tools（shell、write_file、read_file、web_fetch、read_skill、remember、end_session）+ skills loader
  commands/            # /run 直通 shell、/memory 檢視短期記憶
  llm/                 # LLM 抽象層與 providers
  utils/               # logger、telegram、session（短期記憶）
skills/                # 自訂能力（每個一個資料夾含 SKILL.md）
docs/                  # L1 summary + L2 groups (llm/tool/memory/chat/system) + L3 features
log/
  error/               # 錯誤日誌（每日一檔）
  operation/           # 操作日誌 JSONL（含 LLM 完整交互）
```

細節見 [docs/summary.md](./docs/summary.md)。
