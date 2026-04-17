const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 30000;
const MAX_OUTPUT = 3800;
const SETTINGS_PATH = path.join(__dirname, '..', '..', '..', 'setting.json');

const definition = {
    type: 'function',
    function: {
        name: 'exec_shell',
        description: '在伺服器上執行 shell 指令並回傳 stdout/stderr。30 秒逾時，輸出超過 3800 字截斷。',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: '要執行的 shell 指令' },
            },
            required: ['command'],
        },
    },
};

function loadBlocklist() {
    try {
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
        const bl = JSON.parse(raw)?.shell?.blocklist;
        if (!bl || bl.enabled === false) return [];
        return (bl.patterns || []).map((p) => ({
            regex: new RegExp(p.pattern),
            reason: p.reason || p.pattern,
        }));
    } catch (err) {
        console.warn(`[shell] 無法載入 setting.json 黑名單：${err.message}`);
        return [];
    }
}

const BLOCKLIST = loadBlocklist();

function findBlockReason(command) {
    for (const { regex, reason } of BLOCKLIST) {
        if (regex.test(command)) return reason;
    }
    return null;
}

function run(command) {
    const blocked = findBlockReason(command);
    if (blocked) {
        return Promise.resolve({
            ok: false,
            output: `⛔ 拒絕執行：匹配危險指令模式（${blocked}）`,
        });
    }
    return new Promise((resolve) => {
        exec(command, { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
            let output = stdout || stderr || '（無輸出）';
            let ok = true;
            if (error) {
                ok = false;
                const isTimeout = error.killed && error.signal === 'SIGTERM';
                output = isTimeout
                    ? `指令逾時（超過 30 秒）：${command}`
                    : `執行出錯:\n${error.message}`;
            }
            const truncated = output.length > MAX_OUTPUT
                ? output.slice(0, MAX_OUTPUT) + '\n...(已截斷)'
                : output;
            resolve({ ok, output: truncated });
        });
    });
}

module.exports = { definition, run };
