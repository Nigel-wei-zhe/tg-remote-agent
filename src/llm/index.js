const minimax = require('./providers/minimax');

// 統一介面，未來切換 provider 只需改此處
async function ask(userMessage) {
    const provider = process.env.LLM_PROVIDER || 'minimax';

    if (provider === 'minimax') return minimax.ask(userMessage);

    throw new Error(`未知的 LLM provider: ${provider}`);
}

module.exports = { ask };
