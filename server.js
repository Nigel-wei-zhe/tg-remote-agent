#!/usr/bin/env node
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const Box = require('cli-box');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { logError, logOp } = require('./src/utils/logger');
const runCmd = require('./src/commands/run');
const memoryCmd = require('./src/commands/memory');
const agent = require('./src/agent');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID;

if (!TELEGRAM_TOKEN) {
    console.error(chalk.red.bold('❌ 錯誤：找不到 TELEGRAM_TOKEN！請檢查 .env 檔案。'));
    process.exit(1);
}
if (!ALLOWED_USER_ID) {
    console.error(chalk.red.bold('❌ 錯誤：找不到 TELEGRAM_ALLOWED_USER_ID！請在 .env 設定允許的 Telegram user id。'));
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

    if (text.startsWith('/run ')) {
        await runCmd.handle(chatId, text, sender, userId);
    } else if (text === '/memory' || text.startsWith('/memory ')) {
        await memoryCmd.handle(chatId, text, sender, userId);
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
    const b = Box({
        w: 50,
        h: 5,
        marks: {
            nw: '╭', n: '─', ne: '╮',
            e:  '│', se: '╯', s:  '─',
            sw: '╰', w: '│'
        }
    }, `\n${chalk.cyan.bold('🚀 TG Remote Agent')}\n\n${chalk.gray('AI agent with shell tool')}`);

    console.log(b);
    console.log();
    console.log(`  ${chalk.green('●')} ${chalk.bold('Status:')}  ${chalk.green('Polling Active')}`);
    console.log(`  ${chalk.magenta('●')} ${chalk.bold('Mode:')}    ${chalk.magenta('AI Agent')}`);
    console.log(`  ${chalk.blue('●')} ${chalk.bold('Allow:')}   ${chalk.blue(ALLOWED_USER_ID)}`);
    console.log(`  ${chalk.yellow('●')} ${chalk.bold('Exit:')}    ${chalk.yellow('Press "q" to quit')}`);
    console.log();
    console.log(chalk.gray('─'.repeat(52)));
    console.log();
}

if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
        if (key === 'q' || key === '\u0003') {
            console.log(`\n${timestamp()} 👋 ${chalk.yellow('已按下 q，程式結束。')}`);
            process.exit(0);
        }
    });
}

printBanner();
pollUpdates();
