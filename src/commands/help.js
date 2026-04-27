const chalk = require('chalk');
const { sendMessage } = require('../utils/telegram');
const { logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

function formatHelp() {
    return [
        'LazyHole-Agent 指令',
        '',
        '自然語言',
        '直接傳訊息給 Agent；它會依任務決定回覆、讀寫檔、查網頁或執行工具。',
        '',
        '/run <command>',
        '繞過 Agent 直接執行 shell 指令。',
        '範例：/run pwd',
        '範例：/run --cwd /tmp -- ls',
        '',
        '/memory',
        '查看目前 session、壓縮狀態與會注入 LLM 的記憶。',
        '',
        '/memory help',
        '查看記憶清除、歷史查詢與搜尋指令。',
        '',
        '/music <風格描述>',
        '先產歌詞再生成 MiniMax 音樂，回傳歌詞、時長與音檔。',
        '',
        '/music --instrumental <風格描述>',
        '生成純音樂。',
        '',
        '/help',
        '顯示這份功能總覽。',
    ].join('\n');
}

async function handle(chatId, text, sender, userId) {
    console.log(`${timestamp()} ${chalk.bgWhite.black(' HELP ')} ${chalk.dim(`@${sender}`)}`);
    logOp('user.message', { chatId, userId, sender, text, route: 'help' });

    const body = formatHelp();
    await sendMessage(chatId, body);
    logOp('bot.reply', { chatId, text: body, route: 'help' });
}

module.exports = { handle, formatHelp };
