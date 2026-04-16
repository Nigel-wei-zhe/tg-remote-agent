#!/usr/bin/env node
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const Box = require('cli-box');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
    console.error(chalk.red.bold('❌ 錯誤：找不到 TELEGRAM_TOKEN！請檢查 .env 檔案。'));
    process.exit(1);
}

let lastUpdateId = 0;

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

function logError(context, message) {
    const logDir = path.join(__dirname, 'log');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(logDir, `${date}.log`);
    const line = `[${new Date().toLocaleTimeString()}] [${context}] ${message}\n`;
    fs.appendFileSync(file, line);
}

/**
 * 處理訊息
 */
async function handleUpdate(update) {
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        const sender = update.message.from.username || update.message.from.first_name || 'Unknown';

        if (text.startsWith('/run ')) {
            const command = text.replace('/run ', '');
            console.log(`${timestamp()} ${chalk.bgYellow.black(' RUN ')} ${chalk.yellow(command)} ${chalk.dim(`@${sender}`)}`);

            exec(command, (error, stdout, stderr) => {
                let output = stdout || stderr || '（無輸出）';
                if (error) {
                    console.log(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(error.message.split('\n')[0])}`);
                    logError(`RUN:${command}`, error.message);
                    output = `執行出錯:\n${error.message}`;
                } else {
                    console.log(`${timestamp()} ${chalk.bgGreen.black(' OK  ')} ${chalk.dim(output.split('\n')[0].slice(0, 60))}`);
                }
                const truncated = output.length > 3800 ? output.slice(0, 3800) + '\n...(已截斷)' : output;
                sendTelegramMessage(chatId, `💻 指令執行結果:\n\`\`\`\n${truncated}\n\`\`\``);
            });
        } else {
            sendTelegramMessage(chatId, '收到！請使用 `/run <指令>` 執行指令。');
        }
    }
}

/**
 * 傳送訊息
 */
async function sendTelegramMessage(chat_id, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id,
            text,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        const reason = err.response ? err.response.data.description : err.message;
        console.error(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red('發送失敗: ' + reason)}`);
        logError('SEND', reason);
    }
}

/**
 * 長輪詢 (Long Polling)
 */
async function pollUpdates() {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates`, {
            params: {
                offset: lastUpdateId + 1,
                timeout: 30
            }
        });

        const updates = response.data.result;
        for (const update of updates) {
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

// 啟動畫面 UI
function printBanner() {
    console.clear();
    const b = Box({
        w: 50,
        h: 5,
        marks: {
            nw: '╭', n:  '─', ne: '╮',
            e:  '│', se: '╯', s:  '─',
            sw: '╰', w:  '│'
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

// 按 q 離開
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
