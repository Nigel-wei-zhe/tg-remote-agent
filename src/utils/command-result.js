const path = require('path');

function pickMatch(groups = []) {
    for (const value of groups) {
        if (value) return value;
    }
    return '';
}

function resolveOutputPath(rawPath, cwd) {
    if (!rawPath) return '';
    if (path.isAbsolute(rawPath)) return rawPath;
    return path.resolve(cwd || process.cwd(), rawPath);
}

function extractOutputPath(command, cwd) {
    const patterns = [
        /cat\s*>\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*<</,
        /tee\s+(?:-a\s+)?(?:"([^"]+)"|'([^']+)'|(\S+))/,
        /(?:^|\s)>\s*(?:"([^"]+)"|'([^']+)'|(\S+))/,
        /(?:^|\s)>>\s*(?:"([^"]+)"|'([^']+)'|(\S+))/,
    ];

    for (const pattern of patterns) {
        const match = command.match(pattern);
        if (!match) continue;
        const rawPath = pickMatch(match.slice(1));
        if (rawPath && !rawPath.startsWith('&')) {
            return resolveOutputPath(rawPath, cwd);
        }
    }
    return '';
}

function isLikelyWriteCommand(command) {
    return /cat\s*>|tee\s+|(^|\s)>>|(^|\s)>\s*(?:"|'|\/|\.{0,2}\/|\w)/.test(command);
}

function isShortAckOutput(output) {
    const text = String(output || '').trim();
    if (!text || text === '（無輸出）') return true;
    if (text.length > 200) return false;
    return /(已存檔|saved|written|created|完成|success|成功)/i.test(text);
}

function shouldUseConciseSuccess(command, output) {
    return isLikelyWriteCommand(command) && isShortAckOutput(output);
}

function formatCommandSuccess({ command, cwd, output }) {
    if (shouldUseConciseSuccess(command, output)) {
        const outputPath = extractOutputPath(command, cwd);
        const lines = ['✅ 任務完成'];
        if (outputPath) {
            lines.push(`📄 檔案: ${outputPath}`);
            lines.push(`📁 目錄: ${path.dirname(outputPath)}`);
        } else if (cwd) {
            lines.push(`📁 目錄: ${cwd}`);
        }
        lines.push('請到存放目錄查看結果。');
        return lines.join('\n');
    }

    const cwdLine = cwd ? `\n📁 cwd: \`${cwd}\`` : '';
    return `💻 指令執行結果${cwdLine}\n\`\`\`\n${output}\n\`\`\``;
}

module.exports = { formatCommandSuccess };
