# Telegram 串流回覆：訊息斷尾 ▌ 的 race 與修法

> 一句話摘要：使用者在 Telegram 看到回覆停在 `...邊緣裝置上的 ▌` 沒寫完。log 明明說 LLM 產出了完整內容。差距來自一個 race：最終 `flush(true)` 被早期 guard 擋掉、Telegram 的訊息停留在上一次 interval 所發的「帶游標」版本。這份筆記同時介紹整套聊天訊息怎麼從 LLM 流到 Telegram，讓第一次來的人能順著讀。

---

## 先給第一次來的人：整套訊息是怎麼流的

LazyHole-Agent 是一個 Telegram bot。使用者發訊息，背後是一個 LLM agent 多輪決策並呼叫工具，最後把結果回 Telegram。流向如下：

```
Telegram (user) ──poll──▶ server.js
                              │
                              ▼
                        權限/指令路由
                              │
                              ▼ (預設)
                        src/agent/index.js (agent.handle)
                              │
                       messages = [system, user]
                              │
                   ┌──────────┴──────────┐
                   │    for round 1..5   │
                   │                     │
                   ▼                     │
        llm.chatStream(onToken) ─────────┤
          │ token 一個一個 callback      │
          ▼                              │
        createStreamer.onToken(chunk)    │
          │  buffer += chunk             │
          ▼                              │
        setInterval 每 700ms flush       │
          │ edit Telegram 訊息 + ' ▌'    │
          ▼                              │
        stream 結束 → streamer.finalize()│
          │ 發出最終 edit（去掉 ▌）      │
          ▼                              │
        若 LLM 還 call tool ─────────────┤
                                         │
                                         ▼
                                   回傳完整結果
```

### 關鍵檔案

| 位置 | 負責 |
|------|------|
| `server.js` | Telegram long polling、白名單、指令前綴路由（`/run`、`/memory` 走旁路）|
| `src/agent/index.js` | LLM agent 主迴圈（`MAX_ROUNDS = 5`）、工具分派 |
| `src/llm/providers/minimax.js` | MiniMax 串流呼叫、token 以 `onToken(chunk)` callback 吐出 |
| `src/utils/telegram.js` | `sendMessage` / `startTyping` / **`createStreamer`（本文主角）** |
| `src/utils/session.js` | 跨輪短期記憶 |
| `src/utils/logger.js` | operation log（JSONL）與 error log |

### 為什麼要串流

最單純的做法是等 LLM 全部產完再 `sendMessage` 一次。缺點：
- LLM 回一大段要 10 秒以上，使用者盯著空畫面。
- Telegram 的 typing 指示器只能維持 5 秒左右，重複送也顯得呆滯。

所以採「逐字串流」：每收到幾個 token 就更新一次訊息，讓使用者看到「正在打字」的感覺。Telegram 沒有「append」API，所以採取的模式是：

1. 第一次 flush：`sendMessage` 建立訊息、拿到 `message_id`。
2. 之後每次：`editMessageText` 覆寫同一則訊息為「目前累積全文 + `▌`（游標）」。
3. 串流結束：再 edit 一次，去掉 `▌`。

這是 `src/utils/telegram.js` 的 `createStreamer` 做的事。

---

## Bug 症狀

使用者 2026-04-23 測試：

```
使用者：在設計 ai-agent 如果有用到 sqlite 通常會存放什麼
Bot（Telegram 顯示）：
  在 AI Agent 設計中，SQLite 常被用作本地持久化儲存...
  （中略 7 節結構化說明）
  SQLite 的優點是**輕量、零配置、檔案化**，適合單機或邊緣裝置上的 ▌
  ← 斷在這，沒有後續「AI Agent 場景。若部署在多實例…」
```

但 operation log 同一輪的 `bot.reply` 事件把**完整 1162 字**都記下來了：

```json
{"ts":"2026-04-23T03:32:07.996Z","event":"llm.response","contentLength":1162}
{"ts":"2026-04-23T03:32:07.997Z","event":"bot.reply","text":"...適合單機或邊緣裝置上的 AI Agent 場景。若部署在多實例環境，則建議改用 PostgreSQL/MySQL ..."}
```

`llm.response` 到 `bot.reply` **只差 1ms**。

關鍵觀察：`bot.reply` 是在 `await streamer.finalize()` 返回後才 log 的。如果 finalize 真的有發出最終 `editMessageText`，至少要花一次 HTTP 往返（典型 200–400ms）。差 1ms 的唯一解釋是 **finalize 幾乎沒做事就返回**。

---

## 根因：race 覆寫了 finalize 的等待目標

修復前的簡化版：

