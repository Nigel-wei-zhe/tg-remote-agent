const session = require('../../utils/session');
const { archiveCurrentSession } = require('../../utils/session-archive');

const definition = {
    type: 'function',
    function: {
        name: 'end_session',
        description: '清除當前 session（activeSkill、history、locked 全清）。任務成功（例：文章發布完成）或用戶明確取消時呼叫。呼叫後可再回一段收尾文字。',
        parameters: {
            type: 'object',
            properties: {},
        },
    },
};

async function run(chatId, options = {}) {
    try {
        const result = await archiveCurrentSession(chatId, {
            trigger: 'end_session',
            onProgress: options.onProgress,
        });
        if (!result.archived) session.clearSession(chatId);
        return { ok: true, body: '已結束 session。' };
    } catch (err) {
        return { ok: false, body: `end_session 失敗：${err.message}` };
    }
}

module.exports = { definition, run };
