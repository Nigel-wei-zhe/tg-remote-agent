const axios = require('axios');
const chalk = require('chalk');
const { logError } = require('./logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const TG_BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

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
    const html = formatTelegramHtml(text);
    await postTelegramMessage(
        'sendMessage',
        {
            chat_id: chatId,
            text: html,
            parse_mode: 'HTML',
        },
        { chat_id: chatId, text },
        'SEND',
    );
}

function startTyping(chatId) {
    const send = () => axios.post(`${TG_BASE()}/sendChatAction`, {
        chat_id: chatId,
        action: 'typing'
    }).catch(() => {});

    send();
    const interval = setInterval(send, 4000);
    return () => clearInterval(interval);
}

// 逐字串流：每 700ms 或 finalize 時 edit 一次訊息
function createStreamer(chatId) {
    let messageId = null;
    let buffer = '';
    let lastSent = '';
    let intervalPending = false;
    let chain = Promise.resolve();

    const doFlush = async (isFinal) => {
        if (!buffer) return;
        const rawText = buffer + (isFinal ? '' : ' ▌');
        const text = isFinal ? formatTelegramHtml(buffer) : rawText;
        if (text === lastSent) return;
        try {
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
        } catch (err) {
            if (!isFinal) return;
            const reason = err.response?.data?.description || err.message;
            logError('TG_EDIT_FINAL', reason);
            await new Promise((r) => setTimeout(r, 1200));
            try {
                if (!messageId) {
                    const res = await axios.post(`${TG_BASE()}/sendMessage`, { chat_id: chatId, text: buffer });
                    messageId = res.data?.result?.message_id;
                } else {
                    await axios.post(`${TG_BASE()}/editMessageText`, {
                        chat_id: chatId,
                        message_id: messageId,
                        text: buffer,
                    });
                }
                lastSent = buffer;
            } catch (err2) {
                logError('TG_EDIT_FINAL_RETRY', err2.response?.data?.description || err2.message);
            }
        }
    };

    const interval = setInterval(() => {
        if (intervalPending) return;
        intervalPending = true;
        chain = chain.then(() => { intervalPending = false; return doFlush(false); });
    }, 700);

    return {
        onToken: (chunk) => { buffer += chunk; },
        finalize: async () => {
            clearInterval(interval);
            chain = chain.then(() => doFlush(true));
            await chain;
            return buffer;
        },
        discard: () => { clearInterval(interval); },
    };
}

module.exports = { sendMessage, startTyping, createStreamer };
