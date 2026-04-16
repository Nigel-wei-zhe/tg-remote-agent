const { exec } = require('child_process');
const chalk = require('chalk');
const { sendMessage } = require('../utils/telegram');
const { logError } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

function handle(chatId, text, sender) {
    const command = text.replace('/run ', '');
    console.log(`${timestamp()} ${chalk.bgYellow.black(' RUN ')} ${chalk.yellow(command)} ${chalk.dim(`@${sender}`)}`);

    exec(command, (error, stdout, stderr) => {
        let output = stdout || stderr || '（無輸出）';
        if (error) {
            console.log(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(error.message.split('\n')[0])}`);
            logError(`RUN:${command}`, error.message);
            output = `執行出錯:\n${error.message}`;
        } else {
            console.log(`${timestamp()} ${chalk.bgGreen.black(' OK  ')} ${chalk.dim(output.split('\n')[0].slice(0, 60))}`);
        }
        const truncated = output.length > 3800 ? output.slice(0, 3800) + '\n...(已截斷)' : output;
        sendMessage(chatId, `💻 指令執行結果:\n\`\`\`\n${truncated}\n\`\`\``);
    });
}

module.exports = { handle };