```js
let dirty = false;
let flushing = false;
let flushPromise = Promise.resolve();

const flush = async (isFinal = false) => {
    if (!dirty || flushing || !buffer) return;    // ← guard
    flushing = true;
    const text = buffer + (isFinal ? '' : ' ▌');
    try { await axios.post(.../editMessageText...); dirty = false; } catch {}
    flushing = false;
};

const interval = setInterval(() => {
    flushPromise = flush(false);                   // ← 每次 tick 都覆寫
}, 700);

finalize = async () => {
    clearInterval(interval);
    await flushPromise;                            // ← 等「最後一次」tick
    if (buffer) { dirty = true; await flush(true); }
};
```

### 正常情況

Telegram HTTP 快（<700ms），每個 interval tick 的 flush 都能在下一個 tick 前完成。`flushPromise` 總是指向「最近完成」或「正在跑」的那一個。finalize 時 `await` 它→ 等到 HTTP 完成 → `flushing=false` → 最終 `flush(true)` 成功發出。

### 出事的時序

當 Telegram 對 edit 套用 rate limit 或網路抖動，某次 HTTP 超過 700ms：

```
t=0     tick A 觸發 → guard 通過 → flushing=true → HTTP 啟動（會跑 900ms）
                   → flushPromise = PromiseA（未 resolve）
t=700   tick B 觸發 → guard 擋住（flushing=true）→ 立刻 return
                   → flushPromise = PromiseB（已 resolved 的「空」Promise）
t=900   tick A 的 HTTP 回來 → dirty=false, flushing=false
                   （但 PromiseA 已經不被任何地方引用）

t=900+  stream 結束，finalize()：
        clearInterval
        await flushPromise    ← 這是 PromiseB，已 resolved，瞬間通過
        dirty = true
        flush(true)           ← flushing 此刻是 false（tick A 已回來）
                                所以應該能送出…
```

上面這條路看起來沒事。但另一條更糟的分支：當 stream 結束時機**卡在 tick A 的 HTTP 仍在飛**時（也就是剛好在 t=700 到 t=900 之間 finalize）：

```
t=820   finalize()：
        await flushPromise    ← PromiseB（resolved）→ 瞬間通過
        dirty = true
        flush(true)
          └─ guard: flushing 還是 true（tick A 的 HTTP 還沒回來）
             → 立刻 return，什麼都沒發
        finalize 返回 → bot.reply 立刻 log

t=900   tick A 的 HTTP 回來，清 flushing=false
        但已經沒人再呼叫 flush 了，最終 edit 永遠不會發出
```

Telegram 上看到的就停在 tick A 發的內容 + `▌`。

### 為什麼 flushPromise 不可靠

`flushPromise = flush(...)` 這行，在 guard 提前 return 時，拿到的是**一個已經 resolved 的 Promise**，而不是「還在飛的那個」。換句話說：`flushPromise` 只追蹤「最近一次 interval 的返回值」，不等於「目前在飛的 HTTP」。這兩個概念**被寫成同一個變數**是 bug 的核心。

---

## 修法：Promise chain 序列化所有 flush

改寫後 (`src/utils/telegram.js`)：

```js
let buffer = '';
let lastSent = '';          // 成功送出的最近版本
let intervalPending = false;
let chain = Promise.resolve();

const doFlush = async (isFinal) => {
    if (!buffer) return;
    const text = buffer + (isFinal ? '' : ' ▌');
    if (text === lastSent) return;              // 避免 "not modified"
    try {
        await axios.post(.../editMessageText..., { text });
        lastSent = text;
    } catch (err) {
        if (!isFinal) return;
        logError('TG_EDIT_FINAL', err.response?.data?.description || err.message);
        await new Promise(r => setTimeout(r, 1200));      // rate limit 恢復
        try {
            await axios.post(.../editMessageText..., { text });
            lastSent = text;
        } catch (err2) { logError('TG_EDIT_FINAL_RETRY', ...); }
    }
};

const interval = setInterval(() => {
    if (intervalPending) return;                // 防堆積
    intervalPending = true;
    chain = chain.then(() => { intervalPending = false; return doFlush(false); });
}, 700);

finalize = async () => {
    clearInterval(interval);
    chain = chain.then(() => doFlush(true));    // 把最終 flush 接到鏈尾
    await chain;                                 // 等整條鏈跑完
};
```

### 為什麼這樣對

1. **`chain` 是一條永遠不會被覆蓋的 Promise 鏈**。每次 `chain = chain.then(...)` 都是在鏈尾加一節。finalize 的 `await chain` 保證等到「至今所有入隊的 flush」全部跑完才往下走。
2. **`lastSent` 取代 `dirty`**：記住「成功送出的版本」而不是「有沒有新 token」。消除原本 HTTP 期間 `onToken` 寫入的 `dirty=true` 被後續 `dirty=false` 覆蓋的隱性漏送。
3. **`flushing` flag 不再需要**：chain 本身就是序列化，不可能同時有兩個 `doFlush` 在跑。
4. **`intervalPending`**：Telegram 慢時 chain 變長；這個旗標確保同一時間最多只有一個「interval 意圖」在隊裡，避免堆出幾十筆只更新同一段 buffer 的 edit。
5. **最終失敗 log + 重試**：原本 `catch {}` 全靜默。這次把 final 失敗寫進 `log/error/`，再延遲 1.2 秒重試一次，讓 rate limit 有時間恢復。

