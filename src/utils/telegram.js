const axios = require('axios');
const chalk = require('chalk');
const { logError } = require('./logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const TG_BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_SAFE_LIMIT = TELEGRAM_MESSAGE_LIMIT - 296;
const STREAM_CURSOR = ' ▌';
const STREAM_SAFE_LIMIT = TELEGRAM_SAFE_LIMIT - STREAM_CURSOR.length;
const FENCE_LINE_PATTERN = /^```([A-Za-z0-9_+.-]*)[ \t]*$/;

function isEntityParseError(reason) {
    return typeof reason === 'string' && reason.includes(`can't parse entities`);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatTelegramHtml(text) {
    const source = String(text ?? '');
    const parts = [];
    const fencePattern = /```([A-Za-z0-9_+.-]*)[ \t]*\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = fencePattern.exec(source)) !== null) {
        parts.push(escapeHtml(source.slice(lastIndex, match.index)));
        const lang = match[1] ? ` class="language-${escapeHtml(match[1])}"` : '';
        const code = escapeHtml(match[2].replace(/\n$/, ''));
        parts.push(`<pre><code${lang}>${code}</code></pre>`);
        lastIndex = fencePattern.lastIndex;
    }

    parts.push(escapeHtml(source.slice(lastIndex)));
    return parts.join('');
}

function getFenceLine(line) {
    const normalized = String(line ?? '').replace(/\n$/, '');
    const match = normalized.match(FENCE_LINE_PATTERN);
    if (!match) return null;
    return match[1] ? `\`\`\`${match[1]}` : '```';
}

function scanFenceLine(fenceLine, line) {
    const marker = getFenceLine(line);
    if (!marker) return fenceLine;
    return fenceLine ? null : marker;
}

function scanFenceState(text, initialFenceLine = null) {
    let fenceLine = initialFenceLine;
    const lines = String(text ?? '').match(/[^\n]*\n|[^\n]+/g) || [];
    for (const line of lines) fenceLine = scanFenceLine(fenceLine, line);
    return fenceLine;
}

function closingFenceSuffix(body, fenceLine) {
    if (!fenceLine) return '';
    return body.endsWith('\n') ? '```' : '\n```';
}

function decorateMarkdownChunk(raw, initialFenceLine = null) {
    const prefix = initialFenceLine ? `${initialFenceLine}\n` : '';
    const nextFenceLine = scanFenceState(raw, initialFenceLine);
    return prefix + raw + closingFenceSuffix(raw, nextFenceLine);
}

function splitOversizedLine(line, limit, initialFenceLine) {
    const prefix = initialFenceLine ? `${initialFenceLine}\n` : '';
    const suffix = closingFenceSuffix('', initialFenceLine);
    let take = Math.max(1, limit - prefix.length - suffix.length);
    take = Math.min(take, line.length);

    const lastCode = line.charCodeAt(take - 1);
    if (take > 1 && lastCode >= 0xd800 && lastCode <= 0xdbff) take -= 1;

    const raw = line.slice(0, take);
    const nextFenceLine = scanFenceState(raw, initialFenceLine);
    return {
        chunk: decorateMarkdownChunk(raw, initialFenceLine),
        consumed: raw.length,
        nextFenceLine,
    };
}

function splitFirstMarkdownChunk(text, limit, initialFenceLine = null) {
    const lines = String(text ?? '').match(/[^\n]*\n|[^\n]+/g) || [];
    let raw = '';
    let consumed = 0;
    let fenceLine = initialFenceLine;

    for (const line of lines) {
        const nextRaw = raw + line;
        const nextFenceLine = scanFenceLine(fenceLine, line);
        const nextChunk = decorateMarkdownChunk(nextRaw, initialFenceLine);

        if (nextChunk.length <= limit) {
            raw = nextRaw;
            consumed += line.length;
            fenceLine = nextFenceLine;
            continue;
        }

        if (!raw) return splitOversizedLine(line, limit, initialFenceLine);
        break;
    }

    return {
        chunk: decorateMarkdownChunk(raw, initialFenceLine),
        consumed,
        nextFenceLine: fenceLine,
    };
}

function splitTelegramText(text, limit = TELEGRAM_SAFE_LIMIT) {
    const source = String(text ?? '');
    if (!source) return [''];

    const chunks = [];
    let rest = source;
    let fenceLine = null;
    while (rest) {
        const { chunk, consumed, nextFenceLine } = splitFirstMarkdownChunk(rest, limit, fenceLine);
        if (!consumed) break;
        chunks.push(chunk);
        rest = rest.slice(consumed);
        fenceLine = nextFenceLine;
    }
    return chunks;
}

async function postTelegramMessage(method, payload, fallbackPayload, errorContext) {
    try {
        await axios.post(`${TG_BASE()}/${method}`, payload);
        return;
    } catch (err) {
        const reason = err.response ? err.response.data.description : err.message;
        if (isEntityParseError(reason)) {
            try {
                await axios.post(`${TG_BASE()}/${method}`, fallbackPayload);
                return;
            } catch (fallbackErr) {
                const fallbackReason = fallbackErr.response ? fallbackErr.response.data.description : fallbackErr.message;
                console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red('發送失敗: ' + fallbackReason)}`);
                logError(errorContext, `${reason} | fallback: ${fallbackReason}`);
                return;
            }
        }

        console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red('發送失敗: ' + reason)}`);
        logError(errorContext, reason);
    }
}

