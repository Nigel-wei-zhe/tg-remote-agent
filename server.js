#!/usr/bin/env node
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const Box = require('cli-box');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { logError, logOp } = require('./src/utils/logger');
const runCmd = require('./src/commands/run');
const memoryCmd = require('./src/commands/memory');
const musicCmd = require('./src/commands/music');
const helpCmd = require('./src/commands/help');
const agent = require('./src/agent');

const APP_NAME = 'LazyHole-Agent';
const APP_COMMAND = 'lazyhole';
const BANNER_WIDTH = 76;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID;

if (!TELEGRAM_TOKEN) {
    console.error(chalk.red.bold(`[${APP_NAME}] 找不到 TELEGRAM_TOKEN，請檢查 .env 檔案。`));
    process.exit(1);
}
if (!ALLOWED_USER_ID) {
    console.error(chalk.red.bold(`[${APP_NAME}] 找不到 TELEGRAM_ALLOWED_USER_ID，請在 .env 設定允許的 Telegram user id。`));
    process.exit(1);
}

let lastUpdateId = 0;
const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

async function handleUpdate(update) {
    if (!update.message || !update.message.text) return;

    const { chat, from, text } = update.message;
    const chatId = chat.id;
    const userId = String(from.id);
    const sender = from.username || from.first_name || 'Unknown';

    if (userId !== String(ALLOWED_USER_ID)) {
        logOp('auth.blocked', { userId, sender, chatId, text });
        console.log(`${timestamp()} ${chalk.bgRed.white(' DENY ')} ${chalk.red(`@${sender} (${userId})`)}`);
        return;
    }

    if (text === '/help' || text.startsWith('/help ')) {
        await helpCmd.handle(chatId, text, sender, userId);
    } else if (text.startsWith('/run ')) {
        await runCmd.handle(chatId, text, sender, userId);
    } else if (text === '/memory' || text.startsWith('/memory ')) {
        await memoryCmd.handle(chatId, text, sender, userId);
    } else if (text === '/music' || text.startsWith('/music ')) {
        await musicCmd.handle(chatId, text, sender, userId);
    } else {
        await agent.handle(chatId, text, sender, userId);
    }
}

async function pollUpdates() {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates`, {
            params: { offset: lastUpdateId + 1, timeout: 30 }
        });

        const updates = response.data.result;
        if (updates.length > 0) {
            lastUpdateId = updates[updates.length - 1].update_id;
            updates.forEach(update => handleUpdate(update));
        }
    } catch (err) {
        const reason = err.response ? err.response.data.description : err.message;
        console.error(`${timestamp()} ${chalk.bgRed.white(' POLL ERR ')} ${chalk.red('輪詢失敗: ' + reason)}`);
        logError('POLL', reason);
    }

    setTimeout(pollUpdates, 1000);
}

function printBanner() {
    console.clear();
    const pill = (style, label) => style(` ${label} `);
    const b = Box({
        w: BANNER_WIDTH,
        h: 9,
        marks: {
            nw: '╭', n: '─', ne: '╮',
            e:  '│', se: '╯', s:  '─',
            sw: '╰', w: '│'
        }
    }, [
        '',
        chalk.hex('#f59e0b').bold(APP_NAME),
        chalk.gray('Telegram AI operations console for shell and web tasks'),
        '',
        `${pill(chalk.bgGreen.black.bold, 'ONLINE')} ${chalk.green('Polling active')}   ${pill(chalk.bgMagenta.white.bold, 'MODE')} ${chalk.magenta('AI Agent')}`,
        `${pill(chalk.bgBlue.white.bold, 'ALLOW')} ${chalk.blue(ALLOWED_USER_ID)}   ${pill(chalk.bgYellow.black.bold, 'CLI')} ${chalk.yellow(APP_COMMAND)}`,
        `${pill(chalk.bgCyan.black.bold, 'TRANSPORT')} ${chalk.cyan('Telegram polling')}   ${pill(chalk.bgWhite.black.bold, 'EXIT')} ${chalk.white('q / Ctrl+C')}`,
    ].join('\n'));

    console.log(b);
    console.log();
    console.log(chalk.gray(`  Live Event Stream  ${'─'.repeat(56)}`));
    console.log();
}

if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
        if (key === 'q' || key === '\u0003') {
            console.log(`\n${timestamp()} ${chalk.bgWhite.black(' EXIT ')} ${chalk.yellow(`${APP_NAME} stopped.`)}`);
            process.exit(0);
        }
    });
}

printBanner();
pollUpdates();
