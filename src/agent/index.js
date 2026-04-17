const chalk = require('chalk');
const llm = require('../llm');
const shell = require('./tools/shell');
const readSkill = require('./tools/read_skill');
const skills = require('./skills');
const { sendMessage, startTyping } = require('../utils/telegram');
const { logError, logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const MAX_ROUNDS = 5;

const BASE_SYSTEM_PROMPT = `你是一個部署在伺服器上的 Telegram 助理。
- 需要讀取系統資訊、檔案、執行指令時，呼叫 exec_shell 工具。
- 純聊天、解釋概念、無需伺服器狀態時，直接用文字回答。
- 若 system prompt 列出了 skills，且使用者意圖可能對應某個 skill，先呼叫 read_skill 取得完整說明，再決定執行哪個指令。
- exec_shell 執行後不會再有回合給你總結，請一次呼叫正確的指令。
- 回答使用繁體中文。`;

async function handle(chatId, text, sender, userId) {
    logOp('user.message', { chatId, userId, sender, text });
    console.log(`${timestamp()} ${chalk.bgBlue.white(' AGENT ')} ${chalk.cyan(text.slice(0, 60))} ${chalk.dim(`@${sender}`)}`);

    const stopTyping = startTyping(chatId);
    try {
        const availableSkills = skills.load();
        const systemPrompt = BASE_SYSTEM_PROMPT + skills.indexText();
        const tools = [shell.definition];
        if (availableSkills.length > 0) tools.push(readSkill.definition);

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
        ];

        for (let round = 1; round <= MAX_ROUNDS; round++) {
            const reply = await llm.chat({ messages, tools });
            messages.push(reply);

            const content = (reply.content || '').trim();
            const toolCalls = reply.tool_calls || [];

            if (content) {
                const narration = toolCalls.length > 0 ? `💬 ${content}` : content;
                await sendMessage(chatId, narration);
                logOp('bot.reply', { chatId, text: narration, phase: 'llm.content', round });
                console.log(`${timestamp()} ${chalk.bgGreen.black(' SAY ')} ${chalk.dim(content.slice(0, 60))}`);
            }

            if (toolCalls.length === 0) {
                if (!content) {
                    const fallback = '（LLM 沒有回覆）';
                    await sendMessage(chatId, fallback);
                    logOp('bot.reply', { chatId, text: fallback, phase: 'empty', round });
                }
                return;
            }

            let shouldTerminate = false;
            for (const call of toolCalls) {
                const name = call.function?.name;
                const args = safeParse(call.function?.arguments);

                if (name === 'read_skill') {
                    const skillName = args.name || '';
                    console.log(`${timestamp()} ${chalk.bgMagenta.white(' SKILL ')} ${chalk.magenta(skillName)}`);
                    logOp('tool.call', { name, args, round });

                    const pre = `📖 讀取 skill: \`${skillName}\``;
                    await sendMessage(chatId, pre);
                    logOp('bot.reply', { chatId, text: pre, phase: 'skill.read', round });

                    const { ok, body } = readSkill.run(skillName);
                    logOp('tool.result', { name, skillName, ok, round });
                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: body,
                    });
                } else if (name === 'exec_shell') {
                    const command = args.command || '';
                    console.log(`${timestamp()} ${chalk.bgYellow.black(' TOOL ')} ${chalk.yellow(command)}`);
                    logOp('tool.call', { name, command, round });

                    const pre = `🔧 執行中: \`${command}\``;
                    await sendMessage(chatId, pre);
                    logOp('bot.reply', { chatId, text: pre, phase: 'tool.pre', round });

                    const { ok, output } = await shell.run(command);
                    logOp('tool.result', { command, ok, output, round });

                    const header = ok ? '💻 指令執行結果' : '⚠️ 指令執行失敗';
                    const body = `${header} (\`${command}\`):\n\`\`\`\n${output}\n\`\`\``;
                    await sendMessage(chatId, body);
                    logOp('bot.reply', { chatId, text: body, phase: 'tool.result', round });

                    shouldTerminate = true;
                } else {
                    logOp('tool.unknown', { name, round });
                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: `Unknown tool: ${name}`,
                    });
                }
            }

            if (shouldTerminate) return;
        }

        const overflow = `（超過最大互動輪數 ${MAX_ROUNDS}，已中止）`;
        await sendMessage(chatId, overflow);
        logOp('bot.reply', { chatId, text: overflow, phase: 'max_rounds' });
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
