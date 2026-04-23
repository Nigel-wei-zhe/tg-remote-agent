const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 20480; // 20KB
const DEFAULT_LIMIT = 500;
const MAX_LINE_LENGTH = 2000;

const MAX_BYTES = Number.isFinite(Number(process.env.READ_FILE_MAX_BYTES))
    ? Math.max(1024, Math.floor(Number(process.env.READ_FILE_MAX_BYTES)))
    : DEFAULT_MAX_BYTES;

const definition = {
    type: 'function',
    function: {
        name: 'read_file',
        description: '讀取本地文字檔並回傳內容（含行號），適合把檔案丟給 LLM 分析或引用。支援 offset/limit 分段，長檔請用這個工具而不是 exec_shell 的 cat/head/tail。',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: '目標檔案路徑，可用絕對路徑或搭配 cwd 的相對路徑' },
                cwd: { type: 'string', description: '可選。解析相對 path 時的工作目錄；未提供則沿用 lazyhole 啟動目錄' },
                offset: { type: 'integer', description: '可選。起始行號（1-based），預設 1' },
                limit: { type: 'integer', description: `可選。讀取行數，預設 ${DEFAULT_LIMIT}` },
            },
            required: ['path'],
        },
    },
};

function resolveTarget(targetPath, cwd) {
    if (!targetPath) throw new Error('缺少 path');
    return path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(cwd || process.cwd(), targetPath);
}

function looksBinary(buffer) {
    const sample = buffer.slice(0, Math.min(buffer.length, 512));
    for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) return true;
    }
    return false;
}

function run(targetPath, options = {}) {
    try {
        const resolvedPath = resolveTarget(targetPath, options.cwd);
        const stat = fs.statSync(resolvedPath);
        if (stat.isDirectory()) {
            return { ok: false, body: `read_file 失敗：${resolvedPath} 是目錄，不是檔案。` };
        }

        const buffer = fs.readFileSync(resolvedPath);
        if (looksBinary(buffer)) {
            return { ok: false, body: `read_file 失敗：${resolvedPath} 看起來是二進位檔，無法以文字讀取。` };
        }

        const text = buffer.toString('utf8');
        const rawLines = text.split(/\r?\n/);
        const totalLines = text.endsWith('\n') && rawLines.length > 0
            ? rawLines.length - 1
            : rawLines.length;
        const lines = rawLines.slice(0, totalLines);

        const offset = Math.max(1, Math.floor(Number(options.offset) || 1));
        const limit = Math.max(1, Math.floor(Number(options.limit) || DEFAULT_LIMIT));
        const startIdx = offset - 1;

        if (startIdx >= lines.length) {
            return {
                ok: true,
                body: `檔案：${resolvedPath}\n總行數：${lines.length}\n（offset ${offset} 已超過檔案行數，無內容可讀）`,
                path: resolvedPath,
                totalLines: lines.length,
                bytes: 0,
            };
        }

        const endIdx = Math.min(lines.length, startIdx + limit);
        const selected = lines.slice(startIdx, endIdx);
        const formatted = selected
            .map((line, i) => {
                const lineNum = startIdx + i + 1;
                const trimmed = line.length > MAX_LINE_LENGTH
                    ? line.slice(0, MAX_LINE_LENGTH) + '…(行截斷)'
                    : line;
                return `${String(lineNum).padStart(6, ' ')}\t${trimmed}`;
            })
            .join('\n');

        let body = formatted;
        let truncated = false;
        if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
            const sliced = Buffer.from(body, 'utf8').slice(0, MAX_BYTES).toString('utf8');
            const lastNewline = sliced.lastIndexOf('\n');
            body = (lastNewline > 0 ? sliced.slice(0, lastNewline) : sliced)
                + `\n…(已達 ${MAX_BYTES} bytes 上限，截斷。可調整 READ_FILE_MAX_BYTES 或用 offset 續讀。)`;
            truncated = true;
        }

        const meta = `檔案：${resolvedPath}\n總行數：${lines.length}，本次讀取：${offset}-${endIdx}${truncated ? '（位元組截斷）' : ''}\n\n`;
        return {
            ok: true,
            body: meta + body,
            path: resolvedPath,
            totalLines: lines.length,
            bytes: Buffer.byteLength(body, 'utf8'),
            range: { offset, end: endIdx },
        };
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { ok: false, body: `read_file 失敗：檔案不存在（${err.path || targetPath}）` };
        }
        if (err.code === 'EACCES') {
            return { ok: false, body: `read_file 失敗：無權限讀取（${err.path || targetPath}）` };
        }
        return { ok: false, body: `read_file 失敗：${err.message}` };
    }
}

module.exports = { definition, run };
