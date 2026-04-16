const { exec } = require('child_process');
const chalk = require('chalk');
const { sendMessage, startTyping } = require('../utils/telegram');
const { logError } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

function handle(chatId, text, sender) {
    const command = text.replace('/run ', '');
    console.log(`${timestamp()} ${chalk.bgYellow.black(' RUN ')} ${chalk.yellow(command)} ${chalk.dim(`@${sender}`)}`);

    const stopTyping = startTyping(chatId);
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        stopTyping();
        let output = stdout || stderr || '（無輸出）';
        if (error) {
            const isTimeout = error.killed && error.signal === 'SIGTERM';
            const errMsg = isTimeout ? `指令逾時（超過 30 秒）：${command}` : error.message;
            console.log(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(errMsg.split('\n')[0])}`);
            logError(`RUN:${command}`, errMsg);
            output = `執行出錯:\n${errMsg}`;
        } else {
            console.log(`${timestamp()} ${chalk.bgGreen.black(' OK  ')} ${chalk.dim(output.split('\n')[0].slice(0, 60))}`);
        }
        const truncated = output.length > 3800 ? output.slice(0, 3800) + '\n...(已截斷)' : output;
        sendMessage(chatId, `💻 指令執行結果:\n\`\`\`\n${truncated}\n\`\`\``);
    });
}

module.exports = { handle };
