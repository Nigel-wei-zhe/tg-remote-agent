const chalk = require('chalk');
const llm = require('../llm');
const shell = require('./tools/shell');
const readSkill = require('./tools/read_skill');
const webFetch = require('./tools/web_fetch');
const skills = require('./skills');
const { sendMessage, startTyping } = require('../utils/telegram');
const { logError, logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const MAX_ROUNDS = 5;

const BASE_SYSTEM_PROMPT = `你是一個部署在伺服器上的 Telegram AI 助理。

工具使用原則：
- exec_shell：執行 shell 指令。執行後不會再有回合給你總結，請一次下對指令。
- web_fetch：抓取並閱讀網頁內容，適合做研究、查資料、閱讀文章。可連續呼叫多次。
- read_skill：讀取 skill 完整說明。system prompt 列出 skill 時，使用者意圖相關就先 read_skill。

回合規則：
- web_fetch 與 read_skill 屬於讀取類工具，呼叫後會給你下一輪繼續決策。
- exec_shell 屬於執行類工具，呼叫後會立刻把結果給使用者並結束本次任務。
- 純聊天、解釋概念、無需伺服器狀態時，直接用文字回答即可。

預算限制（重要）：
- 每則使用者訊息最多 ${MAX_ROUNDS} 輪 LLM 互動（含你現在這次），撞到上限會強制結束並要求你用現有資料總結。
- 研究類任務：web_fetch 抓 2~3 個來源就該開始寫回覆，**不要一直加新來源**，寧可資料少一點、先把內容產出。
- 每輪盡量精準，一個 tool call 能解決的就別拆成多個。

回答使用繁體中文。`;

async function handle(chatId, text, sender, userId) {
    logOp('user.message', { chatId, userId, sender, text });
    console.log(`${timestamp()} ${chalk.bgBlue.white(' AGENT ')} ${chalk.cyan(text.slice(0, 60))} ${chalk.dim(`@${sender}`)}`);

    const stopTyping = startTyping(chatId);
    try {
        const availableSkills = skills.load();
        const systemPrompt = BASE_SYSTEM_PROMPT + skills.indexText();
        const tools = [shell.definition, webFetch.definition];
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
                    await handleReadSkill({ chatId, call, args, round, messages });
                } else if (name === 'web_fetch') {
                    await handleWebFetch({ chatId, call, args, round, messages });
                } else if (name === 'exec_shell') {
                    await handleExecShell({ chatId, call, args, round });
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

        await forceFinalSummary({ chatId, messages, tools });
    } catch (err) {
        console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(err.message)}`);
        logError('AGENT', err.message);
        await sendMessage(chatId, `Agent 錯誤：${err.message}`);
    } finally {
        stopTyping();
    }
}

async function handleReadSkill({ chatId, call, args, round, messages }) {
    const skillName = args.name || '';
    console.log(`${timestamp()} ${chalk.bgMagenta.white(' SKILL ')} ${chalk.magenta(skillName)}`);
    logOp('tool.call', { name: 'read_skill', args, round });

    const pre = `📖 讀取 skill: \`${skillName}\``;
    await sendMessage(chatId, pre);
    logOp('bot.reply', { chatId, text: pre, phase: 'skill.read', round });

    const { ok, body } = readSkill.run(skillName);
    logOp('tool.result', { name: 'read_skill', skillName, ok, round });
    messages.push({ role: 'tool', tool_call_id: call.id, content: body });
}

async function handleWebFetch({ chatId, call, args, round, messages }) {
    const url = args.url || '';
    console.log(`${timestamp()} ${chalk.bgCyan.black(' FETCH ')} ${chalk.cyan(url)}`);
    logOp('tool.call', { name: 'web_fetch', url, round });

    const pre = `🌐 抓取網頁: ${url}`;
    await sendMessage(chatId, pre);
    logOp('bot.reply', { chatId, text: pre, phase: 'fetch.pre', round });

    const { ok, text, status } = await webFetch.run(url);
    logOp('tool.result', { name: 'web_fetch', url, ok, status, length: text.length, round });
    messages.push({ role: 'tool', tool_call_id: call.id, content: text });
}

async function handleExecShell({ chatId, call, args, round }) {
    const command = args.command || '';
    console.log(`${timestamp()} ${chalk.bgYellow.black(' TOOL ')} ${chalk.yellow(command)}`);
    logOp('tool.call', { name: 'exec_shell', command, round });

    const pre = `🔧 執行中: \`${command}\``;
    await sendMessage(chatId, pre);
    logOp('bot.reply', { chatId, text: pre, phase: 'tool.pre', round });

    const { ok, output } = await shell.run(command);
    logOp('tool.result', { name: 'exec_shell', command, ok, output, round });

    const header = ok ? '💻 指令執行結果' : '⚠️ 指令執行失敗';
    const body = `${header} (\`${command}\`):\n\`\`\`\n${output}\n\`\`\``;
    await sendMessage(chatId, body);
    logOp('bot.reply', { chatId, text: body, phase: 'tool.result', round });
}

async function forceFinalSummary({ chatId, messages, tools }) {
    logOp('agent.max_rounds', { chatId });
    console.log(`${timestamp()} ${chalk.bgRed.white(' MAX ')} ${chalk.red(`撞 ${MAX_ROUNDS} 輪上限，強制總結`)}`);

    messages.push({
        role: 'user',
        content: `[系統提示] 已達互動上限 ${MAX_ROUNDS} 輪，禁止再呼叫任何工具。請根據目前已蒐集的資料，直接用繁體中文文字回覆。若資料不足以完整回答，也請誠實說明並給出目前能給的最佳回覆。`,
    });

    const finalReply = await llm.chat({ messages, tools, toolChoice: 'none' });
    const content = (finalReply.content || '').trim();
    const body = content
        ? `⚠️ 已達互動上限，以下為根據現有資料整理的回覆：\n\n${content}`
        : `⚠️ 已達互動上限 ${MAX_ROUNDS}，且無法從現有資料產出總結。`;
    await sendMessage(chatId, body);
    logOp('bot.reply', { chatId, text: body, phase: 'max_rounds.summary' });
}

function safeParse(s) {
    try { return JSON.parse(s || '{}'); } catch { return {}; }
}

module.exports = { handle };
