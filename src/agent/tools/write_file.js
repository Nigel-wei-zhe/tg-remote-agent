const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 512000; // 500KB
const MAX_BYTES = Number.isFinite(Number(process.env.WRITE_FILE_MAX_BYTES))
    ? Math.max(1, Math.floor(Number(process.env.WRITE_FILE_MAX_BYTES)))
    : DEFAULT_MAX_BYTES;

const definition = {
    type: 'function',
    function: {
        name: 'write_file',
        description: '直接寫入文字檔。適合 markdown、json、程式碼、設定檔等已知內容；會自動建立父目錄。長內容寫檔優先使用此工具，不要把整段內容塞進 exec_shell heredoc。',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: '目標檔案路徑，可用絕對路徑，或搭配 cwd 的相對路徑' },
                content: { type: 'string', description: '要寫入的完整文字內容' },
                cwd: { type: 'string', description: '可選。解析相對 path 時的工作目錄；未提供則沿用 lazyhole 啟動目錄' },
            },
            required: ['path', 'content'],
        },
    },
};

function resolveTarget(targetPath, cwd) {
    if (!targetPath) throw new Error('缺少 path');
    return path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(cwd || process.cwd(), targetPath);
}

function run(targetPath, content, options = {}) {
    try {
        const text = String(content);
        const bytes = Buffer.byteLength(text, 'utf8');
        if (bytes > MAX_BYTES) {
            return { ok: false, body: `write_file 失敗：內容過大（${bytes} bytes），上限 ${MAX_BYTES} bytes。可調整 WRITE_FILE_MAX_BYTES。` };
        }

        const resolvedPath = resolveTarget(targetPath, options.cwd);
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, text, 'utf8');
        return {
            ok: true,
            body: `已寫入檔案：${resolvedPath}`,
            path: resolvedPath,
            bytes,
        };
    } catch (err) {
        return { ok: false, body: `write_file 失敗：${err.message}` };
    }
}

module.exports = { definition, run };
