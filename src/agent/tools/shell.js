const { exec } = require('child_process');

const TIMEOUT_MS = 30000;
const MAX_OUTPUT = 3800;

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

function run(command) {
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
