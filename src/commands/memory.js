const chalk = require('chalk');
const session = require('../utils/session');
const memoryDb = require('../utils/memory-db');
const { renderSessionPrompt } = require('../utils/session-prompt');
const { archiveCurrentSession, archiveExpiredSession } = require('../utils/session-archive');
const { sendMessage } = require('../utils/telegram');
const { logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const PREVIEW_CHARS = session.COMPACT_TRIGGER_CHARS;

async function handle(chatId, text, sender, userId) {
    const sub = text.replace(/^\/memory\s*/, '').trim();
    console.log(`${timestamp()} ${chalk.bgBlue.white(' MEM ')} ${chalk.blue(sub || 'show')} ${chalk.dim(`@${sender}`)}`);
    logOp('user.message', { chatId, userId, sender, text, route: 'memory' });

    if (sub === 'clear' || sub === 'clear --drop') {
        const drop = sub.endsWith('--drop');
        let result = { archived: false, reason: 'drop' };
        if (!drop) {
            try {
                result = await archiveCurrentSession(chatId, {
                    trigger: 'clear',
                    userId,
                    onProgress: (event) => sendMemoryArchiveProgress(chatId, event, 'clear'),
                });
            } catch (err) {
                const body = `⚠️ 記憶歸檔失敗，session 已保留。\n原因：${err.message}\n若要直接丟棄可用 /memory clear --drop`;
                await sendMessage(chatId, body);
                logOp('bot.reply', { chatId, text: body, route: 'memory', action: 'clear_failed' });
                return;
            }
        }
        if (drop || !result.archived) session.clearSession(chatId);
        const body = formatClearResult(result, drop);
        await sendMessage(chatId, body);
        logOp('bot.reply', { chatId, text: body, route: 'memory', action: 'clear' });
        return;
    }

    if (sub === 'history' || sub.startsWith('history ')) {
        const body = formatHistory(chatId, sub.replace(/^history\s*/, '').trim());
        await sendMessage(chatId, body);
        logOp('bot.reply', { chatId, text: body, route: 'memory', action: 'history' });
        return;
    }

    await archiveExpiredSession(chatId, {
        userId,
        onProgress: (event) => sendMemoryArchiveProgress(chatId, event, 'ttl'),
    });
    const data = session.loadSession(chatId);
    const body = data ? formatMemoryReport(data) : '🧠 當前沒有 session（或已過期）。';
    await sendMessage(chatId, body);
    logOp('bot.reply', { chatId, text: body, route: 'memory', action: 'show' });
}

async function sendMemoryArchiveProgress(chatId, event, action) {
    const text = formatArchiveProgress(event);
    if (!text) return;
    await sendMessage(chatId, text);
    logOp('bot.reply', { chatId, text, route: 'memory', action: `archive_${action}_${event.stage}` });
}

function formatArchiveProgress(event) {
    if (event.stage === 'ttl_detected') {
        return '🗂️ 先前 session 已過期，正在整理成記憶摘要。';
    }
    if (event.stage === 'summarizing') {
        const size = event.rawChars ? `（約 ${event.rawChars} 字，${event.historyCount || 0} 則對話）` : '';
        return `🧠 正在請 LLM 摘要目前 session ${size}。`;
    }
    if (event.stage === 'writing') {
        return '💾 摘要完成，正在寫入記憶歷史。';
    }
    if (event.stage === 'done') {
        return `✅ 記憶已歸檔 #${event.id}。`;
    }
    if (event.stage === 'failed') {
        return `⚠️ 記憶歸檔失敗，已保留原 session。\n原因：${event.reason || '未知原因'}`;
    }
    return '';
}

function formatClearResult(result, drop) {
    if (drop) return '🧹 已清除當前 session（未歸檔）。';
    if (result.archived) return `🧹 已歸檔並清除當前 session。\narchiveId：${result.id}`;
    if (result.reason === 'missing') return '🧠 當前沒有 session。';
    if (result.reason === 'empty') return '🧹 已清除空 session（無內容可歸檔）。';
    return `🧹 已清除當前 session（未歸檔：${result.reason || '未知原因'}）。`;
}

function formatHistory(chatId, args) {
    if (!args) return formatHistoryList(memoryDb.listArchives(chatId, 10));

    if (/^\d+$/.test(args)) {
        const row = memoryDb.getArchive(chatId, args);
        return row ? formatHistoryDetail(row) : `🗂 找不到記憶歷史 #${args}`;
    }

    const search = args.replace(/^search\s*/, '').trim();
    if (!search) return formatHistoryList(memoryDb.listArchives(chatId, 10));
    return formatHistoryList(memoryDb.searchArchives(chatId, search, 10), `搜尋：${search}`);
}

function formatHistoryList(rows, titleSuffix = '') {
    if (!rows.length) return titleSuffix ? `🗂 記憶歷史\n${titleSuffix}\n\n沒有符合的歸檔。` : '🗂 目前沒有記憶歷史。';
    const lines = ['🗂 記憶歷史'];
    if (titleSuffix) lines.push(titleSuffix);
    lines.push('');
    for (const row of rows) {
        lines.push(`#${row.id} ${formatDate(row.archivedAt)} ${row.trigger}${row.activeSkill ? ` ${row.activeSkill}` : ''}`);
        lines.push(previewOneLine(row.summary, 180));
        lines.push('');
    }
    lines.push('指令：/memory history <id> 查看完整摘要；/memory history search <關鍵字> 搜尋。');
    return lines.join('\n').trim();
}

function formatHistoryDetail(row) {
    return [
        `🗂 記憶歷史 #${row.id}`,
        '',
        `sessionId：${row.sessionId}`,
        `trigger：${row.trigger}`,
        `activeSkill：${row.activeSkill || '無'}`,
        `startedAt：${formatDate(row.startedAt)}`,
        `endedAt：${formatDate(row.endedAt)}`,
        `archivedAt：${formatDate(row.archivedAt)}`,
        `history：${row.historyCount} 則，原始約 ${row.rawChars} 字`,
        '',
        '摘要',
        '```text',
        row.summary || '（無）',
        '```',
    ].join('\n');
}

function formatMemoryReport(data) {
    const prompt = renderSessionPrompt(data).trim();
    const history = Array.isArray(data.history) ? data.history : [];
    const locked = data.locked || {};
    const lockedKeys = Object.keys(locked);
    const historyChars = history.reduce((sum, item) => sum + String(item.content || '').length, 0);
    const expiresAt = getExpiresAt(data);
    const promptTitle = prompt.length > session.COMPACT_TRIGGER_CHARS
        ? '📤 目前記憶區塊（已超限，下次會先壓縮後送出）'
        : '📤 目前會送進 LLM 的記憶';
    const promptState = prompt.length > session.COMPACT_TRIGGER_CHARS
        ? `超過安全上限，下一次自然語言訊息會先壓縮 (${prompt.length}/${session.COMPACT_TRIGGER_CHARS})`
        : `未超限 (${prompt.length}/${session.COMPACT_TRIGGER_CHARS})`;

    return [
        '🧠 目前記憶狀態',
        '',
        `狀態：有效`,
        `最後更新：${formatDate(data.updatedAt)}`,
        `預計過期：${formatDate(expiresAt)}（約 ${formatDuration(expiresAt - Date.now())} 後）`,
        `壓縮狀態：${promptState}`,
        `activeSkill：${data.activeSkill || '無'}`,
        `locked：${lockedKeys.length ? lockedKeys.join(', ') : '無'}`,
        `history：${history.length} 則，約 ${historyChars} 字`,
        '',
        promptTitle,
        '```text',
        preview(prompt || '（無）', PREVIEW_CHARS),
        '```',
        '',
        '指令：/memory clear 可清除目前 session。',
    ].join('\n');
}

function previewOneLine(text, limit) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    return source.length <= limit ? source : `${source.slice(0, limit)}…`;
}

function getExpiresAt(data) {
    const updatedAt = Date.parse(data.updatedAt || '');
    return Number.isFinite(updatedAt) ? updatedAt + session.IDLE_TTL_MS : Date.now();
}

function formatDate(value) {
    const time = typeof value === 'number' ? value : Date.parse(value || '');
    if (!Number.isFinite(time)) return '未知';
    return new Date(time).toLocaleString('zh-TW', { hour12: false });
}

function formatDuration(ms) {
    const safeMs = Math.max(0, ms);
    const totalSeconds = Math.ceil(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;
        return restMinutes ? `${hours} 小時 ${restMinutes} 分鐘` : `${hours} 小時`;
    }
    if (minutes > 0) return `${minutes} 分 ${seconds} 秒`;
    return `${seconds} 秒`;
}

function preview(text, limit) {
    const source = String(text || '');
    if (source.length <= limit) return source;
    const omitted = source.length - limit;
    return `${source.slice(0, limit)}\n...（已省略 ${omitted} 字；下次自然語言訊息會先壓縮後再送進 LLM）`;
}

module.exports = { handle };
