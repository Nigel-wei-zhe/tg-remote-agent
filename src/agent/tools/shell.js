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
        description: '在伺服器上執行 shell 指令並回傳 stdout/stderr。30 秒逾時，輸出超過 3800 字截斷。預設作為中間步驟，Telegram 只顯示簡短進度，完整結果回到 LLM 繼續下一輪。只有當這個指令結果就是最終要呈現給使用者的答案時，才帶 final:true；指令失敗、搜尋型空輸出、或同輪還有其他 tool 結果待消化時，仍會回到 LLM 續跑。',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: '要執行的 shell 指令' },
                cwd: { type: 'string', description: '可選。執行指令時使用的工作目錄；未提供則沿用 lazyhole 啟動時的工作目錄。' },
                final: { type: 'boolean', description: '可選。true=這個成功結果就是最終要給使用者看的答案，可直接呈現並結束；預設 false=中間步驟，結果只給 LLM 續跑下一輪。' },
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

function resolveCwd(cwd) {
    if (!cwd) return { ok: true, cwd: undefined };

    const resolved = path.resolve(cwd);
    try {
        const stat = fs.statSync(resolved);
        if (!stat.isDirectory()) {
            return { ok: false, output: `指定的 cwd 不是目錄：${resolved}` };
        }
        return { ok: true, cwd: resolved };
    } catch (err) {
        return { ok: false, output: `指定的 cwd 不存在或無法存取：${resolved}` };
    }
}

function run(command, options = {}) {
    const blocked = findBlockReason(command);
    if (blocked) {
        return Promise.resolve({
            ok: false,
            output: `⛔ 拒絕執行：匹配危險指令模式（${blocked}）`,
        });
    }

    const cwdResult = resolveCwd(options.cwd);
    if (!cwdResult.ok) {
        return Promise.resolve({
            ok: false,
            output: cwdResult.output,
        });
    }

    return new Promise((resolve) => {
        exec(command, { timeout: TIMEOUT_MS, cwd: cwdResult.cwd }, (error, stdout, stderr) => {
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
            resolve({ ok, output: truncated, cwd: cwdResult.cwd });
        });
    });
}

module.exports = { definition, run };
