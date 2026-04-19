const session = require('../../utils/session');

const definition = {
    type: 'function',
    function: {
        name: 'remember',
        description: '鎖定重要結構化欄位到 session.locked（淺合併，同 key 覆蓋）。只寫「用戶已確認、需跨輪保留的最終原文」，例如已審過的標題、完稿內容。一般對話脈絡由 server 自動記錄，不需手動存。',
        parameters: {
            type: 'object',
            properties: {
                fields: {
                    type: 'object',
                    description: '要鎖定的欄位物件，例如 {"title": "...", "body": "..."}',
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