async function sendMessage(chatId, text) {
    for (const chunk of splitTelegramText(text)) {
        const html = formatTelegramHtml(chunk);
        await postTelegramMessage(
            'sendMessage',
            {
                chat_id: chatId,
                text: html,
                parse_mode: 'HTML',
            },
            { chat_id: chatId, text: chunk },
            'SEND',
        );
    }
}

function startChatAction(chatId, action = 'typing') {
    const send = () => axios.post(`${TG_BASE()}/sendChatAction`, {
        chat_id: chatId,
        action
    }).catch(() => {});

    send();
    const interval = setInterval(send, 4000);
    return () => clearInterval(interval);
}

function startTyping(chatId) {
    return startChatAction(chatId, 'typing');
}

async function sendAudio(chatId, audio, options = {}) {
    const payload = {
        chat_id: chatId,
        audio,
        caption: options.caption,
        title: options.title,
        performer: options.performer,
    };

    if (Buffer.isBuffer(audio)) {
        const form = new FormData();
        form.append('chat_id', String(chatId));
        form.append('audio', new Blob([audio], { type: options.mimeType || 'audio/mpeg' }), options.filename || 'audio.mp3');
        if (options.caption) form.append('caption', options.caption);
        if (options.title) form.append('title', options.title);
        if (options.performer) form.append('performer', options.performer);
        await axios.post(`${TG_BASE()}/sendAudio`, form);
        return;
    }

    await axios.post(`${TG_BASE()}/sendAudio`, payload);
}

// 逐字串流：每 700ms 或 finalize 時 edit 一次訊息
function createStreamer(chatId) {
    let messageId = null;
    let buffer = '';
    let liveBuffer = '';
    let liveFenceLine = null;
    let lastSent = '';
    let intervalPending = false;
    let chain = Promise.resolve();

    const sendLiveChunk = async (chunk, isFinal) => {
        const rawText = chunk + (isFinal ? '' : STREAM_CURSOR);
        const text = isFinal ? formatTelegramHtml(chunk) : rawText;
        if (text === lastSent) return;

        if (!messageId) {
            const res = await axios.post(`${TG_BASE()}/sendMessage`, {
                chat_id: chatId,
                text,
                ...(isFinal ? { parse_mode: 'HTML' } : {}),
            });
            messageId = res.data?.result?.message_id;
        } else {
            await axios.post(`${TG_BASE()}/editMessageText`, {
                chat_id: chatId,
                message_id: messageId,
                text,
                ...(isFinal ? { parse_mode: 'HTML' } : {}),
            });
        }
        lastSent = text;
    };

    const commitFullChunks = async () => {
        while (liveBuffer.length > STREAM_SAFE_LIMIT) {
            const { chunk, consumed, nextFenceLine } = splitFirstMarkdownChunk(liveBuffer, STREAM_SAFE_LIMIT, liveFenceLine);
            liveBuffer = liveBuffer.slice(consumed);
            liveFenceLine = nextFenceLine;

            try {
                await sendLiveChunk(chunk, true);
            } catch (err) {
                const reason = err.response?.data?.description || err.message;
                logError('TG_STREAM_CHUNK', reason);
                await axios.post(`${TG_BASE()}/sendMessage`, { chat_id: chatId, text: chunk });
            }

            messageId = null;
            lastSent = '';
        }
    };

    const doFlush = async (isFinal) => {
        if (!liveBuffer) return;
        await commitFullChunks();
        if (!liveBuffer) return;
        const chunk = isFinal
            ? decorateMarkdownChunk(liveBuffer, liveFenceLine)
            : (liveFenceLine ? `${liveFenceLine}\n${liveBuffer}` : liveBuffer);
        try {
            await sendLiveChunk(chunk, isFinal);
        } catch (err) {
            if (!isFinal) return;
            const reason = err.response?.data?.description || err.message;
            logError('TG_EDIT_FINAL', reason);
            await new Promise((r) => setTimeout(r, 1200));
            try {
                await sendLiveChunk(chunk, true);
            } catch (err2) {
                const retryReason = err2.response?.data?.description || err2.message;
                logError('TG_EDIT_FINAL_RETRY', retryReason);
                await axios.post(`${TG_BASE()}/sendMessage`, { chat_id: chatId, text: chunk })
                    .catch((err3) => logError('TG_EDIT_FINAL_FALLBACK', err3.response?.data?.description || err3.message));
            }
        }
    };

    const interval = setInterval(() => {
        if (intervalPending) return;
        intervalPending = true;
        chain = chain.then(() => { intervalPending = false; return doFlush(false); });
    }, 700);

    return {
        onToken: (chunk) => {
            buffer += chunk;
            liveBuffer += chunk;
        },
        finalize: async () => {
            clearInterval(interval);
            chain = chain.then(() => doFlush(true));
            await chain;
            return buffer;
        },
        discard: () => { clearInterval(interval); },
    };
}

module.exports = { sendMessage, sendAudio, startChatAction, startTyping, createStreamer };
