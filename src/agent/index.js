const chalk = require('chalk');
const llm = require('../llm');
const shell = require('./tools/shell');
const readSkill = require('./tools/read_skill');
const webFetch = require('./tools/web_fetch');
const remember = require('./tools/remember');
const endSession = require('./tools/end_session');
const skills = require('./skills');
const sessionStore = require('../utils/session');
const { sendMessage, startTyping, createStreamer } = require('../utils/telegram');
const { logError, logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const MAX_ROUNDS = 5;
const LOCKED_PREVIEW_CHARS = 300;

const BASE_SYSTEM_PROMPT = `你是一個部署在伺服器上的 Telegram AI 助理。

工具使用原則：
- exec_shell：執行 shell 指令。執行後不會再有回合給你總結，請一次下對指令。若使用者指定專案或資料夾，優先用 cwd 參數，不要把 cd 寫進 command。
- web_fetch：抓取並閱讀網頁內容，適合做研究、查資料、閱讀文章。可連續呼叫多次。
- read_skill：讀取 skill 完整說明。system prompt 列出 skill 時，使用者意圖相關就先 read_skill。
- remember：把用戶已確認、要跨輪保留的結構化欄位寫入 session.locked（如已審過的標題、完稿）。一般對話脈絡 server 會自動記錄，不需手動存。
- end_session：任務成功或用戶明確取消時呼叫，清掉 session；之後可再回一段收尾文字。

對話狀態：
- 若 system prompt 含「[對話狀態]」區塊，代表本輪是既有任務延續。優先把用戶訊息理解為對該狀態的回應（同意／修改／取消），而不是全新請求。

回合規則：
- web_fetch、read_skill、remember、end_session 屬於讀取類工具，呼叫後會給你下一輪繼續決策。
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

    sessionStore.appendHistory(chatId, 'user', text);

    const stopTyping = startTyping(chatId);
    try {
        const availableSkills = skills.load();
        const session = sessionStore.loadSession(chatId);
        const systemPrompt = BASE_SYSTEM_PROMPT + skills.indexText() + renderSessionPrompt(session);
        const tools = [
            shell.definition,
            webFetch.definition,
            remember.definition,
            endSession.definition,
        ];
        if (availableSkills.length > 0) tools.push(readSkill.definition);

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
        ];

        for (let round = 1; round <= MAX_ROUNDS; round++) {
            const streamer = createStreamer(chatId);
            const reply = await llm.chatStream({ messages, tools }, streamer.onToken);
            messages.push(reply);

            const content = (reply.content || '').trim();
            const toolCalls = reply.tool_calls || [];

            if (content) {
                await streamer.finalize();
                logOp('bot.reply', { chatId, text: content, phase: 'llm.content', round });
                console.log(`${timestamp()} ${chalk.bgGreen.black(' SAY ')} ${chalk.dim(content.slice(0, 60))}`);
                sessionStore.appendHistory(chatId, 'assistant', content);
            } else {
                streamer.discard();
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
                } else if (name === 'remember') {
                    await handleRemember({ chatId, call, args, round, messages });
                } else if (name === 'end_session') {
                    await handleEndSession({ chatId, call, round, messages });
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
    if (ok) sessionStore.markActiveSkill(chatId, skillName);
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

async function handleRemember({ chatId, call, args, round, messages }) {
    const fields = args.fields || {};
    const keys = Object.keys(fields);
    console.log(`${timestamp()} ${chalk.bgBlue.white(' MEM ')} ${chalk.blue(`remember ${keys.join(',')}`)}`);
    logOp('tool.call', { name: 'remember', keys, round });

    const pre = `🧠 鎖定欄位: ${keys.join(', ') || '(空)'}`;
    await sendMessage(chatId, pre);
    logOp('bot.reply', { chatId, text: pre, phase: 'mem.remember', round });

    const { ok, body } = remember.run(chatId, fields);
    logOp('tool.result', { name: 'remember', keys, ok, round });
    messages.push({ role: 'tool', tool_call_id: call.id, content: body });
}

async function handleEndSession({ chatId, call, round, messages }) {
    console.log(`${timestamp()} ${chalk.bgBlue.white(' MEM ')} ${chalk.blue('end_session')}`);
    logOp('tool.call', { name: 'end_session', round });

    const { ok, body } = endSession.run(chatId);
    logOp('tool.result', { name: 'end_session', ok, round });
    messages.push({ role: 'tool', tool_call_id: call.id, content: body });
}

async function handleExecShell({ chatId, call, args, round }) {
    const command = args.command || '';
    const cwd = args.cwd || '';
    const location = cwd ? ` @ ${cwd}` : '';
    console.log(`${timestamp()} ${chalk.bgYellow.black(' TOOL ')} ${chalk.yellow(command)}${chalk.dim(location)}`);
    logOp('tool.call', { name: 'exec_shell', command, cwd: cwd || undefined, round });

    const pre = cwd
        ? `🔧 執行中: \`${command}\`\n📁 cwd: \`${cwd}\``
        : `🔧 執行中: \`${command}\``;
    await sendMessage(chatId, pre);
    logOp('bot.reply', { chatId, text: pre, phase: 'tool.pre', round });

    const { ok, output, cwd: resolvedCwd } = await shell.run(command, { cwd });
    logOp('tool.result', { name: 'exec_shell', command, cwd: resolvedCwd || cwd || undefined, ok, output, round });

    const header = ok ? '💻 指令執行結果' : '⚠️ 指令執行失敗';
    const cwdLine = resolvedCwd ? `\n📁 cwd: \`${resolvedCwd}\`` : '';
    const body = `${header} (\`${command}\`)${cwdLine}\n\`\`\`\n${output}\n\`\`\``;
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

    await sendMessage(chatId, `⚠️ 已達互動上限，整理回覆中…`);
    const streamer = createStreamer(chatId);
    const finalReply = await llm.chatStream({ messages, tools, toolChoice: 'none' }, streamer.onToken);
    const content = (finalReply.content || '').trim();
    if (content) {
        await streamer.finalize();
    } else {
        streamer.discard();
        await sendMessage(chatId, `⚠️ 已達互動上限 ${MAX_ROUNDS}，且無法從現有資料產出總結。`);
    }
    logOp('bot.reply', { chatId, text: content, phase: 'max_rounds.summary' });
    if (content) sessionStore.appendHistory(chatId, 'assistant', content);
}

function safeParse(s) {
    try { return JSON.parse(s || '{}'); } catch { return {}; }
}

function renderSessionPrompt(session) {
    if (!session) return '';
    const lines = ['\n\n[對話狀態]'];
    if (session.activeSkill) lines.push(`當前進行中的 skill: ${session.activeSkill}`);

    const lockedKeys = Object.keys(session.locked || {});
    if (lockedKeys.length > 0) {
        lines.push('已鎖定欄位 (locked):');
        for (const k of lockedKeys) {
            const v = session.locked[k];
            const preview = typeof v === 'string'
                ? (v.length > LOCKED_PREVIEW_CHARS ? `${v.slice(0, LOCKED_PREVIEW_CHARS)}…` : v)
                : JSON.stringify(v);
            lines.push(`  ${k}: ${preview}`);
        }
    }

    if ((session.history || []).length > 0) {
        lines.push('最近對話 (舊→新):');
        for (const h of session.history) lines.push(`  ${h.role}: ${h.content}`);
    }

    lines.push('若以上區塊存在，優先把用戶訊息理解為對該狀態的延續回應；任務完成或用戶明確取消時呼叫 end_session。');
    return lines.join('\n');
}

module.exports = { handle };
