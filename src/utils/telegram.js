const axios = require('axios');
const chalk = require('chalk');
const { logError } = require('./logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

async function sendMessage(chatId, text) {
    const token = process.env.TELEGRAM_TOKEN;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        const reason = err.response ? err.response.data.description : err.message;
        console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red('發送失敗: ' + reason)}`);
        logError('SEND', reason);
    }
}

function startTyping(chatId) {
    const token = process.env.TELEGRAM_TOKEN;
    const send = () => axios.post(`https://api.telegram.org/bot${token}/sendChatAction`, {
        chat_id: chatId,
        action: 'typing'
    }).catch(() => {});

    send();
    const interval = setInterval(send, 4000);
    return () => clearInterval(interval);
}

module.exports = { sendMessage, startTyping };
