const skills = require('../skills');

const definition = {
    type: 'function',
    function: {
        name: 'read_skill',
        description: '讀取指定 skill 的完整說明。當 system prompt 列出的某個 skill 可能與當前任務相關時呼叫此工具拿到詳細用法，再決定如何執行。',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: '要讀取的 skill 名稱（對應 system prompt 列表中的 name）' },
            },
            required: ['name'],
        },
    },
};

function run(name) {
    const skill = skills.get(name);
    if (!skill) {
        return { ok: false, body: `找不到 skill: ${name}。可用清單請參考 system prompt。` };
    }
    return { ok: true, body: skill.body };
}

module.exports = { definition, run };
