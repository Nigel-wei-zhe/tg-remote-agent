const axios = require('axios');
const TurndownService = require('turndown');

const TIMEOUT_MS = 15000;
const MAX_OUTPUT = 8000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.remove(['script', 'style', 'noscript', 'iframe', 'svg']);

const definition = {
    type: 'function',
    function: {
        name: 'web_fetch',
        description: '抓取網頁並回傳清理後的文字（HTML 轉 markdown）。用於研究、讀取文章、查資料。回傳上限 8000 字元，超過截斷。',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: '完整 URL，必須含 http/https' },
            },
            required: ['url'],
        },
    },
};

async function run(url) {
    try {
        const res = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
            maxRedirects: 5,
            responseType: 'text',
            transformResponse: [(d) => d],
        });
        const html = typeof res.data === 'string' ? res.data : String(res.data);
        let text = turndown.turndown(html).trim();
        text = text.replace(/\n{3,}/g, '\n\n');
        const truncated = text.length > MAX_OUTPUT
            ? text.slice(0, MAX_OUTPUT) + '\n...(已截斷)'
            : text;
        return { ok: true, text: truncated, status: res.status };
    } catch (err) {
        const reason = err.response ? `HTTP ${err.response.status}` : err.message;
        return { ok: false, text: `抓取失敗：${reason}`, status: err.response?.status };
    }
}

module.exports = { definition, run };
