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

module.exports = { sendMessage };
