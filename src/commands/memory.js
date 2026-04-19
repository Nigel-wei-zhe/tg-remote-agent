const chalk = require('chalk');
const session = require('../utils/session');
const { sendMessage } = require('../utils/telegram');
const { logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

async function handle(chatId, text, sender, userId) {
    const sub = text.replace(/^\/memory\s*/, '').trim();
    console.log(`${timestamp()} ${chalk.bgBlue.white(' MEM ')} ${chalk.blue(sub || 'show')} ${chalk.dim(`@${sender}`)}`);
    logOp('user.message', { chatId, userId, sender, text, route: 'memory' });

    if (sub === 'clear') {
        session.clearSession(chatId);
        const body = '🧹 已清除當前 session。';
        await sendMessage(chatId, body);
        logOp('bot.reply', { chatId, text: body, route: 'memory', action: 'clear' });
        return;
    }

    const data = session.loadSession(chatId);
    const body = data
        ? `🧠 目前 session：\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
        : '🧠 當前沒有 session（或已過期）。';
    await sendMessage(chatId, body);
    logOp('bot.reply', { chatId, text: body, route: 'memory', action: 'show' });
}

module.exports = { handle };