### 流程對照

| 情境 | 舊版 | 新版 |
|------|------|------|
| HTTP 都 <700ms | ✅ | ✅ |
| HTTP >700ms，finalize 晚到 | ⚠️ flushPromise 被覆寫，但實際能工作 | ✅ |
| HTTP >700ms，finalize 早到 | ❌ flush(true) 被 guard 擋掉，永遠沒發 | ✅ await chain 等到 |
| final edit 被 rate limit | ❌ 靜默吞錯 | ✅ log + 重試 |

---

## 通用教訓

### 1. 「最新的 Promise 變數」不等於「in-flight 的那個」

寫並發 code 時常見陷阱：**賦值「最近一次函式的返回值」到一個共享變數**，假設它一定能代表「最近還在做事的那個」。但函式有 guard / early return 時，你拿到的是「一個已 resolved 的瞬時 Promise」，而真正的 long-running 任務已經離開你的視野。

解法通常有兩種：
- **鏈式**：`x = x.then(next)`，讓前後順序被 Promise 保留。
- **集合**：用 `Set<Promise>` 追蹤所有 in-flight，結束時 `Promise.all`。

### 2. 用「上次成功送出的版本」判斷重送，不要用「有沒有新變動」

`dirty` flag 在 async 世界裡很容易被跨越 await 的側效應覆寫。改存「你上次成功送了什麼」，比對「你現在想送什麼」，邏輯單純、無 race。這個 pattern 在 debounce、memoize、retry 都適用。

### 3. `catch {}` 是靜默失敗溫床

原本這段：
```js
try { await axios.post(...); dirty = false; } catch { /* ignore */ }
```
立意良善（避免 Telegram 的「message not modified」噪音灌 log），但同時吃掉了所有錯誤。當 rate limit 真的來時，使用者看到斷尾，而我們沒有任何痕跡。

原則：**silently swallow 只接受已知可忽略的錯誤類型**。其他一律 log，哪怕 log 得很粗。這次把 `isFinal` 時的失敗獨立處理，非 final 才 ignore。

### 4. Log 要能回答「到底有沒有送出去」

這次能定位到 race，關鍵在 commit 7312ed0 加的 `bot.chunk` 事件：能看到 LLM 吐了哪些 token。但 Telegram API 端的成敗仍然沒有 log（仍藏在 catch 裡）。下次類似 bug 可以考慮再加一條 `bot.flush` 記「送了什麼、Telegram 回應幾行」，讓診斷不用再靠推理。

---

## 本次改動

- `src/utils/telegram.js`：重寫 `createStreamer`，用 Promise chain 取代 `flushing`/`dirty`/`flushPromise` 組合；final 失敗 log + 重試。
- `docs/features/system/log.md`：error 來源新增 `TG_EDIT_FINAL`、`TG_EDIT_FINAL_RETRY`。
- 本檔：記錄根因與教訓。

（功能索引 `docs/summary.md` 新增「Telegram 串流 race 修法」概念連結。）

---

## 延伸思考

1. **要不要讓 streamer 能觀測狀態？** 目前 `lastSent` 只在內部。若對外暴露 `getStats()`（`flushCount`、`errorCount`、`lastError`），診斷 race 類型的 bug 會更快。但對現在規模可能 over-engineered。
2. **Telegram edit rate limit 的正式上限是多少？** 文件寫「1 sec per chat」不精確，實務上同一訊息的連續 edit 有更嚴格限制。若未來訊息變長、stream 變快，應該做 client-side 動態延長 interval（例如連續兩次 429 就把 700ms 拉到 1500ms）。
3. **`▌` 游標有意義嗎？** 原意是讓使用者知道還在打字。但 Telegram 本身就有 typing 指示器。若 `▌` 反而讓斷尾更顯眼，或許可拿掉、改用訊息長度變化本身傳達「還在跑」。這次先保留，但可以測。
4. **對比 Anthropic SDK / OpenAI SDK 的 streaming 介面**：它們的 `onToken` 也是 callback，但最終「訊息 commit」通常是呼叫 `response.final()` 或靠 finally block。這次 bug 本質是**把一個非單調變化的狀態（PromiseA/B 誰代表 in-flight）當單調來用**，在任何串流管線都可能重現，不只 Telegram。
