# Skill + 外部 CLI 整合的斷鏈模式：一次 blog-poster 連環失敗記

> 一句話摘要：一個「發一篇 blog」功能連卡三層 bug，每層都教了一課——工具契約、模板字串轉義、第三方 API 假設。這份筆記記錄症狀、根因，以及辨識同類型問題的方法。

## 症狀時間軸

使用者下「請幫我寫一篇介紹人類記憶的 blog 並發布」，連續失敗：

1. **第 1~4 次**：agent 每次只跑到 `ls -la ~/.opencli/clis/nigel-lee/` 就結束，從未產出標題或內文。
2. **修 skill 後**：流程走通（Concept → Detail → Publish），但最後 `opencli nigel-lee post-new ...` 回 `unknown command 'nigel-lee'`。
3. **修 adapter 語法後**：exec_shell 回 exit=0、無輸出，但 `/api/posts` 實際沒新文章。
4. **再修 adapter eval 方式後**：成功回傳 id=21，文章上線。

三層問題疊加，每一層修好都讓下一層的「偽正向訊號」更像成功。

---

## 第一層：`exec_shell` 契約 × skill 工作流衝突

**症狀**：LLM 卡在「環境檢查」，永遠走不到內文生成。

**根因**：skill 把「Silent Prep：檢查並部署適配器」寫成工作流第一步。LLM 照做呼叫 `exec_shell("ls ...")`。但 agent 契約是 **exec_shell 呼叫後本輪立即終止**（`src/agent/index.js` 的 `shouldTerminate = true`）。本輪結束後 LLM 沒機會進下一步；使用者重試又從頭，卡同一位置。

**修法**：重排 skill 流程，環境檢查從「主流程」移到「Publish 失敗時才觸發的排錯路徑」。主流程變成：
1. Concept Check（純文字 + remember）
2. Detailed Review（純文字 + remember）
3. Publish（exec_shell，本輪終止符合契約）

**概括教訓**：**skill 工作流必須配合工具契約**。本專案分類：
- 讀取類（`read_skill` / `web_fetch` / `remember`）可連續多輪
- 執行類（`exec_shell`）一呼叫即終止

所以 skill 裡 exec_shell 只能放「最終動作」，不能當中間檢查。

---

## 第二層：adapter 模板字串被錯誤轉義

**症狀**：`opencli list` 啟動時印 `⚠ Failed to load module .../post-new.js: Invalid or unexpected token`，導致 `nigel-lee` 指令沒註冊進 opencli。LLM 執行得到 `error: unknown command 'nigel-lee'`。

**根因**：adapter 某行寫成
```js
throw new Error(\`Failed to create post: \${res.status}\`);
```
反斜線讓 Node 當普通字元處理，語法非法。推測當初是從 markdown code block 複製時被過度轉義。

**修法**：移除反斜線，恢復正常模板字串。

**概括教訓**：**第三方工具載入階段的 stderr warning 不能忽略**。opencli 在每個子命令前都會掃全部 adapter；壞掉的 adapter 被靜默跳過——症狀不是「明確失敗」而是「指令消失」。Debug 時先看工具啟動訊息，不要只看 exit code。

---

## 第三層：`page.evaluate` API 誤用

**症狀**：adapter 修好後，執行 `opencli nigel-lee post-new ...` 回 exit=0、沒輸出，`/api/posts` 查不到新文章。看似成功、實則沒做任何事。

**根因**：原 adapter 用
```js
await page.evaluate(async (data) => { ... }, kwargs);
```
這是 Puppeteer / Playwright 的介面（傳 function + 參數）。但 opencli 的 `page.evaluate` 只接受 **JS 程式碼字串**（見 `/Users/nigel/.opencli/clis/36kr/article.js` 的 `page.evaluate(\`(() => {...})()\`)` 寫法）。傳 function 時整段被靜默忽略、回 `undefined`。外層 `throw new Error` 因 `!res.ok` 沒被執行所以沒拋錯；opencli 收到 undefined 當正常完成，exit 0。

**修法**：把 `kwargs` 用 `JSON.stringify` 內嵌進 eval 字串，用 async IIFE 包住 fetch，回傳 `{status, ok, body}` 給 Node 端判斷。

**概括教訓**：**同名 API 不代表同介面**。Playwright / Puppeteer / CDP / opencli 都有 `page.evaluate`，但語意各異。整合第三方 CLI 以**它自己的範例檔**為準，不要套用其他 browser automation 的習慣。

---

## 共同模式：看起來像成功的靜默失敗

每層都有「偽正向訊號」：

| 層 | 偽正向訊號 | 真相 |
|---|---|---|
| 1 | LLM 有回覆文字（`ls` 結果） | exec_shell 被提前觸發，任務沒完成 |
| 2 | opencli exit 0（只有 stderr warning） | 指令註冊已失效 |
| 3 | `opencli post-new ...; echo $?` 回 0 | POST 從未真的發出 |

辨識這類 bug 的通用動作：

- **用外部事實驗證**，不信 exit code。本次靠 `curl /api/posts` 比對文章 id。
- **加 debug output 印 intermediate 結果**（如 `console.error('landed at:', ...)`），縮小靜默區間。
- **從 N+1 層往回追**：先確認使用者事實（有沒有文章）→ API 是否收到 → 本地 CLI 是否送出 → LLM 參數是否正確。

---

## 本次改動與連帶影響

- `skills/blog-poster/SKILL.md`：流程重排、新增「重要限制」區塊。
- `skills/blog-poster/resources/nigel-lee-adapter.js`：兩次修正（模板字串 + `page.evaluate` 用法）。
- 部署位置 `/Users/nigel/.opencli/clis/nigel-lee/post-new.mjs` 同步覆蓋。
- `src/agent/skills.js` 有永久 cache，SKILL.md 改動需重啟 `lazyhole` 才生效——本身不改，但記得。

---

## 延伸思考

1. **agent 層要不要檢查 skill 內容與工具契約一致性？** 例如啟動時掃 skill body，早期呼叫執行類工具就 warn。暫不做，成本高於頻率。
2. **opencli 載入 warning 要不要自動偵測？** 可讓 skill 首次讀取時 LLM 主動跑 `opencli list 2>&1 | grep -i fail` 自檢。目前靠人工觀察日誌。
3. **三方 API 差異是否該文件化？** 若 skill 增多，可在 `skills/<name>/resources/` 放 README 描述 adapter 介面語意，避免重踩。
