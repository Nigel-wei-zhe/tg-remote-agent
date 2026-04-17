const chalk = require('chalk');
const llm = require('../llm');
const shell = require('./tools/shell');
const { sendMessage, startTyping } = require('../utils/telegram');
const { logError, logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

const SYSTEM_PROMPT = `你是一個部署在伺服器上的 Telegram 助理。
- 需要讀取系統資訊、檔案、執行指令時，呼叫 exec_shell 工具。
- 純聊天、解釋概念、無需伺服器狀態時，直接用文字回答。
- 回答使用繁體中文。`;

async function handle(chatId, text, sender, userId) {
    logOp('user.message', { chatId, userId, sender, text });
    console.log(`${timestamp()} ${chalk.bgBlue.white(' AGENT ')} ${chalk.cyan(text.slice(0, 60))} ${chalk.dim(`@${sender}`)}`);

    const stopTyping = startTyping(chatId);
    try {
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text },
        ];
        const reply = await llm.chat({ messages, tools: [shell.definition] });

        const toolCalls = reply.tool_calls || [];
        const content = (reply.content || '').trim();

        if (content) {
            const narration = toolCalls.length > 0 ? `💬 ${content}` : content;
            await sendMessage(chatId, narration);
            logOp('bot.reply', { chatId, text: narration, phase: 'llm.content' });
            console.log(`${timestamp()} ${chalk.bgGreen.black(' SAY ')} ${chalk.dim(content.slice(0, 60))}`);
        }

        if (toolCalls.length > 0) {
            for (const call of toolCalls) {
                const args = safeParse(call.function?.arguments);
                const command = args.command || '';
                console.log(`${timestamp()} ${chalk.bgYellow.black(' TOOL ')} ${chalk.yellow(command)}`);
                logOp('tool.call', { name: call.function?.name, command });

                const pre = `🔧 執行中: \`${command}\``;
                await sendMessage(chatId, pre);
                logOp('bot.reply', { chatId, text: pre, phase: 'tool.pre' });

                const { ok, output } = await shell.run(command);
                logOp('tool.result', { command, ok, output });

                const header = ok ? '💻 指令執行結果' : '⚠️ 指令執行失敗';
                const body = `${header} (\`${command}\`):\n\`\`\`\n${output}\n\`\`\``;
                await sendMessage(chatId, body);
                logOp('bot.reply', { chatId, text: body, phase: 'tool.result' });
            }
        } else if (!content) {
            const fallback = '（LLM 沒有回覆）';
            await sendMessage(chatId, fallback);
            logOp('bot.reply', { chatId, text: fallback, phase: 'empty' });
        }
    } catch (err) {
        console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(err.message)}`);
        logError('AGENT', err.message);
        await sendMessage(chatId, `Agent 錯誤：${err.message}`);
    } finally {
        stopTyping();
    }
}

function safeParse(s) {
    try { return JSON.parse(s || '{}'); } catch { return {}; }
}

module.exports = { handle };
