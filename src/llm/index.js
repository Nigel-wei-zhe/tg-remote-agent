const minimax = require('./providers/minimax');

async function chat(args) {
    const provider = process.env.LLM_PROVIDER || 'minimax';
    if (provider === 'minimax') return minimax.chat(args);
    throw new Error(`未知的 LLM provider: ${provider}`);
}

module.exports = { chat };
