# 音樂生成指令 (`/music`)

## 角色
獨立 Telegram 指令，繞過 Agent Loop 呼叫 MiniMax lyrics/music API，完成後回傳歌詞、時長與 Telegram audio。

## 路由
- `server.js`: `/music`、`/music ...` → `src/commands/music.js`
- 不寫入 session，不進入工具決策循環。

## 輸入格式
```text
/music <風格描述>
/music --instrumental <風格描述>
/music <風格描述>
<歌詞>
```
- 單行非純音樂：先呼叫 lyrics API 產歌詞，再送 music API。
- 多行非純音樂：第一行為 `prompt`，後續為 `lyrics`。
- `--instrumental` / `--inst`: `is_instrumental: true`，不送歌詞。

## MiniMax
- Lyrics Endpoint: `POST https://api.minimax.io/v1/lyrics_generation`
- Endpoint: `POST https://api.minimax.io/v1/music_generation`
- Model: `MINIMAX_MUSIC_MODEL`，預設 `music-2.6`
- Auth: `Bearer {MINIMAX_API_KEY}`
- Audio: 預設 `44100Hz / 256kbps / mp3`
- Output: `hex`，解碼為 buffer 上傳，以控制檔名。

## Telegram
- 缺歌詞時先送 lyrics progress，再送 music progress。
- 生成期間使用 `upload_audio` chat action。
- 完成後先送結果訊息（歌名、style、時長、歌詞），再用 `sendAudio` 傳 multipart buffer。
- 檔名格式：`lazyhole-<title-or-prompt>-<YYYYMMDD-HHMMSS>.<ext>`；非隨機。
