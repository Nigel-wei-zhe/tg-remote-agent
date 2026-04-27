const LOCKED_PREVIEW_CHARS = 300;

function renderSessionPrompt(session) {
    if (!session) return '';
    const lines = ['\n\n[對話狀態]'];
    if (session.activeSkill) lines.push(`當前進行中的 skill: ${session.activeSkill}`);

    const locked = session.locked || {};
    const { summary, ...otherLocked } = locked;

    if (summary) {
        lines.push(`任務摘要 (summary): ${summary}`);
    }

    const lockedKeys = Object.keys(otherLocked);
    if (lockedKeys.length > 0) {
        lines.push('已鎖定欄位 (locked):');
        for (const k of lockedKeys) {
            const v = otherLocked[k];
            const preview =
                typeof v === 'string'
                    ? v.length > LOCKED_PREVIEW_CHARS
                        ? `${v.slice(0, LOCKED_PREVIEW_CHARS)}…`
                        : v
                    : JSON.stringify(v);
            lines.push(`  ${k}: ${preview}`);
        }
    }

    if ((session.history || []).length > 0) {
        lines.push(
            summary ? '最近原始對話 (補充參考，舊→新):' : '最近對話 (舊→新):',
        );
        for (const h of session.history) lines.push(`  ${h.role}: ${h.content}`);
    }

    lines.push(
        '若以上區塊存在，優先把用戶訊息理解為對該狀態的延續回應；任務完成或用戶明確取消時呼叫 end_session。',
    );
    return lines.join('\n');
}

module.exports = { LOCKED_PREVIEW_CHARS, renderSessionPrompt };
