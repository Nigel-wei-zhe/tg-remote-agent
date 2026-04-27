const llm = require('../llm');
const sessionStore = require('./session');
const memoryDb = require('./memory-db');
const { renderSessionPrompt } = require('./session-prompt');
const { logError, logOp } = require('./logger');

function hasArchivableContent(data) {
    if (!data) return false;
    if (data.activeSkill) return true;
    if (Object.keys(data.locked || {}).length > 0) return true;
    return (data.history || []).some((item) => String(item.content || '').trim());
}

function getStats(data) {
    const history = Array.isArray(data.history) ? data.history : [];
    const locked = data.locked || {};
    return {
        rawChars: JSON.stringify({
            activeSkill: data.activeSkill || null,
            locked,
            history,
        }).length,
        historyCount: history.length,
        lockedKeys: Object.keys(locked),
    };
}

async function summarizeSession(data, trigger) {
    const prompt = renderSessionPrompt(data).trim();
    const stats = getStats(data);
    const reply = await llm.chat({
        messages: [
            {
                role: 'system',
                content:
                    '你負責把 Telegram AI agent 的已結束 session 歸檔成長期記憶。請保留任務目標、使用者偏好、重要決策、已完成事項、未完成事項與可供未來查找的關鍵詞。刪除寒暄、重複與低價值中間步驟。只輸出繁體中文摘要，不要使用 Markdown 標題。',
            },
            {
                role: 'user',
                content: [
                    `歸檔觸發：${trigger}`,
                    `activeSkill：${data.activeSkill || '無'}`,
                    `lockedKeys：${stats.lockedKeys.join(', ') || '無'}`,
                    '',
                    '請將以下 session 壓縮成 800 字內的長期記憶摘要：',
                    prompt || JSON.stringify(data, null, 2),
                ].join('\n'),
            },
        ],
    });
    return (reply.content || '').trim();
}

async function notify(onProgress, stage, payload = {}) {
    if (typeof onProgress === 'function') await onProgress({ stage, ...payload });
}

async function archiveSessionData(data, { trigger, userId, onProgress } = {}) {
    if (!hasArchivableContent(data)) return { archived: false, reason: 'empty' };

    const now = new Date().toISOString();
    const stats = getStats(data);
    await notify(onProgress, 'summarizing', {
        trigger: trigger || 'manual',
        rawChars: stats.rawChars,
        historyCount: stats.historyCount,
    });
    const summary = await summarizeSession(data, trigger || 'manual');
    if (!summary) throw new Error('session 歸檔失敗：LLM 沒有回傳摘要');

    await notify(onProgress, 'writing', {
        trigger: trigger || 'manual',
        summaryChars: summary.length,
    });
    const id = memoryDb.insertArchive({
        sessionId: data.sessionId,
        chatId: data.chatId,
        userId,
        startedAt: data.startedAt,
        endedAt: data.updatedAt || now,
        archivedAt: now,
        trigger: trigger || 'manual',
        activeSkill: data.activeSkill || null,
        category: null,
        summary,
        rawChars: stats.rawChars,
        historyCount: stats.historyCount,
        metadataJson: JSON.stringify({
            lockedKeys: stats.lockedKeys,
            compactTriggerChars: sessionStore.COMPACT_TRIGGER_CHARS,
            archivedBy: 'lazyhole-agent',
        }),
    });

    await notify(onProgress, 'done', {
        id,
        trigger: trigger || 'manual',
        summaryChars: summary.length,
    });
    logOp('session.archive.done', {
        id,
        chatId: data.chatId,
        sessionId: data.sessionId,
        trigger,
        summaryChars: summary.length,
        rawChars: stats.rawChars,
        historyCount: stats.historyCount,
    });
    return { archived: true, id, summary };
}

async function archiveCurrentSession(chatId, { trigger, userId, clear = true, onProgress } = {}) {
    const data = sessionStore.loadSessionAny(chatId);
    if (!data) return { archived: false, reason: 'missing' };
    const result = await archiveSessionData(data, { trigger, userId, onProgress });
    if (clear) sessionStore.clearSession(chatId);
    return result;
}

async function archiveExpiredSession(chatId, { userId, onProgress } = {}) {
    const data = sessionStore.loadSessionAny(chatId);
    if (!data || !sessionStore.isExpired(data)) return { archived: false, reason: 'not_expired' };

    try {
        await notify(onProgress, 'ttl_detected', { trigger: 'ttl' });
        const result = await archiveSessionData(data, { trigger: 'ttl', userId, onProgress });
        sessionStore.clearSession(chatId);
        return result;
    } catch (err) {
        logError('SESSION_ARCHIVE_TTL', err.message);
        const preservedPath = sessionStore.preserveSession(chatId, err.message);
        await notify(onProgress, 'failed', { trigger: 'ttl', reason: err.message, preservedPath });
        return { archived: false, reason: err.message, preservedPath, error: err };
    }
}

module.exports = {
    archiveCurrentSession,
    archiveExpiredSession,
    archiveSessionData,
};
