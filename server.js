#!/usr/bin/env node
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const Box = require('cli-box');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { sendMessage } = require('./src/utils/telegram');
const { logError } = require('./src/utils/logger');
const runCmd = require('./src/commands/run');
const askCmd = require('./src/commands/ask');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
    console.error(chalk.red.bold('❌ 錯誤：找不到 TELEGRAM_TOKEN！請檢查 .env 檔案。'));
    process.exit(1);
}

let lastUpdateId = 0;
const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

async function handleUpdate(update) {
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        const sender = update.message.from.username || update.message.from.first_name || 'Unknown';

        if (text.startsWith('/ask ')) {
            await askCmd.handle(chatId, text, sender);
        } else if (text.startsWith('/run ')) {
            runCmd.handle(chatId, text, sender);
        } else {
            sendMessage(chatId, '收到！請使用 `/run <指令>` 執行指令，或 `/ask <問題>` 詢問 AI。');
        }
    }
}

async function pollUpdates() {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates`, {
            params: { offset: lastUpdateId + 1, timeout: 30 }
        });

        for (const update of response.data.result) {
            lastUpdateId = update.update_id;
            await handleUpdate(update);
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
    }, `\n${chalk.cyan.bold('🚀 TG Remote Agent')}\n\n${chalk.gray('Secure remote execution agent')}`);

    console.log(b);
    console.log();
    console.log(`  ${chalk.green('●')} ${chalk.bold('Status:')}  ${chalk.green('Polling Active')}`);
    console.log(`  ${chalk.magenta('●')} ${chalk.bold('Mode:')}    ${chalk.magenta('Command Execution')}`);
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
