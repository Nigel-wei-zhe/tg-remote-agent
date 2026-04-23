# 直接讀檔 (`read_file`)

## 功能
- 讀取本地文字檔並回傳內容給 LLM，輸出附行號（`<lineNum>\t<line>`）與檔案資訊。
- 支援 `offset` (1-based 起始行) 與 `limit` (行數) 分段讀取。
- `path` 可用絕對路徑，或搭配 `cwd` 的相對路徑。
- 自動拒絕二進位檔（偵測到 NULL byte 即視為二進位）與目錄。
- 大小限制：預設 20KB（超出以行為單位截斷），可用 `READ_FILE_MAX_BYTES` 調整；單行超過 2000 字元另外截斷。

## 目的
- 取代 `exec_shell` 的 `cat / head / tail`：避開 shell 3800 字元上限、黑名單誤傷、無分頁能力等問題。
- 把檔案內容穩定地丟給 LLM 分析或引用（含行號方便後續定位）。

## Tool 介面
```js
read_file({ path, cwd?, offset?, limit? })
```

預設 `limit = 500`。

## 回傳
成功：
```
檔案：<absolute-path>
總行數：<N>，本次讀取：<start>-<end>[（位元組截斷）]

  <lineNum>\t<line>
  ...
```

失敗：`read_file 失敗：<message>`（檔案不存在 / 無權限 / 目錄 / 二進位檔）。

## 實作
- 模組：`src/agent/tools/read_file.js`
- 讀取：`fs.readFileSync` → UTF-8 轉文字 → 以 `\r?\n` 切行。
- 截斷：組好帶行號字串後，若超過 `READ_FILE_MAX_BYTES` 以最後一個換行符切齊並附提示。

## 使用原則
- 需檢視檔案內容給 LLM 使用時，優先用 `read_file`。
- `exec_shell` 只在需要 shell 副作用（git、build、grep pipeline）時才用。
- 長檔請以 `offset + limit` 分段讀，不要一次讀全檔。
