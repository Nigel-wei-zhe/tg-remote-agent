const minimax = require('./providers/minimax');

function getProvider() {
    const provider = process.env.LLM_PROVIDER || 'minimax';
    if (provider === 'minimax') return minimax;
    throw new Error(`未知的 LLM provider: ${provider}`);
}

async function chat(args) { return getProvider().chat(args); }
async function chatStream(args, onToken) { return getProvider().chatStream(args, onToken); }

module.exports = { chat, chatStream };
