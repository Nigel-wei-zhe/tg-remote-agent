const chalk = require('chalk');
const shell = require('../agent/tools/shell');
const { sendMessage, startTyping } = require('../utils/telegram');
const { logError, logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

function stripQuotes(value) {
    if (!value) return value;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        return value.slice(1, -1);
    }
    return value;
}

function parseRunInput(text) {
    const body = text.replace(/^\/run(?:\s+)?/, '').trim();
    if (!body) {
        return { ok: false, output: '用法：`/run <command>` 或 `/run --cwd <path> -- <command>`' };
    }

    const cwdMatch = body.match(/^--cwd\s+("[^"]+"|'[^']+'|\S+)\s+--\s+([\s\S]+)$/);
    if (!cwdMatch) {
        return { ok: true, command: body };
    }

    const cwd = stripQuotes(cwdMatch[1]);
    const command = cwdMatch[2].trim();
    if (!command) {
        return { ok: false, output: '缺少要執行的指令。用法：`/run --cwd <path> -- <command>`' };
    }

    return { ok: true, command, cwd };
}

async function handle(chatId, text, sender, userId) {
    const parsed = parseRunInput(text);
    if (!parsed.ok) {
        await sendMessage(chatId, `⚠️ ${parsed.output}`);
        return;
    }

    const { command, cwd } = parsed;
    const location = cwd ? ` @ ${cwd}` : '';
    console.log(`${timestamp()} ${chalk.bgYellow.black(' RUN ')} ${chalk.yellow(command)}${chalk.dim(location)} ${chalk.dim(`@${sender}`)}`);
    logOp('user.message', { chatId, userId, sender, text, route: 'run' });

    const stopTyping = startTyping(chatId);
    const { ok, output, cwd: resolvedCwd } = await shell.run(command, { cwd });
    stopTyping();

    logOp('tool.result', { command, cwd: resolvedCwd || cwd || undefined, ok, output, route: 'run' });
    if (!ok) {
        console.log(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(output.split('\n')[0])}`);
        logError(`RUN:${command}`, output);
    } else {
        console.log(`${timestamp()} ${chalk.bgGreen.black(' OK  ')} ${chalk.dim(output.split('\n')[0].slice(0, 60))}`);
    }
    const cwdLine = resolvedCwd ? `\n📁 cwd: \`${resolvedCwd}\`` : '';
    const reply = `💻 指令執行結果${cwdLine}\n\`\`\`\n${output}\n\`\`\``;
    await sendMessage(chatId, reply);
    logOp('bot.reply', { chatId, text: reply, route: 'run' });
}

module.exports = { handle };
