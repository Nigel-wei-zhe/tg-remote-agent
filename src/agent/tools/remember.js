const session = require('../../utils/session');

const definition = {
    type: 'function',
    function: {
        name: 'remember',
        description: '鎖定重要欄位到 session.locked（淺合併，同 key 覆蓋）。兩種用途：(1) 結構化原文，如 {"title": "...", "body": "..."} 等已確認的最終內容；(2) summary 欄位——用一段自然語言摘要當前任務進度，例如 {"summary": "用戶確認主題為 X，大綱已審，待撰正文"}，下輪 system prompt 優先顯示此摘要，history 原文退為補充參考。一般對話脈絡由 server 自動記錄，不需手動存。',
        parameters: {
            type: 'object',
            properties: {
                fields: {
                    type: 'object',
                    description: '要鎖定的欄位物件，例如 {"title": "...", "body": "..."} 或 {"summary": "任務進度摘要"}',
                },
            },
            required: ['fields'],
        },
    },
};

function run(chatId, fields) {
    try {
        const saved = session.writeLocked(chatId, fields);
        return { ok: true, body: `已鎖定欄位 (locked)：\n${JSON.stringify(saved.locked, null, 2)}` };
    } catch (err) {
        return { ok: false, body: `remember 失敗：${err.message}` };
    }
}

module.exports = { definition, run };
