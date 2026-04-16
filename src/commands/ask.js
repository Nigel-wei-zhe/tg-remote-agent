const chalk = require('chalk');
const llm = require('../llm');
const { sendMessage } = require('../utils/telegram');
const { logError } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

async function handle(chatId, text, sender) {
    const question = text.replace('/ask ', '').trim();
    console.log(`${timestamp()} ${chalk.bgMagenta.white(' ASK ')} ${chalk.magenta(question.slice(0, 60))} ${chalk.dim(`@${sender}`)}`);
    try {
        const answer = await llm.ask(question);
        await sendMessage(chatId, answer);
        console.log(`${timestamp()} ${chalk.bgGreen.black(' OK  ')} ${chalk.dim(answer.slice(0, 60))}`);
    } catch (err) {
        console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(err.message)}`);
        logError('ASK', err.message);
        await sendMessage(chatId, `LLM 錯誤：${err.message}`);
    }
}

module.exports = { handle };
