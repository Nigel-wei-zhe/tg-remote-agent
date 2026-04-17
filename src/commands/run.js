const chalk = require('chalk');
const shell = require('../agent/tools/shell');
const { sendMessage, startTyping } = require('../utils/telegram');
const { logError, logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

async function handle(chatId, text, sender, userId) {
    const command = text.replace('/run ', '');
    console.log(`${timestamp()} ${chalk.bgYellow.black(' RUN ')} ${chalk.yellow(command)} ${chalk.dim(`@${sender}`)}`);
    logOp('user.message', { chatId, userId, sender, text, route: 'run' });

    const stopTyping = startTyping(chatId);
    const { ok, output } = await shell.run(command);
    stopTyping();

    logOp('tool.result', { command, ok, output, route: 'run' });
    if (!ok) {
        console.log(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(output.split('\n')[0])}`);
        logError(`RUN:${command}`, output);
    } else {
        console.log(`${timestamp()} ${chalk.bgGreen.black(' OK  ')} ${chalk.dim(output.split('\n')[0].slice(0, 60))}`);
    }
    const body = `💻 指令執行結果:\n\`\`\`\n${output}\n\`\`\``;
    await sendMessage(chatId, body);
    logOp('bot.reply', { chatId, text: body, route: 'run' });
}

module.exports = { handle };
