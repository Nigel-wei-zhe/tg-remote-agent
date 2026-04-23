const axios = require('axios');
const chalk = require('chalk');
const { logError } = require('./logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const TG_BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

function isEntityParseError(reason) {
    return typeof reason === 'string' && reason.includes(`can't parse entities`);
}

async function sendMessage(chatId, text) {
    try {
        await axios.post(`${TG_BASE()}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        const reason = err.response ? err.response.data.description : err.message;
        if (isEntityParseError(reason)) {
            try {
                await axios.post(`${TG_BASE()}/sendMessage`, {
                    chat_id: chatId,
                    text,
                });
                return;
            } catch (fallbackErr) {
                const fallbackReason = fallbackErr.response ? fallbackErr.response.data.description : fallbackErr.message;
                console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red('發送失敗: ' + fallbackReason)}`);
                logError('SEND', `${reason} | fallback: ${fallbackReason}`);
                return;
            }
        }

        console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red('發送失敗: ' + reason)}`);
        logError('SEND', reason);
    }
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
        const text = buffer + (isFinal ? '' : ' ▌');
        if (text === lastSent) return;
        try {
            if (!messageId) {
                const res = await axios.post(`${TG_BASE()}/sendMessage`, { chat_id: chatId, text });
                messageId = res.data?.result?.message_id;
            } else {
                await axios.post(`${TG_BASE()}/editMessageText`, {
                    chat_id: chatId,
                    message_id: messageId,
                    text,
                });
            }
            lastSent = text;
        } catch (err) {
            if (!isFinal) return;
            const reason = err.response?.data?.description || err.message;
            logError('TG_EDIT_FINAL', reason);
            await new Promise((r) => setTimeout(r, 1200));
            try {
                await axios.post(`${TG_BASE()}/editMessageText`, {
                    chat_id: chatId,
                    message_id: messageId,
                    text,
                });
                lastSent = text;
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
