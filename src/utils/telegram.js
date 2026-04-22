const axios = require('axios');
const chalk = require('chalk');
const { logError } = require('./logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const TG_BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

async function sendMessage(chatId, text) {
    try {
        await axios.post(`${TG_BASE()}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        const reason = err.response ? err.response.data.description : err.message;
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
    let dirty = false;
    let flushing = false;

    const flush = async (isFinal = false) => {
        if (!dirty || flushing || !buffer) return;
        flushing = true;
        const text = buffer + (isFinal ? '' : ' ▌');
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
            dirty = false;
        } catch { /* ignore rate-limit or "not modified" errors */ }
        flushing = false;
    };

    const interval = setInterval(() => flush(false), 700);

    return {
        onToken: (chunk) => { buffer += chunk; dirty = true; },
        finalize: async () => {
            clearInterval(interval);
            if (buffer) { dirty = true; await flush(true); }
            return buffer;
        },
        discard: () => { clearInterval(interval); },
    };
}

module.exports = { sendMessage, startTyping, createStreamer };
