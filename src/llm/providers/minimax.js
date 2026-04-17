const axios = require('axios');
const { logOp } = require('../../utils/logger');

const ENDPOINT = 'https://api.minimax.io/v1/text/chatcompletion_v2';

async function chat({ messages, tools, toolChoice }) {
    const apiKey = process.env.MINIMAX_API_KEY;
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';

    const payload = { model, messages };
    if (tools && tools.length) {
        payload.tools = tools;
        payload.tool_choice = toolChoice || 'auto';
    } else if (toolChoice) {
        payload.tool_choice = toolChoice;
    }

    logOp('llm.request', { provider: 'minimax', model, payload });

    const response = await axios.post(ENDPOINT, payload, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        timeout: 120000,
    });

    logOp('llm.response', { provider: 'minimax', data: response.data });

    const choice = response.data.choices?.[0];
    if (!choice) throw new Error('API 未回傳任何結果。');
    return choice.message;
}

module.exports = { chat };
